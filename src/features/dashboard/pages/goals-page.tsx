import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Flag,
  FolderKanban,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  UserRound,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/context/auth-context'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type GoalStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
type GoalHealth = 'on_track' | 'at_risk' | 'off_track'
type MetricType = 'percentage' | 'number' | 'currency' | 'boolean'
type MetricCadence = 'weekly' | 'monthly'
type KrSource = 'manual' | 'auto'
type LinkType = 'project' | 'task'
type DetailPanelMode = 'overview' | 'checkin'
type HealthFilter = 'all' | GoalHealth
type OwnerFilter = 'all' | 'mine' | 'unowned'

type GoalRow = {
  id: string
  title: string
  description: string | null
  owner_id: string | null
  cycle: string
  status: GoalStatus
  health: GoalHealth
  confidence: number | null
  department: string | null
  due_at: string | null
  created_at: string
}

type KrRow = {
  id: string
  goal_id: string
  title: string
  metric_type: MetricType
  baseline_value: number | null
  current_value: number | null
  target_value: number | null
  unit: string | null
  cadence: MetricCadence
  due_at: string | null
  owner_id: string | null
  source: KrSource
  allow_over_target: boolean | null
}

type CheckinRow = {
  id: string
  goal_id: string
  author_id: string | null
  progress_delta: number | null
  confidence: number | null
  blockers: string | null
  next_actions: string | null
  created_at: string
}

type LinkRow = {
  id: string
  goal_id: string
  link_type: LinkType
  project_id: string | null
  task_id: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  department: string | null
  role_label: string | null
}

type ProjectRow = {
  id: string
  name: string | null
  status: string | null
}

type TaskRow = {
  id: string
  title: string | null
  status: string | null
  project_id: string | null
  completed_at: string | null
}

type GoalStatePayload = {
  goals: GoalRow[]
  keyResults: KrRow[]
  checkins: CheckinRow[]
  links: LinkRow[]
  profiles: ProfileRow[]
  projects: ProjectRow[]
  tasks: TaskRow[]
}

const GOALS_CACHE_KEY = 'contas.goals.page.v1'
const GOALS_ONBOARDING_KEY = 'contas.goals.onboarding.completed.v1'

const GOALS_ONBOARDING_STEPS = [
  {
    title: 'Pick your cycle',
    description: 'Start by selecting a quarter so leadership views and summaries focus on the right period.',
    target: 'header',
  },
  {
    title: 'Create your first goal',
    description: 'Add the goal title, owner, department, confidence, and due date to define clear accountability.',
    target: 'create',
  },
  {
    title: 'Scan the portfolio',
    description: 'The main board should stay lightweight so leaders can review progress and open details only when action is needed.',
    target: 'main',
  },
  {
    title: 'Watch the decision rail',
    description: 'Needs attention and recent updates should help you focus the weekly operating rhythm.',
    target: 'rail',
  },
  {
    title: 'Update from the detail view',
    description: 'Use the detail drawer to add check-ins, adjust KR progress, and connect execution work.',
    target: 'actions',
  },
] as const

function readCachedGoalsState(): GoalStatePayload | null {
  try {
    const raw = localStorage.getItem(GOALS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GoalStatePayload
    if (!Array.isArray(parsed.goals)) return null
    if (!Array.isArray(parsed.keyResults)) return null
    if (!Array.isArray(parsed.checkins)) return null
    if (!Array.isArray(parsed.links)) return null
    if (!Array.isArray(parsed.profiles)) return null
    if (!Array.isArray(parsed.projects)) return null
    if (!Array.isArray(parsed.tasks)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCachedGoalsState(payload: GoalStatePayload) {
  localStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(payload))
}

function formatHealthLabel(value: GoalHealth) {
  if (value === 'on_track') return 'On track'
  if (value === 'at_risk') return 'At risk'
  return 'Off track'
}

function formatStatusLabel(value: GoalStatus) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function statusTone(value: GoalStatus) {
  switch (value) {
    case 'completed':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    case 'paused':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-300'
    case 'draft':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-300'
    case 'archived':
      return 'border-white/10 bg-white/[0.04] text-muted-foreground'
    default:
      return 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
  }
}

function healthTone(value: GoalHealth) {
  switch (value) {
    case 'on_track':
      return 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300'
    case 'at_risk':
      return 'border-amber-500/30 bg-amber-500/12 text-amber-300'
    default:
      return 'border-rose-500/30 bg-rose-500/12 text-rose-300'
  }
}

function progressBarTone(value: GoalHealth) {
  switch (value) {
    case 'on_track':
      return 'bg-emerald-400'
    case 'at_risk':
      return 'bg-amber-400'
    default:
      return 'bg-rose-400'
  }
}

function safeNumber(value: number | null | undefined, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return value
}

function calculateKrProgress(kr: KrRow, autoPercent?: number) {
  if (kr.source === 'auto' && typeof autoPercent === 'number') return Math.max(0, Math.min(100, Math.round(autoPercent)))

  const baseline = safeNumber(kr.baseline_value)
  const current = safeNumber(kr.current_value)
  const target = safeNumber(kr.target_value)

  if (kr.metric_type === 'boolean') {
    return current >= target ? 100 : 0
  }

  const delta = target - baseline
  if (delta === 0) return current >= target ? 100 : 0

  const percent = ((current - baseline) / delta) * 100
  if (kr.allow_over_target) return Math.round(Math.max(0, percent))
  return Math.round(Math.max(0, Math.min(100, percent)))
}

function getCurrentQuarterCycle() {
  const now = new Date()
  const quarter = Math.floor(now.getMonth() / 3) + 1
  return `Q${quarter} ${now.getFullYear()}`
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'No date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed)
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return 'Just now'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Just now'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Just now'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Just now'

  const diffMs = Date.now() - parsed.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes < 60) return `${Math.max(diffMinutes, 1)}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDateLabel(value)
}

function daysSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24))
}

function metricTypeLabel(value: MetricType) {
  switch (value) {
    case 'percentage':
      return 'Percent'
    case 'currency':
      return 'Currency'
    case 'boolean':
      return 'Milestone'
    default:
      return 'Number'
  }
}

function formatMetricValue(value: number | null, metricType: MetricType, unit?: string | null) {
  const numeric = safeNumber(value)
  if (metricType === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: unit || 'USD', maximumFractionDigits: 0 }).format(numeric)
  if (metricType === 'percentage') return `${numeric}%`
  if (metricType === 'boolean') return numeric >= 1 ? 'Done' : 'Pending'
  return `${numeric}${unit ? ` ${unit}` : ''}`
}

export function GoalsPage() {
  const { currentUser } = useAuth()

  const cached = readCachedGoalsState()
  const [goals, setGoals] = useState<GoalRow[]>(cached?.goals ?? [])
  const [keyResults, setKeyResults] = useState<KrRow[]>(cached?.keyResults ?? [])
  const [checkins, setCheckins] = useState<CheckinRow[]>(cached?.checkins ?? [])
  const [links, setLinks] = useState<LinkRow[]>(cached?.links ?? [])
  const [profiles, setProfiles] = useState<ProfileRow[]>(cached?.profiles ?? [])
  const [projects, setProjects] = useState<ProjectRow[]>(cached?.projects ?? [])
  const [tasks, setTasks] = useState<TaskRow[]>(cached?.tasks ?? [])
  const [loading, setLoading] = useState(() => !cached)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [currentTimestamp] = useState(() => Date.now())

  const [selectedCycle, setSelectedCycle] = useState(getCurrentQuarterCycle())
  const [search, setSearch] = useState('')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [detailMode, setDetailMode] = useState<DetailPanelMode>('overview')

  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalDescription, setNewGoalDescription] = useState('')
  const [newGoalOwnerId, setNewGoalOwnerId] = useState('')
  const [newGoalDepartment, setNewGoalDepartment] = useState('')
  const [newGoalConfidence, setNewGoalConfidence] = useState('7')
  const [newGoalDueAt, setNewGoalDueAt] = useState('')

  const [krDraftByGoal, setKrDraftByGoal] = useState<Record<string, { title: string; metricType: MetricType; target: string; source: KrSource }>>({})
  const [checkinDraftByGoal, setCheckinDraftByGoal] = useState<Record<string, { blockers: string; nextActions: string; confidence: string }>>({})
  const [linkDraftByGoal, setLinkDraftByGoal] = useState<Record<string, { linkType: LinkType; targetId: string }>>({})
  const [onboardingStep, setOnboardingStep] = useState<number>(() => {
    const completed = localStorage.getItem(GOALS_ONBOARDING_KEY) === 'true'
    return completed ? -1 : 0
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [goalsResult, keyResultsResult, checkinsResult, linksResult, profilesResult, projectsResult, tasksResult] = await Promise.all([
        supabase.from('goals').select('id,title,description,owner_id,cycle,status,health,confidence,department,due_at,created_at').order('created_at', { ascending: false }),
        supabase.from('goal_key_results').select('id,goal_id,title,metric_type,baseline_value,current_value,target_value,unit,cadence,due_at,owner_id,source,allow_over_target').order('created_at', { ascending: false }),
        supabase.from('goal_checkins').select('id,goal_id,author_id,progress_delta,confidence,blockers,next_actions,created_at').order('created_at', { ascending: false }),
        supabase.from('goal_links').select('id,goal_id,link_type,project_id,task_id').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id,full_name,department,role_label').order('full_name', { ascending: true }),
        supabase.from('projects').select('id,name,status').order('name', { ascending: true }),
        supabase.from('tasks').select('id,title,status,project_id,completed_at').order('created_at', { ascending: false }),
      ])

      const payload: GoalStatePayload = {
        goals: (goalsResult.data as GoalRow[] | null) ?? [],
        keyResults: (keyResultsResult.data as KrRow[] | null) ?? [],
        checkins: (checkinsResult.data as CheckinRow[] | null) ?? [],
        links: (linksResult.data as LinkRow[] | null) ?? [],
        profiles: (profilesResult.data as ProfileRow[] | null) ?? [],
        projects: (projectsResult.data as ProjectRow[] | null) ?? [],
        tasks: (tasksResult.data as TaskRow[] | null) ?? [],
      }

      setGoals(payload.goals)
      setKeyResults(payload.keyResults)
      setCheckins(payload.checkins)
      setLinks(payload.links)
      setProfiles(payload.profiles)
      setProjects(payload.projects)
      setTasks(payload.tasks)
      writeCachedGoalsState(payload)
      setLoading(false)
    }

    void load()

    const onRealtimeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail
      if (!detail?.table) return
      if (!['goals', 'goal_key_results', 'goal_checkins', 'goal_links', 'projects', 'tasks', 'profiles'].includes(detail.table)) return
      void load()
    }

    window.addEventListener('contas:realtime-change', onRealtimeChange as EventListener)
    return () => {
      window.removeEventListener('contas:realtime-change', onRealtimeChange as EventListener)
    }
  }, [])

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const keyResultsByGoal = useMemo(() => {
    const map = new Map<string, KrRow[]>()
    for (const kr of keyResults) {
      const current = map.get(kr.goal_id) ?? []
      current.push(kr)
      map.set(kr.goal_id, current)
    }
    return map
  }, [keyResults])
  const linksByGoal = useMemo(() => {
    const map = new Map<string, LinkRow[]>()
    for (const link of links) {
      const current = map.get(link.goal_id) ?? []
      current.push(link)
      map.set(link.goal_id, current)
    }
    return map
  }, [links])
  const checkinsByGoal = useMemo(() => {
    const map = new Map<string, CheckinRow[]>()
    for (const checkin of checkins) {
      const current = map.get(checkin.goal_id) ?? []
      current.push(checkin)
      map.set(checkin.goal_id, current)
    }
    for (const [goalId, list] of map.entries()) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      map.set(goalId, list)
    }
    return map
  }, [checkins])

  const cycleOptions = useMemo(() => {
    const unique = new Set<string>([getCurrentQuarterCycle()])
    for (const goal of goals) unique.add(goal.cycle)
    return Array.from(unique).sort((a, b) => b.localeCompare(a))
  }, [goals])

  const departmentOptions = useMemo(() => {
    const defaults = [
      'Executive Leadership',
      'Accounting & Financial Services',
      'Payroll & Regulatory Services',
      'Human Resources & Compliance',
      'Business Development & Client Services',
    ]
    const unique = new Set<string>(defaults)
    for (const profile of profiles) {
      const value = profile.department?.trim()
      if (value) unique.add(value)
    }
    for (const goal of goals) {
      const value = goal.department?.trim()
      if (value) unique.add(value)
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [goals, profiles])

  const currentUserDepartment = useMemo(() => {
    if (!currentUser?.id) return null
    return profileById.get(currentUser.id)?.department ?? null
  }, [currentUser?.id, profileById])

  const activeCycle = cycleOptions.includes(selectedCycle) ? selectedCycle : cycleOptions[0] ?? getCurrentQuarterCycle()
  const createPanelOpen = onboardingStep === 1 ? true : createOpen

  const onboardingTarget = onboardingStep >= 0 ? GOALS_ONBOARDING_STEPS[onboardingStep]?.target : null
  const closeOnboarding = () => {
    localStorage.setItem(GOALS_ONBOARDING_KEY, 'true')
    setOnboardingStep(-1)
  }

  const nextOnboardingStep = () => {
    setOnboardingStep((current) => {
      if (current < 0) return current
      const next = current + 1
      if (next >= GOALS_ONBOARDING_STEPS.length) {
        localStorage.setItem(GOALS_ONBOARDING_KEY, 'true')
        return -1
      }
      return next
    })
  }

  const derivedByGoal = useMemo(() => {
    const result = new Map<
      string,
      {
        progress: number
        autoHealth: GoalHealth
        latestCheckin: CheckinRow | null
        stale: boolean
        nextMilestone: string | null
        overdueKrCount: number
        blockers: string[]
        linkedProjects: number
        linkedTasks: number
      }
    >()

    for (const goal of goals) {
      const goalKrs = keyResultsByGoal.get(goal.id) ?? []
      const goalLinks = linksByGoal.get(goal.id) ?? []
      const goalCheckins = checkinsByGoal.get(goal.id) ?? []
      const latestCheckin = goalCheckins[0] ?? null

      const linkedTaskIds = goalLinks.filter((link) => link.link_type === 'task' && link.task_id).map((link) => link.task_id as string)
      const linkedProjectIds = goalLinks.filter((link) => link.link_type === 'project' && link.project_id).map((link) => link.project_id as string)

      const autoTaskUniverse = new Set<string>(linkedTaskIds)
      for (const projectId of linkedProjectIds) {
        for (const task of tasks) {
          if (task.project_id === projectId) autoTaskUniverse.add(task.id)
        }
      }

      const autoTasks = Array.from(autoTaskUniverse)
        .map((taskId) => tasksById.get(taskId))
        .filter((task): task is TaskRow => Boolean(task))
      const autoCompleted = autoTasks.filter((task) => Boolean(task.completed_at) || ['done', 'completed', 'closed'].includes((task.status ?? '').toLowerCase())).length
      const autoPercent = autoTasks.length > 0 ? (autoCompleted / autoTasks.length) * 100 : undefined

      const krProgress = goalKrs.map((kr) => calculateKrProgress(kr, autoPercent))
      const progress = krProgress.length > 0 ? Math.round(krProgress.reduce((sum, item) => sum + item, 0) / krProgress.length) : 0

      const confidence = goal.confidence ?? latestCheckin?.confidence ?? 5
      const autoHealth: GoalHealth = progress >= 70 && confidence >= 7 ? 'on_track' : progress >= 40 && confidence >= 4 ? 'at_risk' : 'off_track'

      const nextMilestone = goalKrs
        .map((kr) => kr.due_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? goal.due_at ?? null

      const overdueKrCount = goalKrs.filter((kr) => {
        if (!kr.due_at) return false
        const due = new Date(kr.due_at)
        if (Number.isNaN(due.getTime())) return false
        if (due.getTime() >= currentTimestamp) return false
        return calculateKrProgress(kr, autoPercent) < 100
      }).length

      const blockers = goalCheckins
        .map((checkin) => checkin.blockers?.trim() ?? '')
        .filter((value) => value.length > 0)
        .slice(0, 3)

      result.set(goal.id, {
        progress,
        autoHealth,
        latestCheckin,
        stale: daysSince(latestCheckin?.created_at) > 7,
        nextMilestone,
        overdueKrCount,
        blockers,
        linkedProjects: linkedProjectIds.length,
        linkedTasks: autoTasks.length,
      })
    }

    return result
  }, [checkinsByGoal, currentTimestamp, goals, keyResultsByGoal, linksByGoal, tasks, tasksById])

  const summary = useMemo(() => {
    const inCycle = goals.filter((goal) => goal.cycle === activeCycle)
    const counts = { on_track: 0, at_risk: 0, off_track: 0 }
    for (const goal of inCycle) {
      const health = derivedByGoal.get(goal.id)?.autoHealth ?? goal.health
      counts[health] += 1
    }
    return {
      total: inCycle.length,
      onTrack: counts.on_track,
      atRisk: counts.at_risk,
      offTrack: counts.off_track,
    }
  }, [activeCycle, derivedByGoal, goals])

  const filteredGoals = useMemo(() => {
    const query = search.trim().toLowerCase()

    return goals
      .filter((goal) => goal.cycle === activeCycle)
      .filter((goal) => {
        const derived = derivedByGoal.get(goal.id)
        const owner = goal.owner_id ? profileById.get(goal.owner_id) : null
        const goalDepartment = goal.department ?? owner?.department ?? 'No department'
        const effectiveHealth = derived?.autoHealth ?? goal.health

        if (healthFilter !== 'all' && effectiveHealth !== healthFilter) return false
        if (ownerFilter === 'mine' && goal.owner_id !== currentUser?.id) return false
        if (ownerFilter === 'unowned' && goal.owner_id) return false
        if (departmentFilter !== 'all' && goalDepartment !== departmentFilter) return false

        if (!query) return true
        const combined = [goal.title, goal.description ?? '', owner?.full_name ?? '', goalDepartment, effectiveHealth].join(' ').toLowerCase()
        return combined.includes(query)
      })
      .sort((a, b) => {
        const healthRank: Record<GoalHealth, number> = { off_track: 0, at_risk: 1, on_track: 2 }
        const aHealth = derivedByGoal.get(a.id)?.autoHealth ?? a.health
        const bHealth = derivedByGoal.get(b.id)?.autoHealth ?? b.health
        if (healthRank[aHealth] !== healthRank[bHealth]) return healthRank[aHealth] - healthRank[bHealth]
        return (derivedByGoal.get(b.id)?.progress ?? 0) - (derivedByGoal.get(a.id)?.progress ?? 0)
      })
  }, [activeCycle, currentUser?.id, departmentFilter, derivedByGoal, goals, healthFilter, ownerFilter, profileById, search])

  const highlightedDepartments = useMemo(() => {
    const preferred = [
      currentUserDepartment,
      ...departmentOptions.filter((item) => item !== currentUserDepartment),
    ].filter((value): value is string => Boolean(value))
    return preferred.slice(0, 5)
  }, [currentUserDepartment, departmentOptions])

  const needsAttention = useMemo(() => {
    return goals
      .filter((goal) => goal.cycle === activeCycle)
      .map((goal) => ({ goal, derived: derivedByGoal.get(goal.id) }))
      .filter((item) => item.derived && (item.derived.overdueKrCount > 0 || item.derived.stale || item.derived.autoHealth === 'off_track'))
      .sort((a, b) => {
        const aScore = (a.derived?.autoHealth === 'off_track' ? 3 : 0) + (a.derived?.stale ? 2 : 0) + (a.derived?.overdueKrCount ?? 0)
        const bScore = (b.derived?.autoHealth === 'off_track' ? 3 : 0) + (b.derived?.stale ? 2 : 0) + (b.derived?.overdueKrCount ?? 0)
        return bScore - aScore
      })
      .slice(0, 6)
  }, [activeCycle, derivedByGoal, goals])

  const recentUpdates = useMemo(() => {
    return [...checkins]
      .filter((checkin) => goals.find((goal) => goal.id === checkin.goal_id)?.cycle === activeCycle)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map((checkin) => ({
        checkin,
        goal: goals.find((goal) => goal.id === checkin.goal_id) ?? null,
        author: checkin.author_id ? profileById.get(checkin.author_id) : null,
      }))
  }, [activeCycle, checkins, goals, profileById])

  const selectedGoal = selectedGoalId ? goals.find((goal) => goal.id === selectedGoalId) ?? null : null
  const selectedGoalOwner = selectedGoal?.owner_id ? profileById.get(selectedGoal.owner_id) : null
  const selectedGoalDerived = selectedGoal ? derivedByGoal.get(selectedGoal.id) : null
  const selectedGoalKrs = selectedGoal ? keyResultsByGoal.get(selectedGoal.id) ?? [] : []
  const selectedGoalLinks = selectedGoal ? linksByGoal.get(selectedGoal.id) ?? [] : []
  const selectedGoalCheckins = selectedGoal ? checkinsByGoal.get(selectedGoal.id) ?? [] : []
  const selectedKrDraft = selectedGoal ? krDraftByGoal[selectedGoal.id] ?? { title: '', metricType: 'number' as MetricType, target: '100', source: 'manual' as KrSource } : null
  const selectedCheckinDraft = selectedGoal ? checkinDraftByGoal[selectedGoal.id] ?? { blockers: '', nextActions: '', confidence: '' } : null
  const selectedLinkDraft = selectedGoal ? linkDraftByGoal[selectedGoal.id] ?? { linkType: 'project' as LinkType, targetId: '' } : null

  const openGoalDetail = (goalId: string, nextMode: DetailPanelMode = 'overview') => {
    setSelectedGoalId(goalId)
    setDetailMode(nextMode)
  }

  const handleCreateGoal = async () => {
    if (!currentUser?.id) return
    if (!newGoalTitle.trim()) {
      setMessage('Goal title is required.')
      return
    }

    setSaving(true)
    setMessage('Saving...')
    const { error } = await supabase.from('goals').insert({
      title: newGoalTitle.trim(),
      description: newGoalDescription.trim() || null,
      owner_id: newGoalOwnerId || currentUser.id,
      created_by: currentUser.id,
      cycle: activeCycle,
      status: 'active',
      health: 'on_track',
      confidence: Number(newGoalConfidence) || null,
      department: newGoalDepartment.trim() || null,
      due_at: newGoalDueAt || null,
    })

    if (error) {
      setSaving(false)
      setMessage(error.message)
      return
    }

    setSaving(false)
    setMessage('Saved')
    setCreateOpen(false)
    setNewGoalTitle('')
    setNewGoalDescription('')
    setNewGoalOwnerId('')
    setNewGoalDepartment('')
    setNewGoalConfidence('7')
    setNewGoalDueAt('')
  }

  const addKeyResult = async (goalId: string) => {
    const draft = krDraftByGoal[goalId]
    if (!draft || !draft.title.trim()) {
      setMessage('KR title is required.')
      return
    }

    setMessage('Saving...')
    const { error } = await supabase.from('goal_key_results').insert({
      goal_id: goalId,
      title: draft.title.trim(),
      metric_type: draft.metricType,
      baseline_value: 0,
      current_value: 0,
      target_value: Number(draft.target) || (draft.metricType === 'boolean' ? 1 : 100),
      cadence: 'weekly',
      source: draft.source,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setKrDraftByGoal((current) => ({
      ...current,
      [goalId]: { title: '', metricType: 'number', target: '100', source: 'manual' },
    }))
    setMessage('Saved')
  }

  const updateKrCurrent = async (krId: string, nextValue: string) => {
    const numeric = Number(nextValue)
    if (Number.isNaN(numeric)) {
      setMessage('Current value must be numeric.')
      return
    }

    const { error } = await supabase.from('goal_key_results').update({ current_value: numeric }).eq('id', krId)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Saved')
  }

  const addCheckin = async (goalId: string) => {
    if (!currentUser?.id) return
    const draft = checkinDraftByGoal[goalId]
    if (!draft) {
      setMessage('Add blockers or next actions before submitting.')
      return
    }

    const confidence = Number(draft.confidence)
    const payload = {
      goal_id: goalId,
      author_id: currentUser.id,
      confidence: Number.isNaN(confidence) ? null : confidence,
      blockers: draft.blockers.trim() || null,
      next_actions: draft.nextActions.trim() || null,
      progress_delta: null as number | null,
    }

    const { error } = await supabase.from('goal_checkins').insert(payload)
    if (error) {
      setMessage(error.message)
      return
    }

    setCheckinDraftByGoal((current) => ({ ...current, [goalId]: { blockers: '', nextActions: '', confidence: '' } }))
    setMessage('Saved')
  }

  const addLink = async (goalId: string) => {
    if (!currentUser?.id) return
    const draft = linkDraftByGoal[goalId]
    if (!draft?.targetId) {
      setMessage('Select a task or project to link.')
      return
    }

    const existing = links.find(
      (link) =>
        link.goal_id === goalId &&
        ((draft.linkType === 'project' && link.project_id === draft.targetId) || (draft.linkType === 'task' && link.task_id === draft.targetId)),
    )
    if (existing) {
      setMessage('Link already exists.')
      return
    }

    const { error } = await supabase.from('goal_links').insert({
      goal_id: goalId,
      link_type: draft.linkType,
      project_id: draft.linkType === 'project' ? draft.targetId : null,
      task_id: draft.linkType === 'task' ? draft.targetId : null,
      created_by: currentUser.id,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setLinkDraftByGoal((current) => ({
      ...current,
      [goalId]: {
        linkType: draft.linkType,
        targetId: '',
      },
    }))
    setMessage('Saved')
  }

  return (
    <div className='space-y-5 pb-2'>
      <Card
        className={cn(
          'border-white/10 bg-card',
          onboardingTarget === 'header' ? 'ring-2 ring-cyan-400/40' : null,
        )}
      >
        <CardContent className='flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-3'>
            <Badge variant='outline' className='border-cyan-400/20 bg-cyan-400/10 text-cyan-200'>
              Goals Strategy Layer
            </Badge>
            <div className='space-y-1'>
              <h1 className='text-2xl font-semibold tracking-tight text-foreground'>Strategy execution for {activeCycle}</h1>
              <p className='max-w-2xl text-sm text-muted-foreground'>
                Review portfolio health, open compact goal summaries, and drive updates through a dedicated detail workspace.
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
              <span className='inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-background px-3 py-1.5'>
                <Target className='h-3.5 w-3.5 text-cyan-200' /> {summary.total} active goals
              </span>
              <span className='inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-background px-3 py-1.5'>
                <Activity className='h-3.5 w-3.5 text-emerald-300' /> {summary.onTrack} on track
              </span>
              <span className='inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-background px-3 py-1.5'>
                <Clock3 className='h-3.5 w-3.5 text-amber-300' /> Weekly operating rhythm
              </span>
            </div>
          </div>

          <div className='flex flex-col gap-3 sm:min-w-[320px]'>
            <div className='rounded-2xl border border-white/10 bg-background p-3'>
              <p className='text-[11px] uppercase tracking-[0.24em] text-muted-foreground'>Planning cycle</p>
              <div className='mt-2 flex items-center gap-2'>
                <select
                  value={activeCycle}
                  onChange={(event) => setSelectedCycle(event.target.value)}
                  className='h-11 flex-1 rounded-xl border border-white/10 bg-background px-4 text-sm font-medium text-foreground outline-none'
                >
                  {cycleOptions.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {cycle}
                    </option>
                  ))}
                </select>
                <Button size='sm' className='h-11 rounded-xl' onClick={() => setCreateOpen((value) => !value)}>
                  <Plus className='mr-1.5 h-4 w-4' />
                  New Goal
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {createPanelOpen ? (
        <Card className={cn('border-white/10 bg-card', onboardingTarget === 'create' ? 'ring-2 ring-cyan-400/35' : null)}>
          <CardHeader className='border-b border-white/10 pb-4'>
            <CardTitle className='text-base'>Create strategic goal</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3 p-4 md:grid-cols-2'>
            <Input value={newGoalTitle} onChange={(event) => setNewGoalTitle(event.target.value)} placeholder='Goal title' className='md:col-span-2 bg-background/60' />
            <textarea
              value={newGoalDescription}
              onChange={(event) => setNewGoalDescription(event.target.value)}
              rows={3}
              placeholder='Describe the executive outcome and why it matters'
              className='flex w-full rounded-xl border border-input bg-background/60 px-3 py-2 text-sm text-foreground md:col-span-2'
            />
            <select value={newGoalOwnerId} onChange={(event) => setNewGoalOwnerId(event.target.value)} className='h-10 rounded-xl border border-input bg-background/60 px-3 text-sm'>
              <option value=''>Owner (Me)</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name ?? 'Unknown user'}
                </option>
              ))}
            </select>
            <select
              value={newGoalDepartment}
              onChange={(event) => setNewGoalDepartment(event.target.value)}
              className='h-10 rounded-xl border border-input bg-background/60 px-3 text-sm'
            >
              <option value=''>Select department</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <Input type='number' min={1} max={10} value={newGoalConfidence} onChange={(event) => setNewGoalConfidence(event.target.value)} placeholder='Confidence 1-10' className='bg-background/60' />
            <Input type='date' value={newGoalDueAt} onChange={(event) => setNewGoalDueAt(event.target.value)} className='bg-background/60' />
            <div className='flex justify-end gap-2 md:col-span-2'>
              <Button variant='ghost' onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreateGoal()} disabled={saving}>
                {saving ? 'Saving...' : 'Create Goal'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        {[
          {
            key: 'all' as HealthFilter,
            label: 'Active Goals',
            value: summary.total,
            helper: 'All goals in cycle',
            icon: Target,
            tone: 'text-white',
          },
          {
            key: 'on_track' as HealthFilter,
            label: 'On Track',
            value: summary.onTrack,
            helper: 'Healthy execution pace',
            icon: CheckCircle2,
            tone: 'text-emerald-300',
          },
          {
            key: 'at_risk' as HealthFilter,
            label: 'At Risk',
            value: summary.atRisk,
            helper: 'Needs management attention',
            icon: AlertTriangle,
            tone: 'text-amber-300',
          },
          {
            key: 'off_track' as HealthFilter,
            label: 'Off Track',
            value: summary.offTrack,
            helper: 'Intervention required',
            icon: Flag,
            tone: 'text-rose-300',
          },
        ].map((item) => {
          const Icon = item.icon
          const active = healthFilter === item.key
          return (
            <button
              key={item.label}
              type='button'
              onClick={() => setHealthFilter(item.key)}
              className={cn(
                'group rounded-2xl border p-0 text-left transition duration-200',
                active ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 bg-card hover:border-white/20',
              )}
            >
              <div className='flex items-center justify-between p-4'>
                <div>
                  <p className='text-xs uppercase tracking-[0.22em] text-muted-foreground'>{item.label}</p>
                  <p className={cn('mt-3 text-3xl font-semibold tracking-tight', item.tone)}>{item.value}</p>
                  <p className='mt-1 text-xs text-muted-foreground'>{item.helper}</p>
                </div>
                <div className={cn('rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition group-hover:bg-white/[0.07]', active ? 'text-cyan-200' : 'text-muted-foreground')}>
                  <Icon className='h-5 w-5' />
                </div>
              </div>
            </button>
          )
        })}
      </section>

      <section className='grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_360px]'>
        <div className={cn('space-y-4', onboardingTarget === 'main' ? 'rounded-2xl ring-2 ring-cyan-400/35' : null)}>
          <Card className='border-white/10 bg-card'>
            <CardContent className='space-y-4 p-4'>
              <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
                <div className='relative flex-1'>
                  <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder='Search goals, owners, departments, or milestones'
                    className='h-11 rounded-xl border-white/10 bg-background/60 pl-9'
                  />
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  className='h-11 rounded-xl border-white/10 bg-background/50 px-4'
                  onClick={() => window.dispatchEvent(new CustomEvent('contas:realtime-change', { detail: { table: 'goals', eventType: 'manual' } }))}
                >
                  <RefreshCw className='mr-1.5 h-4 w-4' />
                  Sync
                </Button>
              </div>

              <div className='flex flex-wrap gap-2'>
                {[
                  { key: 'all' as OwnerFilter, label: 'All owners' },
                  { key: 'mine' as OwnerFilter, label: 'My goals' },
                  { key: 'unowned' as OwnerFilter, label: 'Unowned' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type='button'
                    onClick={() => setOwnerFilter(item.key)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition',
                      ownerFilter === item.key ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100' : 'border-white/10 bg-background text-muted-foreground hover:border-white/20 hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className='space-y-2'>
                <p className='text-[11px] uppercase tracking-[0.24em] text-muted-foreground'>Department</p>
                <div className='flex flex-wrap gap-2'>
                  <button
                    type='button'
                    onClick={() => setDepartmentFilter('all')}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition',
                      departmentFilter === 'all' ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100' : 'border-white/10 bg-background text-muted-foreground hover:border-white/20 hover:text-foreground',
                    )}
                  >
                    All departments
                  </button>
                  {highlightedDepartments.map((department) => (
                    <button
                      key={department}
                      type='button'
                      onClick={() => setDepartmentFilter(department)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs transition',
                        departmentFilter === department ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100' : 'border-white/10 bg-background text-muted-foreground hover:border-white/20 hover:text-foreground',
                      )}
                    >
                      {department}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className='flex items-center justify-between px-1'>
            <div>
              <p className='text-sm font-semibold text-foreground'>Goal portfolio</p>
              <p className='text-xs text-muted-foreground'>
                {filteredGoals.length} goal{filteredGoals.length === 1 ? '' : 's'} matching current filters
              </p>
            </div>
            {loading ? <p className='text-xs text-muted-foreground'>Refreshing data...</p> : null}
          </div>

          <div className='grid gap-3'>
            {!loading && filteredGoals.length === 0 ? (
              <Card className='border-dashed border-white/10 bg-card'>
                <CardContent className='flex min-h-[180px] flex-col items-center justify-center gap-2 text-center'>
                  <Target className='h-8 w-8 text-muted-foreground' />
                  <p className='text-sm font-medium text-foreground'>No goals match these filters</p>
                  <p className='max-w-sm text-xs text-muted-foreground'>Try broadening the owner or department chips, or switch the KPI filter back to Active Goals.</p>
                </CardContent>
              </Card>
            ) : null}

            {filteredGoals.map((goal) => {
              const owner = goal.owner_id ? profileById.get(goal.owner_id) : null
              const derived = derivedByGoal.get(goal.id)
              const goalKrs = keyResultsByGoal.get(goal.id) ?? []
              const effectiveHealth = derived?.autoHealth ?? goal.health
              const active = selectedGoalId === goal.id
              const confidence = goal.confidence ?? derived?.latestCheckin?.confidence ?? null
              const goalDepartment = goal.department ?? owner?.department ?? 'No department'

              return (
                <article
                  key={goal.id}
                  className={cn(
                    'rounded-2xl border bg-card transition',
                    active ? 'border-cyan-400/35' : 'border-white/10 hover:border-white/20',
                    onboardingTarget === 'actions' && active ? 'ring-2 ring-cyan-400/35' : null,
                  )}
                >
                  <div className='p-4'>
                    <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
                      <div className='space-y-3'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <Badge variant='outline' className={cn('rounded-full', healthTone(effectiveHealth))}>
                            {formatHealthLabel(effectiveHealth)}
                          </Badge>
                          <Badge variant='outline' className={cn('rounded-full', statusTone(goal.status))}>
                            {formatStatusLabel(goal.status)}
                          </Badge>
                          {derived?.stale ? (
                            <Badge variant='outline' className='rounded-full border-rose-500/30 bg-rose-500/10 text-rose-300'>
                              Check-in overdue
                            </Badge>
                          ) : null}
                        </div>

                        <div>
                          <h3 className='text-lg font-semibold tracking-tight text-foreground'>{goal.title}</h3>
                          <div className='mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground'>
                            <span className='inline-flex items-center gap-1.5'>
                              <UserRound className='h-3.5 w-3.5' /> {owner?.full_name ?? 'Unowned'}
                            </span>
                            <span className='inline-flex items-center gap-1.5'>
                              <Building2 className='h-3.5 w-3.5' /> {goalDepartment}
                            </span>
                            <span className='inline-flex items-center gap-1.5'>
                              <CalendarClock className='h-3.5 w-3.5' /> Next milestone {formatDateLabel(derived?.nextMilestone)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className='flex items-center gap-2'>
                        <Button size='sm' variant='outline' className='rounded-xl border-white/10 bg-background' onClick={() => openGoalDetail(goal.id, 'overview')}>
                          View Goal
                        </Button>
                        <Button size='sm' className='rounded-xl' onClick={() => openGoalDetail(goal.id, 'checkin')}>
                          Update Check-in
                        </Button>
                      </div>
                    </div>

                    <div className='mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]'>
                      <div className='space-y-4'>
                        <div className='rounded-2xl border border-white/10 bg-background p-4'>
                          <div className='flex items-end justify-between gap-3'>
                            <div>
                              <p className='text-xs uppercase tracking-[0.22em] text-muted-foreground'>Progress</p>
                              <p className='mt-1 text-3xl font-semibold tracking-tight text-foreground'>{derived?.progress ?? 0}%</p>
                            </div>
                            <div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
                              <div className='rounded-xl border border-white/10 bg-muted/20 px-3 py-2'>
                                <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>Confidence</p>
                                <p className='mt-1 text-sm font-medium text-foreground'>{confidence ? `${confidence}/10` : 'N/A'}</p>
                              </div>
                              <div className='rounded-xl border border-white/10 bg-muted/20 px-3 py-2'>
                                <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>Linked work</p>
                                <p className='mt-1 text-sm font-medium text-foreground'>
                                  {derived?.linkedProjects ?? 0} proj / {derived?.linkedTasks ?? 0} tasks
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className='mt-3 h-3 rounded-full bg-muted/50'>
                            <div
                              className={cn('h-full rounded-full transition-[width] duration-300', progressBarTone(effectiveHealth))}
                              style={{ width: `${derived?.progress ?? 0}%` }}
                            />
                          </div>
                        </div>

                        <div className='grid gap-2'>
                          <div className='flex items-center justify-between'>
                            <p className='text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground'>Key results</p>
                            <p className='text-xs text-muted-foreground'>{goalKrs.length} linked outcome metric{goalKrs.length === 1 ? '' : 's'}</p>
                          </div>
                          <div className='grid gap-2'>
                            {goalKrs.length === 0 ? (
                              <div className='rounded-2xl border border-dashed border-white/10 bg-background px-4 py-3 text-xs text-muted-foreground'>
                                No KRs attached yet. Add them from the goal detail workspace.
                              </div>
                            ) : null}
                            {goalKrs.slice(0, 3).map((kr) => {
                              const krProgress = calculateKrProgress(kr)
                              return (
                                <div key={kr.id} className='grid gap-3 rounded-2xl border border-white/10 bg-background px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center'>
                                  <div className='min-w-0'>
                                    <p className='truncate text-sm font-medium text-foreground'>{kr.title}</p>
                                    <p className='mt-1 text-xs text-muted-foreground'>{metricTypeLabel(kr.metric_type)} KR</p>
                                  </div>
                                  <p className='text-xs text-muted-foreground'>
                                    {formatMetricValue(kr.current_value, kr.metric_type, kr.unit)} / {formatMetricValue(kr.target_value, kr.metric_type, kr.unit)}
                                  </p>
                                  <p className='text-xs text-muted-foreground'>{krProgress}% complete</p>
                                  <Badge variant='outline' className='w-fit rounded-full border-white/10 bg-background text-[11px] text-muted-foreground'>
                                    {kr.source === 'auto' ? 'Auto' : 'Manual'}
                                  </Badge>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <div className='space-y-3'>
                        <div className='rounded-2xl border border-white/10 bg-background p-4'>
                          <p className='text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground'>Execution footprint</p>
                          <div className='mt-3 grid gap-2'>
                            <div className='flex items-center justify-between rounded-xl border border-white/10 bg-muted/20 px-3 py-2'>
                              <span className='inline-flex items-center gap-2 text-sm text-foreground'>
                                <FolderKanban className='h-4 w-4 text-cyan-200' /> Projects
                              </span>
                              <span className='text-sm font-medium text-foreground'>{derived?.linkedProjects ?? 0}</span>
                            </div>
                            <div className='flex items-center justify-between rounded-xl border border-white/10 bg-muted/20 px-3 py-2'>
                              <span className='inline-flex items-center gap-2 text-sm text-foreground'>
                                <Link2 className='h-4 w-4 text-cyan-200' /> Tasks
                              </span>
                              <span className='text-sm font-medium text-foreground'>{derived?.linkedTasks ?? 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className='rounded-2xl border border-white/10 bg-background p-4'>
                          <div className='flex items-center justify-between'>
                            <p className='text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground'>Latest signal</p>
                            <span className='text-xs text-muted-foreground'>{formatRelativeTime(derived?.latestCheckin?.created_at)}</span>
                          </div>
                          <div className='mt-3 space-y-2 text-sm text-muted-foreground'>
                            {derived?.blockers.length ? derived.blockers.map((blocker, index) => (
                              <div key={`${goal.id}-blocker-${index}`} className='rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-amber-100'>
                                {blocker}
                              </div>
                            )) : (
                              <div className='rounded-xl border border-white/10 bg-muted/20 px-3 py-2 text-muted-foreground'>No active blockers in recent check-ins.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <div className={cn('space-y-4 xl:sticky xl:top-4 xl:self-start', onboardingTarget === 'rail' ? 'rounded-2xl ring-2 ring-cyan-400/35' : null)}>
          <Card className='border-white/10 bg-card'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Needs attention</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {needsAttention.length === 0 ? <p className='text-sm text-muted-foreground'>No critical goal alerts in this cycle.</p> : null}
              {needsAttention.map((item) => (
                <button
                  key={item.goal.id}
                  type='button'
                  onClick={() => openGoalDetail(item.goal.id, 'overview')}
                  className='w-full rounded-2xl border border-white/10 bg-background p-3 text-left transition hover:border-white/20'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <p className='text-sm font-medium text-foreground'>{item.goal.title}</p>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {(item.goal.owner_id ? profileById.get(item.goal.owner_id)?.full_name : null) ?? 'Unowned'} • {item.goal.department ?? 'No department'}
                      </p>
                    </div>
                    <ArrowRight className='mt-0.5 h-4 w-4 text-slate-400' />
                  </div>
                  <div className='mt-3 flex flex-wrap gap-2 text-xs'>
                    {item.derived?.overdueKrCount ? (
                      <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-amber-200'>
                        <AlertTriangle className='h-3.5 w-3.5' /> {item.derived.overdueKrCount} overdue KR{item.derived.overdueKrCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {item.derived?.stale ? (
                      <span className='inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-200'>
                        <Flag className='h-3.5 w-3.5' /> stale check-in
                      </span>
                    ) : null}
                    {item.derived?.autoHealth === 'off_track' ? (
                      <span className='inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-200'>
                        <TrendingUp className='h-3.5 w-3.5' /> off track
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className='border-white/10 bg-card'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Recent updates</CardTitle>
            </CardHeader>
            <CardContent className='space-y-0'>
              {recentUpdates.length === 0 ? <p className='pb-3 text-sm text-muted-foreground'>No check-ins yet.</p> : null}
              {recentUpdates.map((item, index) => (
                <button
                  key={item.checkin.id}
                  type='button'
                  onClick={() => item.goal && openGoalDetail(item.goal.id, 'checkin')}
                  className='flex w-full gap-3 py-3 text-left'
                >
                  <div className='flex w-5 flex-col items-center'>
                    <span className='mt-1 h-2.5 w-2.5 rounded-full bg-cyan-300' />
                    {index < recentUpdates.length - 1 ? <span className='mt-1 h-full w-px bg-white/10' /> : null}
                  </div>
                  <div className='min-w-0 flex-1 border-b border-white/6 pb-3'>
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='text-sm font-medium text-foreground'>{item.goal?.title ?? 'Unknown goal'}</p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {item.author?.full_name ?? 'Unknown user'} • {formatDateTimeLabel(item.checkin.created_at)}
                        </p>
                      </div>
                      <span className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{formatRelativeTime(item.checkin.created_at)}</span>
                    </div>
                    {item.checkin.blockers ? <p className='mt-2 line-clamp-2 text-xs text-amber-300'>Blockers: {item.checkin.blockers}</p> : null}
                    {item.checkin.next_actions ? <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>Next: {item.checkin.next_actions}</p> : null}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className='border-white/10 bg-card'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Goal rituals</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='rounded-2xl border border-white/10 bg-background p-3'>
                <p className='text-xs uppercase tracking-[0.22em] text-cyan-200'>Monday</p>
                <p className='mt-1 text-sm font-medium text-foreground'>Owner check-ins due</p>
                <p className='mt-1 text-xs text-muted-foreground'>Capture confidence, blockers, and next actions in the goal detail view.</p>
              </div>
              <div className='rounded-2xl border border-white/10 bg-background p-3'>
                <p className='text-xs uppercase tracking-[0.22em] text-amber-200'>Wednesday</p>
                <p className='mt-1 text-sm font-medium text-foreground'>Portfolio review</p>
                <p className='mt-1 text-xs text-muted-foreground'>Use Needs attention to escalate stale or off-track goals before leadership review.</p>
              </div>
              <div className='rounded-2xl border border-white/10 bg-background p-3'>
                <p className='text-xs uppercase tracking-[0.22em] text-emerald-200'>Friday</p>
                <p className='mt-1 text-sm font-medium text-foreground'>Link work to outcomes</p>
                <p className='mt-1 text-xs text-muted-foreground'>Confirm active projects and tasks remain connected to strategic goals.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={Boolean(selectedGoal)} onOpenChange={(open) => (!open ? setSelectedGoalId(null) : undefined)}>
        <DialogContent
          className='left-auto right-0 top-0 h-screen max-h-screen w-[min(760px,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-l border-white/10 bg-card p-0'
          showClose
        >
          {selectedGoal ? (
            <div className='flex h-full min-h-0 flex-col'>
              <DialogHeader className='border-b border-white/10 px-4 py-3'>
                <div className='flex items-start justify-between gap-4 pr-8'>
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant='outline' className={cn('rounded-full', healthTone(selectedGoalDerived?.autoHealth ?? selectedGoal.health))}>
                        {formatHealthLabel(selectedGoalDerived?.autoHealth ?? selectedGoal.health)}
                      </Badge>
                      <Badge variant='outline' className={cn('rounded-full', statusTone(selectedGoal.status))}>
                        {formatStatusLabel(selectedGoal.status)}
                      </Badge>
                      <Badge variant='outline' className='rounded-full border-white/10 bg-white/[0.04] text-muted-foreground'>
                        {activeCycle}
                      </Badge>
                    </div>
                    <DialogTitle className='text-lg tracking-tight text-foreground'>{selectedGoal.title}</DialogTitle>
                    <DialogDescription className='max-w-2xl text-sm text-muted-foreground'>
                      {selectedGoal.description?.trim() || 'Use this workspace to update outcomes, capture weekly check-ins, and manage linked execution work.'}
                    </DialogDescription>
                  </div>
                </div>
                <div className='mt-2 flex flex-wrap gap-2'>
                  <button
                    type='button'
                    onClick={() => setDetailMode('overview')}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition',
                      detailMode === 'overview' ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100' : 'border-white/10 bg-background/40 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Goal overview
                  </button>
                  <button
                    type='button'
                    onClick={() => setDetailMode('checkin')}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition',
                      detailMode === 'checkin' ? 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100' : 'border-white/10 bg-background/40 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Update check-in
                  </button>
                </div>
              </DialogHeader>

              <div className='min-h-0 flex-1 overflow-y-auto px-4 py-3'>
                <div className='grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_260px]'>
                  <div className='space-y-3'>
                    <Card className='border-white/10 bg-card'>
                      <CardContent className='space-y-3 p-3'>
                        <div className='grid gap-2 md:grid-cols-3'>
                          <div className='rounded-2xl border border-white/10 bg-background p-3 md:col-span-2'>
                            <p className='text-[11px] uppercase tracking-[0.2em] text-muted-foreground'>Progress</p>
                            <p className='mt-1 text-2xl font-semibold text-foreground'>{selectedGoalDerived?.progress ?? 0}%</p>
                            <div className='mt-2 h-2.5 rounded-full bg-muted/50'>
                              <div
                                className={cn('h-full rounded-full', progressBarTone(selectedGoalDerived?.autoHealth ?? selectedGoal.health))}
                                style={{ width: `${selectedGoalDerived?.progress ?? 0}%` }}
                              />
                            </div>
                          </div>
                          <div className='rounded-2xl border border-white/10 bg-background p-3'>
                            <p className='text-[11px] uppercase tracking-[0.2em] text-muted-foreground'>Confidence</p>
                            <p className='mt-1 text-base font-semibold text-foreground'>
                              {selectedGoal.confidence ?? selectedGoalDerived?.latestCheckin?.confidence ?? 'N/A'}
                              {selectedGoal.confidence ?? selectedGoalDerived?.latestCheckin?.confidence ? '/10' : ''}
                            </p>
                          </div>
                          <div className='rounded-2xl border border-white/10 bg-background p-3'>
                            <p className='text-[11px] uppercase tracking-[0.2em] text-muted-foreground'>Next milestone</p>
                            <p className='mt-1 text-base font-semibold text-foreground'>{formatDateLabel(selectedGoalDerived?.nextMilestone)}</p>
                          </div>
                        </div>

                        <div className='grid gap-2 md:grid-cols-3'>
                          <div className='rounded-2xl border border-white/10 bg-background p-3'>
                            <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>Owner</p>
                            <p className='mt-1 text-sm font-medium text-foreground'>{selectedGoalOwner?.full_name ?? 'Unowned'}</p>
                          </div>
                          <div className='rounded-2xl border border-white/10 bg-background p-3'>
                            <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>Department</p>
                            <p className='mt-1 text-sm font-medium text-foreground'>{selectedGoal.department ?? selectedGoalOwner?.department ?? 'No department'}</p>
                          </div>
                          <div className='rounded-2xl border border-white/10 bg-background p-3'>
                            <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>Latest update</p>
                            <p className='mt-1 text-sm font-medium text-foreground'>{formatRelativeTime(selectedGoalDerived?.latestCheckin?.created_at)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className='border-white/10 bg-card'>
                      <CardHeader className='border-b border-white/10 pb-3'>
                        <CardTitle className='text-base'>Key results</CardTitle>
                      </CardHeader>
                      <CardContent className='space-y-2 p-3'>
                        {selectedGoalKrs.length === 0 ? <p className='text-sm text-muted-foreground'>No KRs yet for this goal.</p> : null}
                        {selectedGoalKrs.map((kr) => {
                          const krProgress = calculateKrProgress(kr)
                          return (
                            <div key={kr.id} className='rounded-2xl border border-white/10 bg-background p-3'>
                              <div className='flex flex-wrap items-start justify-between gap-3'>
                                <div>
                                  <p className='text-sm font-medium text-foreground'>{kr.title}</p>
                                  <p className='mt-1 text-xs text-muted-foreground'>
                                    {metricTypeLabel(kr.metric_type)} • {kr.cadence} cadence • {kr.source === 'auto' ? 'Auto tracked' : 'Manual update'}
                                  </p>
                                </div>
                                <Badge variant='outline' className='rounded-full border-white/10 bg-background text-muted-foreground'>
                                  {krProgress}% complete
                                </Badge>
                              </div>
                              <div className='mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_130px]'>
                                <div className='rounded-xl border border-white/10 bg-muted/20 px-3 py-2 text-xs text-muted-foreground'>
                                  Current {formatMetricValue(kr.current_value, kr.metric_type, kr.unit)} of {formatMetricValue(kr.target_value, kr.metric_type, kr.unit)}
                                </div>
                                <Input
                                  type='number'
                                  defaultValue={safeNumber(kr.current_value)}
                                  className='h-10 rounded-xl border-white/10 bg-background text-sm'
                                  onBlur={(event) => void updateKrCurrent(kr.id, event.target.value)}
                                  disabled={kr.source === 'auto'}
                                />
                              </div>
                            </div>
                          )
                        })}

                        {selectedKrDraft ? (
                          <div className='rounded-2xl border border-dashed border-white/10 bg-background p-3'>
                            <p className='text-sm font-medium text-foreground'>Add key result</p>
                            <div className='mt-2 grid gap-2 md:grid-cols-[minmax(0,1.5fr)_1fr_1fr_1fr_auto]'>
                              <Input
                                value={selectedKrDraft.title}
                                onChange={(event) =>
                                  setKrDraftByGoal((current) => ({
                                    ...current,
                                    [selectedGoal.id]: { ...selectedKrDraft, title: event.target.value },
                                  }))
                                }
                                placeholder='KR title'
                                className='h-10 rounded-xl border-white/10 bg-background'
                              />
                              <select
                                value={selectedKrDraft.metricType}
                                onChange={(event) =>
                                  setKrDraftByGoal((current) => ({
                                    ...current,
                                    [selectedGoal.id]: { ...selectedKrDraft, metricType: event.target.value as MetricType },
                                  }))
                                }
                                className='h-10 rounded-xl border border-white/10 bg-background px-3 text-sm'
                              >
                                <option value='percentage'>Percentage</option>
                                <option value='number'>Number</option>
                                <option value='currency'>Currency</option>
                                <option value='boolean'>Boolean milestone</option>
                              </select>
                              <Input
                                value={selectedKrDraft.target}
                                onChange={(event) =>
                                  setKrDraftByGoal((current) => ({
                                    ...current,
                                    [selectedGoal.id]: { ...selectedKrDraft, target: event.target.value },
                                  }))
                                }
                                placeholder='Target'
                                type='number'
                                className='h-10 rounded-xl border-white/10 bg-background'
                              />
                              <select
                                value={selectedKrDraft.source}
                                onChange={(event) =>
                                  setKrDraftByGoal((current) => ({
                                    ...current,
                                    [selectedGoal.id]: { ...selectedKrDraft, source: event.target.value as KrSource },
                                  }))
                                }
                                className='h-10 rounded-xl border border-white/10 bg-background px-3 text-sm'
                              >
                                <option value='manual'>Manual</option>
                                <option value='auto'>Auto</option>
                              </select>
                              <Button className='h-10 rounded-xl' onClick={() => void addKeyResult(selectedGoal.id)}>
                                Add KR
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className='border-white/10 bg-card'>
                      <CardHeader className='border-b border-white/10 pb-3'>
                        <CardTitle className='text-base'>Linked work</CardTitle>
                      </CardHeader>
                      <CardContent className='space-y-2 p-3'>
                        {selectedLinkDraft ? (
                          <div className='grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_auto]'>
                            <select
                              value={selectedLinkDraft.linkType}
                              onChange={(event) =>
                                setLinkDraftByGoal((current) => ({
                                  ...current,
                                  [selectedGoal.id]: { linkType: event.target.value as LinkType, targetId: '' },
                                }))
                              }
                              className='h-10 rounded-xl border border-white/10 bg-background px-3 text-sm'
                            >
                              <option value='project'>Project</option>
                              <option value='task'>Task</option>
                            </select>
                            <select
                              value={selectedLinkDraft.targetId}
                              onChange={(event) =>
                                setLinkDraftByGoal((current) => ({
                                  ...current,
                                  [selectedGoal.id]: { ...selectedLinkDraft, targetId: event.target.value },
                                }))
                              }
                              className='h-10 rounded-xl border border-white/10 bg-background px-3 text-sm'
                            >
                              <option value=''>Select work item</option>
                              {(selectedLinkDraft.linkType === 'project' ? projects : tasks).map((item) => (
                                <option key={item.id} value={item.id}>
                                  {'name' in item ? item.name ?? 'Untitled project' : item.title ?? 'Untitled task'}
                                </option>
                              ))}
                            </select>
                            <Button className='h-10 rounded-xl' variant='outline' onClick={() => void addLink(selectedGoal.id)}>
                              Link
                            </Button>
                          </div>
                        ) : null}

                        <div className='grid gap-2'>
                          {selectedGoalLinks.length === 0 ? <p className='text-sm text-muted-foreground'>No linked work yet.</p> : null}
                          {selectedGoalLinks.map((link) => {
                            const project = link.project_id ? projects.find((item) => item.id === link.project_id) : null
                            const task = link.task_id ? tasks.find((item) => item.id === link.task_id) : null
                            return (
                              <div key={link.id} className='flex items-center justify-between rounded-2xl border border-white/10 bg-background px-3 py-2.5'>
                                <div>
                                  <p className='text-sm font-medium text-foreground'>{project?.name ?? task?.title ?? 'Unknown link'}</p>
                                  <p className='mt-1 text-xs text-muted-foreground'>{link.link_type === 'project' ? 'Project' : 'Task'} link</p>
                                </div>
                                <Link2 className='h-4 w-4 text-cyan-200' />
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className='space-y-3'>
                    <Card className='border-white/10 bg-card'>
                      <CardHeader className='border-b border-white/10 pb-3'>
                        <CardTitle className='text-base'>{detailMode === 'checkin' ? 'Weekly check-in' : 'Decision support'}</CardTitle>
                      </CardHeader>
                      <CardContent className='space-y-2.5 p-3'>
                        {selectedCheckinDraft ? (
                          <>
                            <Input
                              value={selectedCheckinDraft.confidence}
                              onChange={(event) =>
                                setCheckinDraftByGoal((current) => ({
                                  ...current,
                                  [selectedGoal.id]: { ...selectedCheckinDraft, confidence: event.target.value },
                                }))
                              }
                              placeholder='Confidence (1-10)'
                              type='number'
                              min={1}
                              max={10}
                              className='h-10 rounded-xl border-white/10 bg-background'
                            />
                            <textarea
                              value={selectedCheckinDraft.blockers}
                              onChange={(event) =>
                                setCheckinDraftByGoal((current) => ({
                                  ...current,
                                  [selectedGoal.id]: { ...selectedCheckinDraft, blockers: event.target.value },
                                }))
                              }
                              rows={3}
                              placeholder='What is slowing this goal down?'
                              className='w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-foreground'
                            />
                            <textarea
                              value={selectedCheckinDraft.nextActions}
                              onChange={(event) =>
                                setCheckinDraftByGoal((current) => ({
                                  ...current,
                                  [selectedGoal.id]: { ...selectedCheckinDraft, nextActions: event.target.value },
                                }))
                              }
                              rows={3}
                              placeholder='What happens next?'
                              className='w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-foreground'
                            />
                            <Button className='w-full rounded-xl' onClick={() => void addCheckin(selectedGoal.id)}>
                              Save check-in
                            </Button>
                          </>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className='border-white/10 bg-card'>
                      <CardHeader className='border-b border-white/10 pb-3'>
                        <CardTitle className='text-base'>Recent check-ins</CardTitle>
                      </CardHeader>
                      <CardContent className='space-y-2 p-3'>
                        {selectedGoalCheckins.length === 0 ? <p className='text-sm text-muted-foreground'>No updates yet.</p> : null}
                        {selectedGoalCheckins.slice(0, 6).map((checkin) => {
                          const author = checkin.author_id ? profileById.get(checkin.author_id) : null
                          return (
                            <div key={checkin.id} className='rounded-2xl border border-white/10 bg-background p-2.5'>
                              <div className='flex items-start justify-between gap-3'>
                                <div>
                                  <p className='text-sm font-medium text-foreground'>{author?.full_name ?? 'Unknown user'}</p>
                                  <p className='mt-1 text-xs text-muted-foreground'>{formatDateTimeLabel(checkin.created_at)}</p>
                                </div>
                                <Badge variant='outline' className='rounded-full border-white/10 bg-white/[0.04] text-muted-foreground'>
                                  {checkin.confidence ? `${checkin.confidence}/10 confidence` : 'No confidence score'}
                                </Badge>
                              </div>
                              {checkin.blockers ? <p className='mt-2 text-xs text-amber-300'>Blockers: {checkin.blockers}</p> : null}
                              {checkin.next_actions ? <p className='mt-2 text-xs text-muted-foreground'>Next: {checkin.next_actions}</p> : null}
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>

                    <Card className='border-white/10 bg-card'>
                      <CardHeader className='border-b border-white/10 pb-3'>
                        <CardTitle className='text-base'>Signals</CardTitle>
                      </CardHeader>
                      <CardContent className='space-y-2 p-3 text-sm text-muted-foreground'>
                        <div className='flex items-center justify-between rounded-2xl border border-white/10 bg-background px-3 py-2'>
                          <span className='inline-flex items-center gap-2'>
                            <Zap className='h-4 w-4 text-cyan-200' /> Confidence
                          </span>
                          <span className='font-medium text-foreground'>{selectedGoal.confidence ?? selectedGoalDerived?.latestCheckin?.confidence ?? 'N/A'}</span>
                        </div>
                        <div className='flex items-center justify-between rounded-2xl border border-white/10 bg-background px-3 py-2'>
                          <span className='inline-flex items-center gap-2'>
                            <CalendarClock className='h-4 w-4 text-cyan-200' /> Next milestone
                          </span>
                          <span className='font-medium text-foreground'>{formatDateLabel(selectedGoalDerived?.nextMilestone)}</span>
                        </div>
                        <div className='flex items-center justify-between rounded-2xl border border-white/10 bg-background px-3 py-2'>
                          <span className='inline-flex items-center gap-2'>
                            <AlertTriangle className='h-4 w-4 text-cyan-200' /> Overdue KRs
                          </span>
                          <span className='font-medium text-foreground'>{selectedGoalDerived?.overdueKrCount ?? 0}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {message ? (
        <div className='fixed bottom-4 right-4 rounded-full border border-white/10 bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur'>
          {message}
        </div>
      ) : null}

      {onboardingStep >= 0 ? (
        <div className='fixed bottom-4 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-card/95 p-3 shadow-xl backdrop-blur'>
          <p className='text-xs font-semibold uppercase tracking-wide text-primary'>
            Goals Tour {onboardingStep + 1}/{GOALS_ONBOARDING_STEPS.length}
          </p>
          <p className='mt-1 text-sm font-semibold text-foreground'>{GOALS_ONBOARDING_STEPS[onboardingStep].title}</p>
          <p className='mt-1 text-xs text-muted-foreground'>{GOALS_ONBOARDING_STEPS[onboardingStep].description}</p>
          <div className='mt-3 flex items-center justify-between gap-2'>
            <Button type='button' variant='ghost' size='sm' onClick={closeOnboarding}>
              Skip
            </Button>
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => setOnboardingStep((current) => Math.max(0, current - 1))}
                disabled={onboardingStep === 0}
              >
                Back
              </Button>
              <Button type='button' size='sm' onClick={nextOnboardingStep}>
                {onboardingStep === GOALS_ONBOARDING_STEPS.length - 1 ? 'Finish' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
