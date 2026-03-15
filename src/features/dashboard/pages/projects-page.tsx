import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowUpRight, BriefcaseBusiness, Copy, FolderOpen, ListFilter, Lock, MoreHorizontal, PencilLine, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/context/auth-context'
import { DEFAULT_PROJECT_COLOR, PROJECT_COLOR_OPTIONS, normalizeProjectColor, projectDotStyle } from '@/features/projects/lib/project-colors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type ProjectRow = {
  id: string
  name: string | null
  key: string | null
  color: string | null
  status: string | null
  description: string | null
  created_by: string | null
  owner_id: string | null
  start_date: string | null
  end_date: string | null
}

type TaskRow = {
  id: string
  project_id: string | null
  status: string | null
  completed_at: string | null
  created_at: string | null
}

type ProjectMember = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

type ProjectCard = {
  id: string
  name: string
  key: string
  color: string
  status: string
  description: string
  rawDescription: string | null
  canEdit: boolean
  ownerId: string | null
  startDate: string | null
  endDate: string | null
  taskCount: number
  progressPercent: number
  lastUpdatedLabel: string
  team: ProjectMember[]
}

type ProjectsCachePayload = {
  cachedAt: number
  projects: ProjectRow[]
  tasks: TaskRow[]
  taskAssignees: Array<{ task_id: string; assignee_id: string }>
  profiles: ProjectMember[]
}

const STATUS_TONE: Record<string, string> = {
  planned: 'border-sky-400/35 bg-sky-500/10 text-sky-400',
  in_progress: 'border-amber-400/35 bg-amber-500/10 text-amber-400',
  review: 'border-violet-400/35 bg-violet-500/10 text-violet-400',
  blocked: 'border-rose-400/35 bg-rose-500/10 text-rose-400',
  done: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-400',
  completed: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-400',
}

const PROJECTS_CACHE_KEY = 'contas.projects.page.v1'
const PROJECTS_CACHE_TTL_MS = 3 * 60 * 1000

function readProjectsCache(): ProjectsCachePayload | null {
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ProjectsCachePayload
    if (!parsed || typeof parsed.cachedAt !== 'number') return null
    if (Date.now() - parsed.cachedAt > PROJECTS_CACHE_TTL_MS) return null
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks)) return null
    if (!Array.isArray(parsed.taskAssignees) || !Array.isArray(parsed.profiles)) return null
    return parsed
  } catch {
    return null
  }
}

function writeProjectsCache(payload: Omit<ProjectsCachePayload, 'cachedAt'>) {
  localStorage.setItem(
    PROJECTS_CACHE_KEY,
    JSON.stringify({
      cachedAt: Date.now(),
      ...payload,
    } satisfies ProjectsCachePayload),
  )
}

function statusLabel(value: string | null) {
  const key = (value ?? 'planned').toLowerCase()
  if (key === 'in_progress') return 'In Progress'
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function statusTone(value: string | null) {
  return STATUS_TONE[(value ?? 'planned').toLowerCase()] ?? 'border-border bg-muted/30 text-muted-foreground'
}

function initialsFor(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  )
}

function ProjectsGridSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <article key={`project-skeleton-${index}`} className='rounded-xl border bg-card p-3 shadow-sm'>
          <div className='h-4 w-3/5 rounded bg-muted/60 animate-pulse' />
          <div className='mt-2 h-3 w-1/4 rounded bg-muted/50 animate-pulse' />
          <div className='mt-3 h-6 w-24 rounded-full bg-muted/50 animate-pulse' />
          <div className='mt-3 space-y-1.5'>
            <div className='h-3 w-full rounded bg-muted/40 animate-pulse' />
            <div className='h-3 w-4/5 rounded bg-muted/40 animate-pulse' />
          </div>
          <div className='mt-3 space-y-1.5'>
            <div className='h-2 w-full rounded bg-muted/40 animate-pulse' />
            <div className='h-1.5 w-full rounded bg-muted/30 animate-pulse' />
          </div>
          <div className='mt-4 flex items-center justify-between'>
            <div className='flex -space-x-1'>
              <div className='h-6 w-6 rounded-full border border-background bg-muted/50 animate-pulse' />
              <div className='h-6 w-6 rounded-full border border-background bg-muted/50 animate-pulse' />
              <div className='h-6 w-6 rounded-full border border-background bg-muted/50 animate-pulse' />
            </div>
            <div className='h-3 w-12 rounded bg-muted/40 animate-pulse' />
          </div>
        </article>
      ))}
    </>
  )
}

export function ProjectsPage() {
  const { currentUser } = useAuth()
  const cached = readProjectsCache()
  const [projects, setProjects] = useState<ProjectRow[]>(cached?.projects ?? [])
  const [tasks, setTasks] = useState<TaskRow[]>(cached?.tasks ?? [])
  const [taskAssignees, setTaskAssignees] = useState<Array<{ task_id: string; assignee_id: string }>>(cached?.taskAssignees ?? [])
  const [profiles, setProfiles] = useState<ProjectMember[]>(cached?.profiles ?? [])
  const [loading, setLoading] = useState(() => !cached)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'updated' | 'progress' | 'tasks' | 'name'>('updated')
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [editProjectSubmitting, setEditProjectSubmitting] = useState(false)
  const [editProjectError, setEditProjectError] = useState<string | null>(null)
  const [editProjectId, setEditProjectId] = useState<string | null>(null)
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectOwnerId, setEditProjectOwnerId] = useState('')
  const [editProjectColor, setEditProjectColor] = useState(DEFAULT_PROJECT_COLOR)
  const [editProjectStartDate, setEditProjectStartDate] = useState<Date | undefined>()
  const [editProjectEndDate, setEditProjectEndDate] = useState<Date | undefined>()
  const [editProjectDescription, setEditProjectDescription] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadProjects = async () => {
      setLoading(true)
      const [projectsResult, tasksResult, assigneesResult, profilesResult] = await Promise.all([
        supabase.from('projects').select('id, name, key, color, status, description, created_by, owner_id, start_date, end_date').order('name', { ascending: true }),
        supabase.from('tasks').select('id, project_id, status, completed_at, created_at'),
        supabase.from('task_assignees').select('task_id, assignee_id'),
        supabase.from('profiles').select('id, full_name, avatar_url'),
      ])
      if (cancelled) return

      const nextProjects = projectsResult.error ? [] : ((projectsResult.data as ProjectRow[] | null) ?? [])
      const nextTasks = tasksResult.error ? [] : ((tasksResult.data as TaskRow[] | null) ?? [])
      const nextTaskAssignees = assigneesResult.error ? [] : (assigneesResult.data ?? [])
      const nextProfiles = profilesResult.error ? [] : ((profilesResult.data as ProjectMember[] | null) ?? [])

      setProjects(nextProjects)
      setTasks(nextTasks)
      setTaskAssignees(nextTaskAssignees)
      setProfiles(nextProfiles)
      writeProjectsCache({
        projects: nextProjects,
        tasks: nextTasks,
        taskAssignees: nextTaskAssignees,
        profiles: nextProfiles,
      })
      setLoading(false)
    }

    void loadProjects()

    const onRealtimeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail
      if (!detail?.table) return
      if (!['projects', 'tasks', 'task_assignees', 'profiles'].includes(detail.table)) return
      void loadProjects()
    }
    const onProjectCreated = () => {
      void loadProjects()
    }
    window.addEventListener('contas:realtime-change', onRealtimeChange as EventListener)
    window.addEventListener('contas:project-created', onProjectCreated as EventListener)

    return () => {
      cancelled = true
      window.removeEventListener('contas:realtime-change', onRealtimeChange as EventListener)
      window.removeEventListener('contas:project-created', onProjectCreated as EventListener)
    }
  }, [])

  const projectCards = useMemo(() => {
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const taskIdsByProject = new Map<string, string[]>()
    const completedTaskIdsByProject = new Map<string, number>()
    const latestTaskActivityByProject = new Map<string, string>()

    for (const task of tasks) {
      if (!task.project_id) continue
      const list = taskIdsByProject.get(task.project_id) ?? []
      list.push(task.id)
      taskIdsByProject.set(task.project_id, list)

      const isCompleted = Boolean(task.completed_at) || ['done', 'completed', 'closed'].includes((task.status ?? '').toLowerCase())
      if (isCompleted) {
        completedTaskIdsByProject.set(task.project_id, (completedTaskIdsByProject.get(task.project_id) ?? 0) + 1)
      }

      if (task.created_at) {
        const current = latestTaskActivityByProject.get(task.project_id)
        if (!current || new Date(task.created_at).getTime() > new Date(current).getTime()) {
          latestTaskActivityByProject.set(task.project_id, task.created_at)
        }
      }
    }

    const teamIdsByProject = new Map<string, Set<string>>()
    for (const link of taskAssignees) {
      const task = taskById.get(link.task_id)
      if (!task?.project_id) continue
      const set = teamIdsByProject.get(task.project_id) ?? new Set<string>()
      set.add(link.assignee_id)
      teamIdsByProject.set(task.project_id, set)
    }

    return projects.map((project) => {
      const taskCount = taskIdsByProject.get(project.id)?.length ?? 0
      const completedCount = completedTaskIdsByProject.get(project.id) ?? 0
      const progressPercent = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0
      const activityTimestamp = latestTaskActivityByProject.get(project.id)
      const lastUpdatedLabel =
        activityTimestamp && !Number.isNaN(new Date(activityTimestamp).getTime())
          ? `${formatDistanceToNowStrict(new Date(activityTimestamp), { addSuffix: true })}`
          : 'No recent updates'

      const team = Array.from(teamIdsByProject.get(project.id) ?? [])
        .map((profileId) => profilesById.get(profileId))
        .filter((profile): profile is ProjectMember => Boolean(profile))
        .slice(0, 4)

      return {
        id: project.id,
        name: project.name?.trim() || 'Untitled project',
        key: project.key?.trim() || 'PRJ',
        color: normalizeProjectColor(project.color),
        status: project.status?.trim() || 'planned',
        description: project.description?.trim() || 'No description yet. Add context, milestones, and delivery notes for the team.',
        rawDescription: project.description?.trim() || null,
        canEdit: Boolean(currentUser?.id && project.created_by === currentUser.id),
        ownerId: project.owner_id,
        startDate: project.start_date,
        endDate: project.end_date,
        taskCount,
        progressPercent,
        lastUpdatedLabel,
        team,
      } satisfies ProjectCard
    })
  }, [currentUser?.id, profiles, projects, taskAssignees, tasks])

  const statusOptions = useMemo(() => {
    const seen = new Set<string>()
    const values: Array<{ key: string; label: string }> = []
    for (const card of projectCards) {
      const key = card.status.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      values.push({ key, label: statusLabel(key) })
    }
    return values
  }, [projectCards])

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase()
    const byFilter = projectCards.filter((card) => {
      if (statusFilter !== 'all' && card.status.toLowerCase() !== statusFilter) return false
      if (!query) return true
      return `${card.name} ${card.key} ${card.description}`.toLowerCase().includes(query)
    })

    if (sortBy === 'name') return [...byFilter].sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'tasks') return [...byFilter].sort((a, b) => b.taskCount - a.taskCount)
    if (sortBy === 'progress') return [...byFilter].sort((a, b) => b.progressPercent - a.progressPercent)
    return [...byFilter].sort((a, b) => {
      const aTime = a.lastUpdatedLabel === 'No recent updates' ? 0 : 1
      const bTime = b.lastUpdatedLabel === 'No recent updates' ? 0 : 1
      return bTime - aTime
    })
  }, [projectCards, search, sortBy, statusFilter])

  const ownerOptions = useMemo(
    () => profiles.map((profile) => ({ id: profile.id, label: profile.full_name ?? 'Unknown user' })).sort((a, b) => a.label.localeCompare(b.label)),
    [profiles],
  )

  const openEditProject = (card: ProjectCard) => {
    if (!card.canEdit) return
    setEditProjectId(card.id)
    setEditProjectName(card.name)
    setEditProjectOwnerId(card.ownerId ?? '')
    setEditProjectColor(normalizeProjectColor(card.color))
    setEditProjectStartDate(card.startDate ? new Date(card.startDate) : undefined)
    setEditProjectEndDate(card.endDate ? new Date(card.endDate) : undefined)
    setEditProjectDescription(card.rawDescription ?? '')
    setEditProjectError(null)
    setEditProjectOpen(true)
  }

  const handleSaveProjectEdits = async () => {
    if (!editProjectId) return
    const trimmedName = editProjectName.trim()
    const trimmedDescription = editProjectDescription.trim()
    if (!trimmedName) {
      setEditProjectError('Project name is required.')
      return
    }
    if (editProjectStartDate && editProjectEndDate && editProjectStartDate.getTime() > editProjectEndDate.getTime()) {
      setEditProjectError('Start date must be before or equal to target end date.')
      return
    }

    setEditProjectSubmitting(true)
    setEditProjectError(null)
    const payload = {
      name: trimmedName,
      owner_id: editProjectOwnerId || null,
      color: normalizeProjectColor(editProjectColor),
      start_date: editProjectStartDate ? editProjectStartDate.toISOString().slice(0, 10) : null,
      end_date: editProjectEndDate ? editProjectEndDate.toISOString().slice(0, 10) : null,
      description: trimmedDescription || null,
    }

    const { data, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', editProjectId)
      .select('id, name, key, color, status, description, owner_id, start_date, end_date')
      .limit(1)
    const updatedProject = data?.[0] as ProjectRow | undefined
    if (error || !updatedProject) {
      setEditProjectSubmitting(false)
      setEditProjectError(error?.message ?? 'Project was not updated. Please retry.')
      return
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === editProjectId
          ? {
              ...project,
              ...updatedProject,
            }
          : project,
      ),
    )
    setEditProjectSubmitting(false)
    setEditProjectOpen(false)
    window.dispatchEvent(new CustomEvent('contas:realtime-change', { detail: { table: 'projects', eventType: 'manual' } }))
  }

  return (
    <div className='space-y-6'>
      <section className='rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur-sm md:p-5'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='space-y-1'>
            <p className='inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
              <BriefcaseBusiness className='h-3.5 w-3.5' />
              Projects Hub
            </p>
            <h1 className='text-2xl font-semibold tracking-tight text-foreground'>Projects</h1>
            <p className='max-w-2xl text-sm text-muted-foreground'>
              Track delivery health, ownership, and momentum across your workspace in one place.
            </p>
          </div>
          <Button
            className='h-10 gap-2 px-4'
            onClick={() => {
              window.dispatchEvent(new CustomEvent('contas:open-create-project'))
            }}
          >
            <Plus className='h-4 w-4' />
            New Project
          </Button>
        </div>

        <div className='mt-4 grid gap-2 md:grid-cols-[1.25fr_220px_220px]'>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search by project name, code, or description' className='h-10 pl-9' />
          </div>
          <div className='relative'>
            <ListFilter className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className='h-10 w-full rounded-md border bg-background pl-9 pr-8 text-sm'>
              <option value='all'>All statuses</option>
              {statusOptions.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div className='relative'>
            <SlidersHorizontal className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'updated' | 'progress' | 'tasks' | 'name')} className='h-10 w-full rounded-md border bg-background pl-9 pr-8 text-sm'>
              <option value='updated'>Sort: Updated</option>
              <option value='progress'>Sort: Progress</option>
              <option value='tasks'>Sort: Task volume</option>
              <option value='name'>Sort: Name</option>
            </select>
          </div>
        </div>
      </section>

      <section className='grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
        {loading ? (
          <ProjectsGridSkeleton />
        ) : null}

        {!loading && filteredCards.length === 0 ? (
          <div className='col-span-full rounded-xl border border-dashed bg-muted/10 p-8 text-center'>
            <p className='text-sm font-medium text-foreground'>No projects match your current filters.</p>
            <p className='mt-1 text-sm text-muted-foreground'>Adjust search or create a new project to get started.</p>
          </div>
        ) : null}

        {!loading
          ? filteredCards.map((card) => (
              <article
                key={card.id}
                className='group rounded-xl border bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md'
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={projectDotStyle(card.color)} />
                      <p className='truncate text-sm font-semibold text-foreground'>{card.name}</p>
                      {!card.canEdit ? <Lock className='h-3.5 w-3.5 shrink-0 text-muted-foreground' aria-label='Locked project' /> : null}
                    </div>
                    <p className='mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground'>{card.key}</p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='icon' className='h-7 w-7 rounded-md opacity-75 transition-opacity group-hover:opacity-100'>
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' className='w-52 border-border/70 bg-card shadow-[0_10px_28px_rgba(0,0,0,0.25)]'>
                      <DropdownMenuLabel className='text-xs uppercase tracking-[0.12em] text-muted-foreground'>Project</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild className='gap-2'>
                        <Link to={`/dashboard/projects/${card.id}`}>
                          <FolderOpen className='h-4 w-4 text-muted-foreground' />
                          Open project
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className='gap-2' onSelect={() => openEditProject(card)} disabled={!card.canEdit}>
                        {card.canEdit ? <PencilLine className='h-4 w-4 text-muted-foreground' /> : <Lock className='h-4 w-4 text-muted-foreground' />}
                        {card.canEdit ? 'Edit project' : 'Edit locked'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='gap-2'
                        onClick={() => {
                          void navigator.clipboard?.writeText(card.key)
                        }}
                      >
                        <Copy className='h-4 w-4 text-muted-foreground' />
                        Copy code
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className='mt-2 flex items-center justify-between gap-2'>
                  <Badge className={cn('h-6 rounded-full border px-2.5 text-[11px] font-medium', statusTone(card.status))}>{statusLabel(card.status)}</Badge>
                  <span className='text-xs text-muted-foreground'>{card.taskCount} tasks</span>
                </div>

                <Link to={`/dashboard/projects/${card.id}`} className='mt-3 block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50'>
                  <p className='line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground'>{card.description}</p>
                </Link>

                <div className='mt-3 space-y-1.5'>
                  <div className='flex items-center justify-between text-[11px] text-muted-foreground'>
                    <span>Progress</span>
                    <span className='font-medium text-foreground'>{card.progressPercent}%</span>
                  </div>
                  <div className='h-1.5 rounded-full bg-muted'>
                    <div className='h-full rounded-full bg-primary transition-[width] duration-300' style={{ width: `${card.progressPercent}%` }} />
                  </div>
                </div>

                <div className='mt-3 flex items-center justify-between border-t pt-2.5'>
                  <div className='flex items-center'>
                    {card.team.length === 0 ? (
                      <span className='text-xs text-muted-foreground'>No team assigned</span>
                    ) : (
                      card.team.map((member, index) => (
                        <Avatar key={member.id} className={cn('h-6 w-6 border border-background', index > 0 && '-ml-2')}>
                          {member.avatar_url ? <AvatarImage src={member.avatar_url} alt={member.full_name ?? 'Team member'} /> : null}
                          <AvatarFallback className='text-[10px] font-semibold'>{initialsFor(member.full_name ?? 'User')}</AvatarFallback>
                        </Avatar>
                      ))
                    )}
                  </div>
                  <Link
                    to={`/dashboard/projects/${card.id}`}
                    className='inline-flex items-center gap-1 text-xs font-medium text-primary opacity-80 transition-opacity hover:opacity-100'
                  >
                    Open
                    <ArrowUpRight className='h-3.5 w-3.5' />
                  </Link>
                </div>

                <p className='mt-2 text-[11px] text-muted-foreground'>Updated {card.lastUpdatedLabel}</p>
              </article>
            ))
          : null}
      </section>

      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update project details and color.</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Project Name</label>
              <Input value={editProjectName} onChange={(event) => setEditProjectName(event.target.value)} />
            </div>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Owner</label>
              <select
                value={editProjectOwnerId}
                onChange={(event) => setEditProjectOwnerId(event.target.value)}
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
              >
                <option value=''>Unassigned</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.label}
                  </option>
                ))}
              </select>
            </div>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Start Date</label>
              <DatePicker value={editProjectStartDate} onChange={setEditProjectStartDate} placeholder='Pick start date' />
            </div>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Target End Date</label>
              <DatePicker value={editProjectEndDate} onChange={setEditProjectEndDate} placeholder='Pick end date' />
            </div>
            <div className='space-y-2 md:col-span-2'>
              <label className='text-sm font-medium text-foreground'>Project Color</label>
              <div className='flex flex-wrap items-center gap-3 rounded-md border border-input bg-background px-3 py-2'>
                {PROJECT_COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type='button'
                    onClick={() => setEditProjectColor(color)}
                    className={`h-6 w-6 rounded-full border-2 ${normalizeProjectColor(editProjectColor) === color ? 'border-foreground' : 'border-transparent'}`}
                    style={projectDotStyle(color)}
                    aria-label={`Select project color ${color}`}
                  />
                ))}
                <span className='ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground'>
                  Custom
                  <input
                    type='color'
                    value={normalizeProjectColor(editProjectColor)}
                    onChange={(event) => setEditProjectColor(event.target.value)}
                    className='h-7 w-9 cursor-pointer rounded border border-input bg-background p-0.5'
                    aria-label='Pick custom project color'
                  />
                </span>
              </div>
            </div>
            <div className='space-y-2 md:col-span-2'>
              <label className='text-sm font-medium text-foreground'>Description</label>
              <textarea
                rows={5}
                value={editProjectDescription}
                onChange={(event) => setEditProjectDescription(event.target.value)}
                className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
              />
            </div>
          </div>
          <DialogFooter>
            {editProjectError ? <p className='mr-auto text-sm text-destructive'>{editProjectError}</p> : null}
            <Button type='button' variant='outline' onClick={() => setEditProjectOpen(false)}>
              Cancel
            </Button>
            <Button type='button' onClick={() => void handleSaveProjectEdits()} disabled={editProjectSubmitting}>
              {editProjectSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
