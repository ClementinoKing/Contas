import { CalendarClock, ChartColumnBig, FolderKanban, Rocket, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useOrganization } from '@/features/organization/context/organization-context'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type StatusLabel = 'In Progress' | 'Review' | 'Planned' | 'Blocked'
type TrendRange = '7d' | '30d' | '90d'
type TrendPoint = { date: Date; label: string; created: number; review: number; overdue: number }
type DashboardTask = {
  id: string
  title: string
  status: StatusLabel
  projectId: string
  projectName: string
  owners: string[]
  dueAt: string | null
  createdAt: string
}
type DashboardProject = { id: string; name: string }

const TREND_RANGE_OPTIONS: Array<{ key: TrendRange; label: string; days: number }> = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
]

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function subtractDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() - days)
  return next
}

function formatTrendLabel(date: Date, range: TrendRange) {
  if (range === '90d') {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date)
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function mapTaskStatus(value?: string | null): StatusLabel {
  switch (value) {
    case 'in_progress':
      return 'In Progress'
    case 'review':
      return 'Review'
    case 'blocked':
      return 'Blocked'
    default:
      return 'Planned'
  }
}

function buildTrendSeries(days: number, range: TrendRange, tasks: DashboardTask[]): TrendPoint[] {
  const today = startOfLocalDay(new Date())

  return Array.from({ length: days }, (_, index) => {
    const date = subtractDays(today, days - index - 1)
    const created = tasks.filter((task) => isSameDay(new Date(task.createdAt), date)).length
    const review = tasks.filter((task) => task.status === 'Review' && task.dueAt && isSameDay(new Date(task.dueAt), date)).length
    const overdue = tasks.filter((task) => {
      if (!task.dueAt || task.status === 'Review') return false
      const dueDate = new Date(task.dueAt)
      return isSameDay(dueDate, date) && dueDate < today
    }).length

    return {
      date,
      label: formatTrendLabel(date, range),
      created,
      review,
      overdue,
    }
  })
}

function daysUntil(date: Date) {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((target - start) / (1000 * 60 * 60 * 24))
}

function formatDueLabel(value: string | null) {
  if (!value) return 'No due date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No due date'
  const today = startOfLocalDay(new Date())
  if (isSameDay(startOfLocalDay(parsed), today)) return 'Today'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed)
}

export function DashboardHomePage() {
  const { currentOrganization } = useOrganization()
  const [trendRange, setTrendRange] = useState<TrendRange>('30d')
  const [tasks, setTasks] = useState<DashboardTask[]>([])
  const [projects, setProjects] = useState<DashboardProject[]>([])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      supabase.from('projects').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('tasks').select('id, title, status, project_id, assigned_to, due_at, created_at').order('created_at', { ascending: false }),
      supabase.from('task_assignees').select('task_id, assignee_id'),
    ]).then(([projectsResult, profilesResult, tasksResult, taskAssigneesResult]) => {
      if (cancelled) return

      const nextProjects = (projectsResult.data ?? []).map((project) => ({ id: project.id, name: project.name ?? 'Untitled project' }))
      const profileMap = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name ?? profile.email ?? 'Unassigned']),
      )
      const projectMap = new Map(nextProjects.map((project) => [project.id, project.name]))
      const assigneeIdsByTaskId = new Map<string, string[]>()
      for (const row of taskAssigneesResult.data ?? []) {
        const current = assigneeIdsByTaskId.get(row.task_id) ?? []
        current.push(row.assignee_id)
        assigneeIdsByTaskId.set(row.task_id, current)
      }

      setProjects(nextProjects)
      setTasks(
        (tasksResult.data ?? []).map((task) => ({
          id: task.id,
          title: task.title,
          status: mapTaskStatus(task.status),
          projectId: task.project_id ?? '',
          projectName: projectMap.get(task.project_id ?? '') ?? 'Unassigned project',
          owners: (assigneeIdsByTaskId.get(task.id) ?? (task.assigned_to ? [task.assigned_to] : []))
            .map((assigneeId) => profileMap.get(assigneeId))
            .filter((owner): owner is string => Boolean(owner)),
          dueAt: task.due_at ?? null,
          createdAt: task.created_at ?? new Date().toISOString(),
        })),
      )
    })

    return () => {
      cancelled = true
    }
  }, [])

  const totalTasks = tasks.length
  const totalProjects = projects.length
  const totalOwners = useMemo(
    () =>
      new Set(
        tasks
          .flatMap((task) => task.owners)
          .filter((owner) => owner !== 'Unassigned'),
      ).size,
    [tasks],
  )

  const tasksDueThisWeek = useMemo(
    () =>
      tasks.filter((task) => {
        if (!task.dueAt) return false
        const due = new Date(task.dueAt)
        if (Number.isNaN(due.getTime())) return false
        const delta = daysUntil(due)
        return delta >= 0 && delta <= 7
      }).length,
    [tasks],
  )

  const projectDistribution = useMemo(
    () =>
      projects.map((project) => {
        const count = tasks.filter((task) => task.projectId === project.id).length
        return {
          ...project,
          count,
          percent: totalTasks === 0 ? 0 : Math.round((count / totalTasks) * 100),
        }
      }),
    [projects, tasks, totalTasks],
  )

  const donutGradient = useMemo(() => {
    if (totalTasks === 0) return 'conic-gradient(hsl(var(--muted-foreground)/0.2) 0 100%)'

    const tones = ['#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#FB7185']
    let cursor = 0
    const slices: string[] = []

    projectDistribution.forEach((item, index) => {
      if (item.count === 0) return
      const size = (item.count / totalTasks) * 100
      const next = cursor + size
      slices.push(`${tones[index % tones.length]} ${cursor}% ${next}%`)
      cursor = next
    })

    return slices.length === 0 ? 'conic-gradient(hsl(var(--muted-foreground)/0.2) 0 100%)' : `conic-gradient(${slices.join(', ')})`
  }, [projectDistribution, totalTasks])

  const taskFeed = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => {
          const aDate = a.dueAt ? new Date(a.dueAt) : null
          const bDate = b.dueAt ? new Date(b.dueAt) : null
          if (!aDate && !bDate) return 0
          if (!aDate) return 1
          if (!bDate) return -1
          return aDate.getTime() - bDate.getTime()
        })
        .slice(0, 6),
    [tasks],
  )

  const trendDays = TREND_RANGE_OPTIONS.find((option) => option.key === trendRange)?.days ?? 30
  const trendSeries = useMemo(() => buildTrendSeries(trendDays, trendRange, tasks), [trendDays, trendRange, tasks])
  const createdTotal = trendSeries.reduce((sum, point) => sum + point.created, 0)
  const reviewTotal = trendSeries.reduce((sum, point) => sum + point.review, 0)
  const overdueTotal = trendSeries.reduce((sum, point) => sum + point.overdue, 0)
  const trendMax = Math.max(...trendSeries.map((point) => Math.max(point.created, point.review, point.overdue)), 1)

  return (
    <div className='space-y-5'>
      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4' aria-label='Key metrics'>
        <Card className='rounded-xl'>
          <CardHeader className='pb-2'>
            <CardDescription className='text-xs uppercase tracking-wide'>Total tasks</CardDescription>
            <CardTitle className='text-2xl'>{totalTasks}</CardTitle>
          </CardHeader>
          <CardContent className='flex items-center justify-between pt-0'>
            <p className='text-xs text-muted-foreground'>Across all active work</p>
            <ChartColumnBig className='h-4 w-4 text-muted-foreground' />
          </CardContent>
        </Card>

        <Card className='rounded-xl'>
          <CardHeader className='pb-2'>
            <CardDescription className='text-xs uppercase tracking-wide'>Projects</CardDescription>
            <CardTitle className='text-2xl'>{totalProjects}</CardTitle>
          </CardHeader>
          <CardContent className='flex items-center justify-between pt-0'>
            <p className='text-xs text-muted-foreground'>Portfolio currently running</p>
            <FolderKanban className='h-4 w-4 text-muted-foreground' />
          </CardContent>
        </Card>

        <Card className='rounded-xl'>
          <CardHeader className='pb-2'>
            <CardDescription className='text-xs uppercase tracking-wide'>Owners</CardDescription>
            <CardTitle className='text-2xl'>{totalOwners}</CardTitle>
          </CardHeader>
          <CardContent className='flex items-center justify-between pt-0'>
            <p className='text-xs text-muted-foreground'>People contributing this cycle</p>
            <UsersRound className='h-4 w-4 text-muted-foreground' />
          </CardContent>
        </Card>

        <Card className='rounded-xl'>
          <CardHeader className='pb-2'>
            <CardDescription className='text-xs uppercase tracking-wide'>Due in 7 days</CardDescription>
            <CardTitle className='text-2xl'>{tasksDueThisWeek}</CardTitle>
          </CardHeader>
          <CardContent className='flex items-center justify-between pt-0'>
            <p className='text-xs text-muted-foreground'>Near-term delivery pressure</p>
            <CalendarClock className='h-4 w-4 text-muted-foreground' />
          </CardContent>
        </Card>
      </section>

      <section className='grid gap-5 xl:grid-cols-[1.35fr_1fr]'>
        <Card className='rounded-xl'>
          <CardHeader className='pb-3'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <CardTitle>Task Trend</CardTitle>
                <CardDescription>Created, review-stage, and overdue tasks from the database</CardDescription>
              </div>
              <div className='inline-flex rounded-md border bg-muted/20 p-1'>
                {TREND_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type='button'
                    onClick={() => setTrendRange(option.key)}
                    className={cn(
                      'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
                      trendRange === option.key
                        ? 'bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-2 sm:grid-cols-3'>
              <div className='rounded-md border px-3 py-2'>
                <p className='text-xs uppercase tracking-wide text-muted-foreground'>Created</p>
                <p className='text-lg font-semibold text-foreground'>{createdTotal}</p>
              </div>
              <div className='rounded-md border px-3 py-2'>
                <p className='text-xs uppercase tracking-wide text-muted-foreground'>Review</p>
                <p className='text-lg font-semibold text-foreground'>{reviewTotal}</p>
              </div>
              <div className='rounded-md border px-3 py-2'>
                <p className='text-xs uppercase tracking-wide text-muted-foreground'>Overdue</p>
                <p className='text-lg font-semibold text-foreground'>{overdueTotal}</p>
              </div>
            </div>

            <div className='grid h-56 grid-cols-12 items-end gap-2 rounded-lg border bg-muted/10 p-3'>
              {trendSeries.map((point) => (
                <div key={point.label} className='flex h-full min-w-0 flex-col items-center justify-end gap-1'>
                  <div className='flex h-full items-end gap-1'>
                    <div className='w-2 rounded-sm bg-[#60A5FA]' style={{ height: `${(point.created / trendMax) * 100}%` }} />
                    <div className='w-2 rounded-sm bg-[#34D399]' style={{ height: `${(point.review / trendMax) * 100}%` }} />
                    <div className='w-2 rounded-sm bg-[#FB7185]' style={{ height: `${(point.overdue / trendMax) * 100}%` }} />
                  </div>
                  <span className='text-[10px] text-muted-foreground'>{point.label}</span>
                </div>
              ))}
            </div>

            <div className='mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground'>
              <span className='inline-flex items-center gap-2'>
                <span className='h-2.5 w-2.5 rounded-full bg-[#60A5FA]' />
                Created
              </span>
              <span className='inline-flex items-center gap-2'>
                <span className='h-2.5 w-2.5 rounded-full bg-[#34D399]' />
                Review
              </span>
              <span className='inline-flex items-center gap-2'>
                <span className='h-2.5 w-2.5 rounded-full bg-[#FB7185]' />
                Overdue
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className='rounded-xl'>
          <CardHeader className='pb-3'>
            <CardTitle>Project Load Mix</CardTitle>
            <CardDescription>Task share across {currentOrganization.name}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-center'>
              <div className='relative h-52 w-52 rounded-full' style={{ backgroundImage: donutGradient }} aria-label='Project task distribution'>
                <div className='absolute inset-[26%] grid place-items-center rounded-full border bg-card'>
                  <div className='text-center'>
                    <p className='text-2xl font-semibold'>{totalTasks}</p>
                    <p className='text-xs text-muted-foreground'>total tasks</p>
                  </div>
                </div>
              </div>
            </div>

            <div className='space-y-2'>
              {projectDistribution.length === 0 ? (
                <div className='rounded-md border px-3 py-4 text-sm text-muted-foreground'>No projects in the database yet.</div>
              ) : (
                projectDistribution.map((project, index) => (
                  <div key={project.id} className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'>
                    <span className='inline-flex items-center gap-2'>
                      <span
                        className='h-2.5 w-2.5 rounded-full'
                        style={{ backgroundColor: ['#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#FB7185'][index % 5] }}
                      />
                      <span className='text-muted-foreground'>{project.name}</span>
                    </span>
                    <span className='font-medium text-foreground'>
                      {project.count} <span className='text-muted-foreground'>({project.percent}%)</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className='grid gap-5 xl:grid-cols-[1.35fr_1fr]'>
        <Card className='rounded-xl'>
          <CardHeader className='pb-3'>
            <CardTitle>Upcoming Work Feed</CardTitle>
            <CardDescription>Ordered by due date for the next execution window</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {taskFeed.length === 0 ? (
              <div className='rounded-md border bg-muted/10 px-3 py-5 text-sm text-muted-foreground'>No tasks in the database yet.</div>
            ) : (
              taskFeed.map((task) => (
                <article key={task.id} className='flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2.5'>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium text-foreground'>{task.title}</p>
                    <p className='text-xs text-muted-foreground'>
                      {task.projectName} • {task.owners.length > 0 ? task.owners.join(', ') : 'Unassigned'}
                    </p>
                  </div>
                  <div className='ml-3 flex items-center gap-2'>
                    <Badge variant='outline'>{task.status}</Badge>
                    <span className='text-xs text-muted-foreground'>Due {formatDueLabel(task.dueAt)}</span>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <Card className='rounded-xl'>
          <CardHeader className='pb-3'>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>High-frequency actions for team leads</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Button variant='outline' className='w-full justify-start gap-2'>
              <Rocket className='h-4 w-4' aria-hidden='true' />
              New Project
            </Button>
            <Button variant='outline' className='w-full justify-start gap-2'>
              <CalendarClock className='h-4 w-4' aria-hidden='true' />
              Plan Sprint
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
