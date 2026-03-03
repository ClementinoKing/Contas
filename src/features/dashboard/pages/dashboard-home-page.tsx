import { ArrowUpRight, CalendarClock, ChartColumnBig, FolderKanban, Rocket, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { USER_PROJECTS } from '@/features/projects/projects-data'
import { TASK_ROWS } from '@/features/tasks/tasks-data'
import { useTenant } from '@/features/tenancy/context/tenant-context'
import { cn } from '@/lib/utils'

type StatusCount = { label: 'In Progress' | 'Review' | 'Planned' | 'Blocked'; count: number; tone: string }
type TrendRange = '7d' | '30d' | '90d'
type TrendPoint = { date: Date; label: string; created: number; completed: number; overdue: number }
type HoveredTrend = { leftPercent: number; point: TrendPoint } | null

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

function buildTrendSeries(days: number, baseline: number, range: TrendRange): TrendPoint[] {
  const today = startOfLocalDay(new Date())
  const normalizer = Math.max(4, baseline)

  return Array.from({ length: days }, (_, index) => {
    const date = subtractDays(today, days - index - 1)
    const waveA = Math.sin(index / 2.8)
    const waveB = Math.cos(index / 4.6)
    const pulse = index % 6 === 0 ? 1 : 0
    const created = Math.max(1, Math.round(normalizer / 2.5 + 2 + waveA * 1.6 + waveB * 1.1 + pulse))
    const completed = Math.max(0, Math.round(created - 1 + Math.sin((index + 1) / 3.1) + (index % 8 === 0 ? 1 : 0)))
    const overdue = Math.max(0, Math.round(created - completed - 1 + Math.cos((index + 2) / 4.2)))

    return {
      date,
      label: formatTrendLabel(date, range),
      created,
      completed: Math.min(created + 2, completed),
      overdue,
    }
  })
}

function parseDueDate(value: string) {
  if (value === 'Today') return new Date()
  const parsed = new Date(`${value}, ${new Date().getFullYear()}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysUntil(date: Date) {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((target - start) / (1000 * 60 * 60 * 24))
}

export function DashboardHomePage() {
  const { currentTenant } = useTenant()
  const [trendRange, setTrendRange] = useState<TrendRange>('30d')
  const [hoveredTrend, setHoveredTrend] = useState<HoveredTrend>(null)
  const totalTasks = TASK_ROWS.length
  const totalProjects = USER_PROJECTS.length
  const totalOwners = useMemo(() => new Set(TASK_ROWS.map((task) => task.owner)).size, [])

  const statusCounts = useMemo<StatusCount[]>(
    () => [
      {
        label: 'In Progress',
        count: TASK_ROWS.filter((task) => task.status === 'In Progress').length,
        tone: 'bg-blue-500',
      },
      {
        label: 'Review',
        count: TASK_ROWS.filter((task) => task.status === 'Review').length,
        tone: 'bg-emerald-500',
      },
      {
        label: 'Planned',
        count: TASK_ROWS.filter((task) => task.status === 'Planned').length,
        tone: 'bg-amber-500',
      },
      {
        label: 'Blocked',
        count: TASK_ROWS.filter((task) => task.status === 'Blocked').length,
        tone: 'bg-rose-500',
      },
    ],
    [],
  )

  const tasksDueThisWeek = useMemo(
    () =>
      TASK_ROWS.filter((task) => {
        const due = parseDueDate(task.due)
        if (!due) return false
        const delta = daysUntil(due)
        return delta >= 0 && delta <= 7
      }).length,
    [],
  )

  const maxStatusCount = Math.max(...statusCounts.map((entry) => entry.count), 1)

  const projectDistribution = useMemo(() => {
    return USER_PROJECTS.map((project) => {
      const count = TASK_ROWS.filter((task) => task.projectId === project.id).length
      return {
        ...project,
        count,
        percent: totalTasks === 0 ? 0 : Math.round((count / totalTasks) * 100),
      }
    })
  }, [totalTasks])

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

    if (slices.length === 0) return 'conic-gradient(hsl(var(--muted-foreground)/0.2) 0 100%)'
    return `conic-gradient(${slices.join(', ')})`
  }, [projectDistribution, totalTasks])

  const taskFeed = useMemo(
    () =>
      [...TASK_ROWS]
        .sort((a, b) => {
          const aDate = parseDueDate(a.due)
          const bDate = parseDueDate(b.due)
          if (!aDate && !bDate) return 0
          if (!aDate) return 1
          if (!bDate) return -1
          return aDate.getTime() - bDate.getTime()
        })
        .slice(0, 6),
    [],
  )

  const trendDays = TREND_RANGE_OPTIONS.find((option) => option.key === trendRange)?.days ?? 30
  const trendSeries = useMemo(() => buildTrendSeries(trendDays, totalTasks, trendRange), [trendDays, totalTasks, trendRange])
  const trendMax = Math.max(...trendSeries.map((point) => Math.max(point.created, point.completed, point.overdue)), 1)
  const createdTotal = trendSeries.reduce((sum, point) => sum + point.created, 0)
  const completedTotal = trendSeries.reduce((sum, point) => sum + point.completed, 0)
  const overdueTotal = trendSeries.reduce((sum, point) => sum + point.overdue, 0)

  const chartWidth = 900
  const chartHeight = 250
  const padX = 18
  const padTop = 18
  const padBottom = 34
  const innerWidth = chartWidth - padX * 2
  const innerHeight = chartHeight - padTop - padBottom
  const interval = trendSeries.length > 1 ? innerWidth / (trendSeries.length - 1) : 0
  const tickEvery = trendRange === '7d' ? 1 : trendRange === '30d' ? 5 : 15
  const groupBarWidth = Math.max(6, Math.min(18, interval * 0.65))
  const singleBarWidth = Math.max(2, groupBarWidth / 3 - 1)

  const toX = (index: number) => padX + interval * index
  const toY = (value: number) => padTop + innerHeight - (value / trendMax) * innerHeight

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

      <section>
        <Card className='rounded-xl'>
          <CardHeader className='pb-3'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <CardTitle>Task Trend</CardTitle>
                <CardDescription>Created, completed, and overdue task flow</CardDescription>
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
                <p className='text-xs uppercase tracking-wide text-muted-foreground'>Completed</p>
                <p className='text-lg font-semibold text-foreground'>{completedTotal}</p>
              </div>
              <div className='rounded-md border px-3 py-2'>
                <p className='text-xs uppercase tracking-wide text-muted-foreground'>Overdue</p>
                <p className='text-lg font-semibold text-foreground'>{overdueTotal}</p>
              </div>
            </div>

            <div className='relative rounded-lg border bg-muted/10 p-3'>
              {hoveredTrend ? (
                <div
                  className='pointer-events-none absolute top-2 z-10 w-44 -translate-x-1/2 rounded-md border bg-card px-3 py-2 shadow-lg'
                  style={{ left: `${hoveredTrend.leftPercent}%` }}
                >
                  <p className='text-xs font-semibold text-foreground'>{hoveredTrend.point.label}</p>
                  <div className='mt-1 space-y-1 text-xs text-muted-foreground'>
                    <p className='flex items-center justify-between'>
                      <span className='inline-flex items-center gap-1.5'>
                        <span className='h-2 w-2 rounded-full bg-[#60A5FA]' />
                        Created
                      </span>
                      <span className='font-medium text-foreground'>{hoveredTrend.point.created}</span>
                    </p>
                    <p className='flex items-center justify-between'>
                      <span className='inline-flex items-center gap-1.5'>
                        <span className='h-2 w-2 rounded-full bg-[#34D399]' />
                        Completed
                      </span>
                      <span className='font-medium text-foreground'>{hoveredTrend.point.completed}</span>
                    </p>
                    <p className='flex items-center justify-between'>
                      <span className='inline-flex items-center gap-1.5'>
                        <span className='h-2 w-2 rounded-full bg-[#FB7185]' />
                        Overdue
                      </span>
                      <span className='font-medium text-foreground'>{hoveredTrend.point.overdue}</span>
                    </p>
                  </div>
                </div>
              ) : null}

              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className='h-64 w-full' role='img' aria-label='Task trend chart'>
                {[0, 0.5, 1].map((marker) => {
                  const y = padTop + innerHeight - innerHeight * marker
                  return (
                    <g key={marker}>
                      <line x1={padX} y1={y} x2={chartWidth - padX} y2={y} stroke='hsl(var(--border))' strokeDasharray='4 4' />
                      <text x={4} y={y + 4} className='fill-muted-foreground text-[11px]'>
                        {Math.round(trendMax * marker)}
                      </text>
                    </g>
                  )
                })}

                {trendSeries.map((point, index) => {
                  if (index % tickEvery !== 0 && index !== trendSeries.length - 1) return null
                  const x = toX(index)
                  return (
                    <text key={`${point.label}-${index}`} x={x} y={chartHeight - 8} textAnchor='middle' className='fill-muted-foreground text-[10px]'>
                      {point.label}
                    </text>
                  )
                })}

                {trendSeries.map((point, index) => {
                  const x = toX(index) - groupBarWidth / 2
                  const createdY = toY(point.created)
                  const completedY = toY(point.completed)
                  const overdueY = toY(point.overdue)
                  return (
                    <g
                      key={`bars-${point.label}-${index}`}
                      onMouseEnter={() =>
                        setHoveredTrend({
                          leftPercent: (toX(index) / chartWidth) * 100,
                          point,
                        })
                      }
                      onMouseLeave={() => setHoveredTrend(null)}
                    >
                      <rect
                        x={x}
                        y={createdY}
                        width={singleBarWidth}
                        height={padTop + innerHeight - createdY}
                        rx='2'
                        fill='#60A5FA'
                        fillOpacity='0.9'
                      />
                      <rect
                        x={x + singleBarWidth + 1}
                        y={completedY}
                        width={singleBarWidth}
                        height={padTop + innerHeight - completedY}
                        rx='2'
                        fill='#34D399'
                        fillOpacity='0.9'
                      />
                      <rect
                        x={x + singleBarWidth * 2 + 2}
                        y={overdueY}
                        width={singleBarWidth}
                        height={padTop + innerHeight - overdueY}
                        rx='2'
                        fill='#FB7185'
                        fillOpacity='0.9'
                      />
                    </g>
                  )
                })}
              </svg>

              <div className='mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground'>
                <span className='inline-flex items-center gap-2'>
                  <span className='h-2.5 w-2.5 rounded-full bg-[#60A5FA]' />
                  Created
                </span>
                <span className='inline-flex items-center gap-2'>
                  <span className='h-2.5 w-2.5 rounded-full bg-[#34D399]' />
                  Completed
                </span>
                <span className='inline-flex items-center gap-2'>
                  <span className='h-2.5 w-2.5 rounded-full bg-[#FB7185]' />
                  Overdue
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className='grid gap-5 xl:grid-cols-[1.35fr_1fr]'>
        <Card className='rounded-xl'>
          <CardHeader className='pb-3'>
            <CardTitle>Execution Status</CardTitle>
            <CardDescription>How work is distributed by workflow stage</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid h-56 grid-cols-4 items-end gap-3'>
              {statusCounts.map((entry) => (
                <div key={entry.label} className='flex h-full flex-col items-center justify-end gap-2'>
                  <div className='text-xs font-semibold text-muted-foreground'>{entry.count}</div>
                  <div className='flex h-[80%] w-full items-end rounded-md bg-muted/35 p-1'>
                    <div
                      className={cn('w-full rounded-sm', entry.tone)}
                      style={{ height: `${(entry.count / maxStatusCount) * 100}%` }}
                    />
                  </div>
                  <p className='text-center text-[11px] text-muted-foreground'>{entry.label}</p>
                </div>
              ))}
            </div>

            <div className='grid gap-2 md:grid-cols-2'>
              {statusCounts.map((entry) => (
                <div key={`legend-${entry.label}`} className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'>
                  <span className='inline-flex items-center gap-2 text-muted-foreground'>
                    <span className={cn('h-2.5 w-2.5 rounded-full', entry.tone)} />
                    {entry.label}
                  </span>
                  <span className='font-medium text-foreground'>{entry.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className='rounded-xl'>
          <CardHeader className='pb-3'>
            <CardTitle>Project Load Mix</CardTitle>
            <CardDescription>Task share across {currentTenant.name}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-center'>
              <div
                className='relative h-52 w-52 rounded-full'
                style={{ backgroundImage: donutGradient }}
                aria-label='Project task distribution'
              >
                <div className='absolute inset-[26%] grid place-items-center rounded-full border bg-card'>
                  <div className='text-center'>
                    <p className='text-2xl font-semibold'>{totalTasks}</p>
                    <p className='text-xs text-muted-foreground'>total tasks</p>
                  </div>
                </div>
              </div>
            </div>

            <div className='space-y-2'>
              {projectDistribution.map((project, index) => (
                <div key={project.id} className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'>
                  <span className='inline-flex items-center gap-2'>
                    <span
                      className='h-2.5 w-2.5 rounded-full'
                      style={{
                        backgroundColor: ['#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#FB7185'][index % 5],
                      }}
                    />
                    <span className='text-muted-foreground'>{project.name}</span>
                  </span>
                  <span className='font-medium text-foreground'>
                    {project.count} <span className='text-muted-foreground'>({project.percent}%)</span>
                  </span>
                </div>
              ))}
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
            {taskFeed.map((task) => (
              <article key={task.id} className='flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2.5'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium text-foreground'>{task.title}</p>
                  <p className='text-xs text-muted-foreground'>
                    {task.projectName} • {task.owner}
                  </p>
                </div>
                <div className='ml-3 flex items-center gap-2'>
                  <Badge variant='outline'>{task.status}</Badge>
                  <span className='text-xs text-muted-foreground'>Due {task.due}</span>
                </div>
              </article>
            ))}
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
            <Button variant='outline' className='w-full justify-start gap-2'>
              <ArrowUpRight className='h-4 w-4' aria-hidden='true' />
              Share Weekly Update
            </Button>
            <Link to='/dashboard/my-tasks' className='inline-flex w-full items-center justify-center pt-1 text-sm font-medium text-primary hover:underline'>
              Open full task board
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
