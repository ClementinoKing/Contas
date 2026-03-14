import { AlertTriangle, CalendarClock, CheckCircle2, Flag, Link2, Plus, RefreshCw, Target, TrendingUp, UserRound, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

type GoalViewFilter = 'all' | 'mine' | 'department' | 'at_risk' | 'unowned'

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
    title: 'Track outcomes with key results',
    description: 'Each goal should have measurable key results so progress can be rolled up accurately.',
    target: 'main',
  },
  {
    title: 'Watch risks early',
    description: 'Use Needs attention and Recent updates to catch stale check-ins and slipping execution.',
    target: 'rail',
  },
  {
    title: 'Operate weekly',
    description: 'Update KR values, add weekly check-ins, and link tasks/projects to keep strategy tied to execution.',
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
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    case 'paused':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    case 'draft':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-400'
    case 'archived':
      return 'border-muted-foreground/20 bg-muted/20 text-muted-foreground'
    default:
      return 'border-primary/30 bg-primary/10 text-primary'
  }
}

function healthTone(value: GoalHealth) {
  switch (value) {
    case 'on_track':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    case 'at_risk':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    default:
      return 'border-rose-500/30 bg-rose-500/10 text-rose-400'
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

function daysSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24))
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

  const [selectedCycle, setSelectedCycle] = useState(getCurrentQuarterCycle())
  const [viewFilter, setViewFilter] = useState<GoalViewFilter>('all')
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
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
      const [
        goalsResult,
        keyResultsResult,
        checkinsResult,
        linksResult,
        profilesResult,
        projectsResult,
        tasksResult,
      ] = await Promise.all([
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
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  useEffect(() => {
    if (cycleOptions.includes(selectedCycle)) return
    setSelectedCycle(cycleOptions[0] ?? getCurrentQuarterCycle())
  }, [cycleOptions, selectedCycle])

  useEffect(() => {
    if (onboardingStep !== 1) return
    if (createOpen) return
    setCreateOpen(true)
  }, [createOpen, onboardingStep])

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
      const goalKrs = keyResults.filter((kr) => kr.goal_id === goal.id)
      const goalLinks = links.filter((link) => link.goal_id === goal.id)
      const goalCheckins = checkins.filter((checkin) => checkin.goal_id === goal.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latestCheckin = goalCheckins[0] ?? null

      const linkedTaskIds = goalLinks.filter((link) => link.link_type === 'task' && link.task_id).map((link) => link.task_id as string)
      const linkedProjectIds = goalLinks.filter((link) => link.link_type === 'project' && link.project_id).map((link) => link.project_id as string)

      const autoTaskUniverse = new Set<string>(linkedTaskIds)
      for (const projectId of linkedProjectIds) {
        for (const task of tasks) {
          if (task.project_id === projectId) autoTaskUniverse.add(task.id)
        }
      }

      const autoTasks = Array.from(autoTaskUniverse).map((taskId) => tasksById.get(taskId)).filter((task): task is TaskRow => Boolean(task))
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
        const isOverdue = due.getTime() < Date.now()
        if (!isOverdue) return false
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
  }, [checkins, goals, keyResults, links, tasks, tasksById])

  const filteredGoals = useMemo(() => {
    const query = search.trim().toLowerCase()
    return goals.filter((goal) => {
      if (goal.cycle !== selectedCycle) return false

      const derived = derivedByGoal.get(goal.id)
      const owner = goal.owner_id ? profileById.get(goal.owner_id) : null
      const ownerDepartment = owner?.department ?? goal.department ?? ''

      if (viewFilter === 'mine' && goal.owner_id !== currentUser?.id) return false
      if (viewFilter === 'department') {
        const currentDepartment = currentUser?.jobTitle ? profiles.find((profile) => profile.id === currentUser.id)?.department : null
        if (!currentDepartment) return false
        if ((ownerDepartment ?? '').toLowerCase() !== currentDepartment.toLowerCase()) return false
      }
      if (viewFilter === 'at_risk' && (derived?.autoHealth ?? goal.health) === 'on_track') return false
      if (viewFilter === 'unowned' && goal.owner_id && !(derived?.stale ?? false)) return false

      if (!query) return true
      const combined = `${goal.title} ${goal.description ?? ''} ${owner?.full_name ?? ''} ${goal.department ?? ''}`.toLowerCase()
      return combined.includes(query)
    })
  }, [currentUser?.id, currentUser?.jobTitle, derivedByGoal, goals, profileById, profiles, search, selectedCycle, viewFilter])

  const groupedGoals = useMemo(() => {
    const groups: Record<GoalHealth, GoalRow[]> = { on_track: [], at_risk: [], off_track: [] }
    for (const goal of filteredGoals) {
      const derived = derivedByGoal.get(goal.id)
      const health = derived?.autoHealth ?? goal.health
      groups[health].push(goal)
    }
    return groups
  }, [derivedByGoal, filteredGoals])

  const summary = useMemo(() => {
    const inCycle = goals.filter((goal) => goal.cycle === selectedCycle)
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
  }, [derivedByGoal, goals, selectedCycle])

  const needsAttention = useMemo(() => {
    return goals
      .map((goal) => ({ goal, derived: derivedByGoal.get(goal.id) }))
      .filter((item) => item.derived && (item.derived.overdueKrCount > 0 || item.derived.stale || item.derived.autoHealth === 'off_track'))
      .slice(0, 6)
  }, [derivedByGoal, goals])

  const recentUpdates = useMemo(() => {
    return [...checkins]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map((checkin) => ({
        checkin,
        goal: goals.find((goal) => goal.id === checkin.goal_id) ?? null,
        author: checkin.author_id ? profileById.get(checkin.author_id) : null,
      }))
  }, [checkins, goals, profileById])

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
      cycle: selectedCycle,
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
    <div className='space-y-4'>
      <Card className={cn(onboardingTarget === 'header' ? 'ring-2 ring-primary/50' : null)}>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div>
            <p className='text-sm font-semibold text-foreground'>Goals Strategy Layer</p>
            <p className='text-xs text-muted-foreground'>Align organizational outcomes to projects and tasks.</p>
          </div>
          <div className='flex items-center gap-2'>
            <select
              value={selectedCycle}
              onChange={(event) => setSelectedCycle(event.target.value)}
              className='h-9 rounded-md border border-input bg-background px-3 text-xs'
            >
              {cycleOptions.map((cycle) => (
                <option key={cycle} value={cycle}>
                  {cycle}
                </option>
              ))}
            </select>
            <Button size='sm' variant='outline' onClick={() => setCreateOpen((value) => !value)}>
              <Plus className='mr-1.5 h-4 w-4' />
              New Goal
            </Button>
          </div>
        </CardContent>
      </Card>

      {createOpen ? (
        <Card className={cn(onboardingTarget === 'create' ? 'ring-2 ring-primary/50' : null)}>
          <CardContent className='grid gap-3 p-3 md:grid-cols-2'>
            <Input value={newGoalTitle} onChange={(event) => setNewGoalTitle(event.target.value)} placeholder='Goal title' className='md:col-span-2' />
            <textarea
              value={newGoalDescription}
              onChange={(event) => setNewGoalDescription(event.target.value)}
              rows={3}
              placeholder='Goal description'
              className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2'
            />
            <select value={newGoalOwnerId} onChange={(event) => setNewGoalOwnerId(event.target.value)} className='h-10 rounded-md border border-input bg-background px-3 text-sm'>
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
              className='h-10 rounded-md border border-input bg-background px-3 text-sm'
            >
              <option value=''>Select department</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <Input type='number' min={1} max={10} value={newGoalConfidence} onChange={(event) => setNewGoalConfidence(event.target.value)} placeholder='Confidence 1-10' />
            <Input type='date' value={newGoalDueAt} onChange={(event) => setNewGoalDueAt(event.target.value)} />
            <div className='md:col-span-2 flex justify-end'>
              <Button onClick={() => void handleCreateGoal()} disabled={saving}>
                {saving ? 'Saving...' : 'Create Goal'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-2xl'>{summary.total}</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 text-xs text-muted-foreground'>Active goals in {selectedCycle}</CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-2xl text-emerald-400'>{summary.onTrack}</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 text-xs text-muted-foreground'>On track</CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-2xl text-amber-400'>{summary.atRisk}</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 text-xs text-muted-foreground'>At risk</CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-2xl text-rose-400'>{summary.offTrack}</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 text-xs text-muted-foreground'>Off track</CardContent>
        </Card>
      </section>

      <section className='grid gap-4 xl:grid-cols-[1.35fr_1fr]'>
        <div className={cn('space-y-4', onboardingTarget === 'main' ? 'rounded-lg ring-2 ring-primary/50' : null)}>
          <Card>
            <CardContent className='flex flex-wrap items-center gap-2 p-3'>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search goals, owner, department' className='min-w-[220px] flex-1' />
              <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value as GoalViewFilter)} className='h-10 rounded-md border border-input bg-background px-3 text-sm'>
                <option value='all'>All Goals</option>
                <option value='mine'>My Goals</option>
                <option value='department'>Department Goals</option>
                <option value='at_risk'>At Risk</option>
                <option value='unowned'>Unowned / No check-in</option>
              </select>
              <Button size='sm' variant='outline' onClick={() => window.dispatchEvent(new CustomEvent('contas:realtime-change', { detail: { table: 'goals', eventType: 'manual' } }))}>
                <RefreshCw className='mr-1.5 h-4 w-4' />
                Refresh
              </Button>
            </CardContent>
          </Card>

          {loading ? <p className='text-sm text-muted-foreground'>Loading goals...</p> : null}

          {(['on_track', 'at_risk', 'off_track'] as GoalHealth[]).map((groupKey) => {
            const groupGoals = groupedGoals[groupKey]
            return (
              <Card key={groupKey}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-base'>{formatHealthLabel(groupKey)}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {groupGoals.length === 0 ? <p className='text-sm text-muted-foreground'>No goals in this group.</p> : null}
                  {groupGoals.map((goal) => {
                    const owner = goal.owner_id ? profileById.get(goal.owner_id) : null
                    const derived = derivedByGoal.get(goal.id)
                    const goalKrs = keyResults.filter((kr) => kr.goal_id === goal.id)
                    const goalLinks = links.filter((link) => link.goal_id === goal.id)
                    const krDraft = krDraftByGoal[goal.id] ?? { title: '', metricType: 'number' as MetricType, target: '100', source: 'manual' as KrSource }
                    const checkinDraft = checkinDraftByGoal[goal.id] ?? { blockers: '', nextActions: '', confidence: '' }
                    const linkDraft = linkDraftByGoal[goal.id] ?? { linkType: 'project' as LinkType, targetId: '' }

                    return (
                      <article key={goal.id} className={cn('rounded-md border bg-muted/10 p-3', onboardingTarget === 'actions' ? 'ring-1 ring-primary/40' : null)}>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                          <div>
                            <p className='text-sm font-semibold text-foreground'>{goal.title}</p>
                            <p className='mt-1 text-xs text-muted-foreground'>
                              <span className='inline-flex items-center gap-1.5'><UserRound className='h-3.5 w-3.5' />{owner?.full_name ?? 'Unowned'}</span>
                              <span className='mx-2'>•</span>
                              <span>{goal.department ?? owner?.department ?? 'No department'}</span>
                            </p>
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            <Badge variant='outline' className={cn('capitalize', statusTone(goal.status))}>{formatStatusLabel(goal.status)}</Badge>
                            <Badge variant='outline' className={cn(healthTone(derived?.autoHealth ?? goal.health))}>{formatHealthLabel(derived?.autoHealth ?? goal.health)}</Badge>
                          </div>
                        </div>

                        <div className='mt-3 space-y-1.5'>
                          <div className='flex items-center justify-between text-xs'>
                            <span className='text-muted-foreground'>Progress</span>
                            <span className='font-medium text-foreground'>{derived?.progress ?? 0}%</span>
                          </div>
                          <div className='h-2 rounded-full bg-muted'>
                            <div className='h-full rounded-full bg-primary transition-[width] duration-300' style={{ width: `${derived?.progress ?? 0}%` }} />
                          </div>
                        </div>

                        <div className='mt-3 flex flex-wrap items-center gap-2 text-xs'>
                          <span className='inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-muted-foreground'>
                            <Zap className='h-3.5 w-3.5' /> Confidence {goal.confidence ?? derived?.latestCheckin?.confidence ?? 'N/A'}/10
                          </span>
                          <span className='inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-muted-foreground'>
                            <CalendarClock className='h-3.5 w-3.5' /> Next milestone {formatDateLabel(derived?.nextMilestone)}
                          </span>
                          <span className='inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-muted-foreground'>
                            <Link2 className='h-3.5 w-3.5' /> {derived?.linkedProjects ?? 0} project links • {derived?.linkedTasks ?? 0} task links
                          </span>
                        </div>

                        <div className='mt-3 grid gap-2 md:grid-cols-3'>
                          <div className='rounded-md border p-2'>
                            <p className='mb-1 text-xs font-semibold text-foreground'>Update progress</p>
                            {goalKrs.length === 0 ? <p className='text-xs text-muted-foreground'>No key results yet.</p> : null}
                            <div className='space-y-1.5'>
                              {goalKrs.slice(0, 3).map((kr) => (
                                <div key={kr.id} className='flex items-center gap-2'>
                                  <p className='line-clamp-1 flex-1 text-xs text-muted-foreground'>{kr.title}</p>
                                  <Input
                                    type='number'
                                    defaultValue={safeNumber(kr.current_value)}
                                    className='h-7 w-20 text-xs'
                                    onBlur={(event) => void updateKrCurrent(kr.id, event.target.value)}
                                    disabled={kr.source === 'auto'}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className='rounded-md border p-2'>
                            <p className='mb-1 text-xs font-semibold text-foreground'>Add check-in</p>
                            <Input
                              value={checkinDraft.confidence}
                              onChange={(event) =>
                                setCheckinDraftByGoal((current) => ({
                                  ...current,
                                  [goal.id]: { ...checkinDraft, confidence: event.target.value },
                                }))
                              }
                              placeholder='Confidence (1-10)'
                              type='number'
                              min={1}
                              max={10}
                              className='mb-1 h-7 text-xs'
                            />
                            <textarea
                              value={checkinDraft.blockers}
                              onChange={(event) =>
                                setCheckinDraftByGoal((current) => ({
                                  ...current,
                                  [goal.id]: { ...checkinDraft, blockers: event.target.value },
                                }))
                              }
                              rows={2}
                              placeholder='Blockers'
                              className='mb-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs'
                            />
                            <textarea
                              value={checkinDraft.nextActions}
                              onChange={(event) =>
                                setCheckinDraftByGoal((current) => ({
                                  ...current,
                                  [goal.id]: { ...checkinDraft, nextActions: event.target.value },
                                }))
                              }
                              rows={2}
                              placeholder='Next actions'
                              className='mb-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs'
                            />
                            <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => void addCheckin(goal.id)}>
                              Add check-in
                            </Button>
                          </div>

                          <div className='rounded-md border p-2'>
                            <p className='mb-1 text-xs font-semibold text-foreground'>View linked work</p>
                            <div className='mb-1 flex gap-1'>
                              <select
                                value={linkDraft.linkType}
                                onChange={(event) =>
                                  setLinkDraftByGoal((current) => ({
                                    ...current,
                                    [goal.id]: { linkType: event.target.value as LinkType, targetId: '' },
                                  }))
                                }
                                className='h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs'
                              >
                                <option value='project'>Project</option>
                                <option value='task'>Task</option>
                              </select>
                              <select
                                value={linkDraft.targetId}
                                onChange={(event) =>
                                  setLinkDraftByGoal((current) => ({
                                    ...current,
                                    [goal.id]: { ...linkDraft, targetId: event.target.value },
                                  }))
                                }
                                className='h-7 flex-[2] rounded-md border border-input bg-background px-2 text-xs'
                              >
                                <option value=''>Select</option>
                                {(linkDraft.linkType === 'project' ? projects : tasks).map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {'name' in item ? item.name ?? 'Untitled project' : item.title ?? 'Untitled task'}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Button size='sm' variant='outline' className='mb-1 h-7 text-xs' onClick={() => void addLink(goal.id)}>
                              Link
                            </Button>
                            <p className='text-xs text-muted-foreground'>
                              {goalLinks.length} link(s)
                            </p>
                          </div>
                        </div>

                        <div className='mt-3 rounded-md border p-2'>
                          <p className='mb-1 text-xs font-semibold text-foreground'>Key Results</p>
                          <div className='mb-2 grid gap-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]'>
                            <Input
                              value={krDraft.title}
                              onChange={(event) =>
                                setKrDraftByGoal((current) => ({
                                  ...current,
                                  [goal.id]: { ...krDraft, title: event.target.value },
                                }))
                              }
                              placeholder='KR title'
                              className='h-7 text-xs'
                            />
                            <select
                              value={krDraft.metricType}
                              onChange={(event) =>
                                setKrDraftByGoal((current) => ({
                                  ...current,
                                  [goal.id]: { ...krDraft, metricType: event.target.value as MetricType },
                                }))
                              }
                              className='h-7 rounded-md border border-input bg-background px-2 text-xs'
                            >
                              <option value='percentage'>Percentage</option>
                              <option value='number'>Number</option>
                              <option value='currency'>Currency</option>
                              <option value='boolean'>Boolean milestone</option>
                            </select>
                            <Input
                              value={krDraft.target}
                              onChange={(event) =>
                                setKrDraftByGoal((current) => ({
                                  ...current,
                                  [goal.id]: { ...krDraft, target: event.target.value },
                                }))
                              }
                              placeholder='Target'
                              type='number'
                              className='h-7 text-xs'
                            />
                            <select
                              value={krDraft.source}
                              onChange={(event) =>
                                setKrDraftByGoal((current) => ({
                                  ...current,
                                  [goal.id]: { ...krDraft, source: event.target.value as KrSource },
                                }))
                              }
                              className='h-7 rounded-md border border-input bg-background px-2 text-xs'
                            >
                              <option value='manual'>Manual</option>
                              <option value='auto'>Auto</option>
                            </select>
                            <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => void addKeyResult(goal.id)}>
                              Add KR
                            </Button>
                          </div>

                          <div className='space-y-1'>
                            {goalKrs.length === 0 ? <p className='text-xs text-muted-foreground'>No KRs yet.</p> : null}
                            {goalKrs.map((kr) => {
                              const krProgress = calculateKrProgress(kr)
                              return (
                                <div key={kr.id} className='flex items-center justify-between gap-2 rounded-md border bg-background/40 px-2 py-1.5'>
                                  <div>
                                    <p className='text-xs font-medium text-foreground'>{kr.title}</p>
                                    <p className='text-[11px] text-muted-foreground'>
                                      {kr.metric_type} • {safeNumber(kr.current_value)} / {safeNumber(kr.target_value)} • {kr.source}
                                    </p>
                                  </div>
                                  <Badge variant='outline' className='text-[11px]'>
                                    {krProgress}%
                                  </Badge>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className={cn('space-y-4', onboardingTarget === 'rail' ? 'rounded-lg ring-2 ring-primary/50' : null)}>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Needs attention</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {needsAttention.length === 0 ? <p className='text-sm text-muted-foreground'>No critical goal alerts.</p> : null}
              {needsAttention.map((item) => (
                <article key={item.goal.id} className='rounded-md border bg-muted/10 p-2'>
                  <p className='text-sm font-medium text-foreground'>{item.goal.title}</p>
                  <div className='mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    {item.derived?.overdueKrCount ? (
                      <span className='inline-flex items-center gap-1.5 text-amber-400'>
                        <AlertTriangle className='h-3.5 w-3.5' /> {item.derived.overdueKrCount} overdue KR(s)
                      </span>
                    ) : null}
                    {item.derived?.stale ? (
                      <span className='inline-flex items-center gap-1.5 text-rose-400'>
                        <Flag className='h-3.5 w-3.5' /> stale check-in
                      </span>
                    ) : null}
                    {item.derived?.autoHealth === 'off_track' ? (
                      <span className='inline-flex items-center gap-1.5 text-rose-400'>
                        <TrendingUp className='h-3.5 w-3.5' /> off track
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Recent updates</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {recentUpdates.length === 0 ? <p className='text-sm text-muted-foreground'>No check-ins yet.</p> : null}
              {recentUpdates.map((item) => (
                <article key={item.checkin.id} className='rounded-md border bg-muted/10 p-2'>
                  <p className='text-xs font-medium text-foreground'>{item.goal?.title ?? 'Unknown goal'}</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {(item.author?.full_name ?? 'Unknown user')} • {new Date(item.checkin.created_at).toLocaleString()}
                  </p>
                  {item.checkin.blockers ? (
                    <p className='mt-1 line-clamp-2 text-xs text-amber-400'>Blockers: {item.checkin.blockers}</p>
                  ) : null}
                  {item.checkin.next_actions ? (
                    <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>Next: {item.checkin.next_actions}</p>
                  ) : null}
                </article>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Goal rituals</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 text-xs text-muted-foreground'>
              <p className='inline-flex items-center gap-1.5'><CheckCircle2 className='h-3.5 w-3.5 text-emerald-400' /> Weekly owner check-ins required</p>
              <p className='inline-flex items-center gap-1.5'><AlertTriangle className='h-3.5 w-3.5 text-amber-400' /> Alerts when KR pace drops</p>
              <p className='inline-flex items-center gap-1.5'><Target className='h-3.5 w-3.5 text-sky-400' /> Link execution work to outcomes</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {message ? (
        <div className='fixed bottom-4 right-4 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm'>
          {message}
        </div>
      ) : null}

      {onboardingStep >= 0 ? (
        <div className='fixed bottom-4 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur'>
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
