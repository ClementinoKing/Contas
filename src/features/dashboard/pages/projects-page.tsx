import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowUpRight, BriefcaseBusiness, ListFilter, Loader2, MoreHorizontal, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type ProjectRow = {
  id: string
  name: string | null
  key: string | null
  color: string | null
  status: string | null
  description: string | null
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
  colorClass: string
  status: string
  description: string
  taskCount: number
  progressPercent: number
  lastUpdatedLabel: string
  team: ProjectMember[]
}

const PROJECT_COLOR_FALLBACKS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500']
const STATUS_TONE: Record<string, string> = {
  planned: 'border-sky-400/35 bg-sky-500/10 text-sky-400',
  in_progress: 'border-amber-400/35 bg-amber-500/10 text-amber-400',
  review: 'border-violet-400/35 bg-violet-500/10 text-violet-400',
  blocked: 'border-rose-400/35 bg-rose-500/10 text-rose-400',
  done: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-400',
  completed: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-400',
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

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [taskAssignees, setTaskAssignees] = useState<Array<{ task_id: string; assignee_id: string }>>([])
  const [profiles, setProfiles] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'updated' | 'progress' | 'tasks' | 'name'>('updated')

  useEffect(() => {
    let cancelled = false

    const loadProjects = async () => {
      setLoading(true)
      const [projectsResult, tasksResult, assigneesResult, profilesResult] = await Promise.all([
        supabase.from('projects').select('id, name, key, color, status, description').order('name', { ascending: true }),
        supabase.from('tasks').select('id, project_id, status, completed_at, created_at'),
        supabase.from('task_assignees').select('task_id, assignee_id'),
        supabase.from('profiles').select('id, full_name, avatar_url'),
      ])
      if (cancelled) return

      setProjects(projectsResult.error ? [] : ((projectsResult.data as ProjectRow[] | null) ?? []))
      setTasks(tasksResult.error ? [] : ((tasksResult.data as TaskRow[] | null) ?? []))
      setTaskAssignees(assigneesResult.error ? [] : (assigneesResult.data ?? []))
      setProfiles(profilesResult.error ? [] : ((profilesResult.data as ProjectMember[] | null) ?? []))
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

    return projects.map((project, index) => {
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
        colorClass: project.color?.trim() || PROJECT_COLOR_FALLBACKS[index % PROJECT_COLOR_FALLBACKS.length],
        status: project.status?.trim() || 'planned',
        description: project.description?.trim() || 'No description yet. Add context, milestones, and delivery notes for the team.',
        taskCount,
        progressPercent,
        lastUpdatedLabel,
        team,
      } satisfies ProjectCard
    })
  }, [profiles, projects, taskAssignees, tasks])

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
          <div className='col-span-full flex min-h-[180px] items-center justify-center rounded-xl border bg-card/60 text-sm text-muted-foreground'>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            Loading projects...
          </div>
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
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', card.colorClass)} />
                      <p className='truncate text-sm font-semibold text-foreground'>{card.name}</p>
                    </div>
                    <p className='mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground'>{card.key}</p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='icon' className='h-7 w-7 rounded-md opacity-75 transition-opacity group-hover:opacity-100'>
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' className='w-44'>
                      <DropdownMenuLabel>Project</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to={`/dashboard/projects/${card.id}`}>Open project</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          void navigator.clipboard?.writeText(card.key)
                        }}
                      >
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
    </div>
  )
}
