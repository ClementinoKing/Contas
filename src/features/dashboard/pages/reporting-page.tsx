import { BarChart3, CalendarClock, Download, Filter, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

type ReportingTask = {
  id: string
  status: string | null
  statusKey: string | null
  dueAt: string | null
  completedAt: string | null
}

type TeamVelocityRow = {
  team: string
  planned: number
  completed: number
}

function isSameUtcDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}

function startOfTodayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function daysFromTodayUtc(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const start = startOfTodayUtc().getTime()
  const target = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  return Math.round((target - start) / (1000 * 60 * 60 * 24))
}

export function ReportingPage() {
  const [tasks, setTasks] = useState<ReportingTask[]>([])
  const [teamVelocity, setTeamVelocity] = useState<TeamVelocityRow[]>([])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      supabase.from('tasks').select('id, status, status_id, due_at, completed_at, task_status:status_id(key)'),
      supabase.from('task_assignees').select('task_id, assignee_id'),
      supabase.from('profiles').select('id, full_name, email'),
    ]).then(([tasksResult, taskAssigneesResult, profilesResult]) => {
      if (cancelled) return

      const nextTasks = (tasksResult.data ?? []).map((task) => ({
        id: task.id,
        status: task.status,
        statusKey: (task.task_status as { key?: string } | null)?.key ?? task.status ?? null,
        dueAt: task.due_at,
        completedAt: task.completed_at,
      }))
      setTasks(nextTasks)

      const memberMap = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name ?? profile.email ?? 'Unknown user']),
      )
      const taskMap = new Map(nextTasks.map((task) => [task.id, task]))
      const metrics = new Map<string, TeamVelocityRow>()
      for (const assignment of taskAssigneesResult.data ?? []) {
        const memberName = memberMap.get(assignment.assignee_id) ?? 'Unknown user'
        const task = taskMap.get(assignment.task_id)
        if (!task) continue
        const row = metrics.get(memberName) ?? { team: memberName, planned: 0, completed: 0 }
        row.planned += 1
        if (task.completedAt || task.statusKey === 'done' || task.statusKey === 'review') {
          row.completed += 1
        }
        metrics.set(memberName, row)
      }
      setTeamVelocity(Array.from(metrics.values()).sort((a, b) => b.planned - a.planned).slice(0, 6))
    })

    return () => {
      cancelled = true
    }
  }, [])

  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => Boolean(task.completedAt) || task.statusKey === 'done').length
  const blockedTasks = tasks.filter((task) => task.statusKey === 'blocked').length
  const cycleDays = useMemo(() => {
    const doneThisWeek = tasks.filter((task) => {
      if (!task.completedAt) return false
      const completedDate = new Date(task.completedAt)
      const delta = daysFromTodayUtc(task.completedAt)
      return delta !== null && delta <= 7 && delta >= 0 && !Number.isNaN(completedDate.getTime())
    }).length
    if (doneThisWeek === 0) return 0
    return Number((7 / doneThisWeek).toFixed(1))
  }, [tasks])
  const onTimeDelivery = useMemo(() => {
    const dueTasks = tasks.filter((task) => task.dueAt)
    if (dueTasks.length === 0) return 0
    const onTime = dueTasks.filter((task) => {
      if (!task.completedAt || !task.dueAt) return false
      const completedAt = new Date(task.completedAt)
      const dueAt = new Date(task.dueAt)
      return completedAt.getTime() <= dueAt.getTime() || isSameUtcDay(completedAt, dueAt)
    }).length
    return Math.round((onTime / dueTasks.length) * 100)
  }, [tasks])

  const kpi = [
    { label: 'On-time Delivery', value: `${onTimeDelivery}%`, delta: `${completedTasks}/${Math.max(tasks.filter((task) => task.dueAt).length, 1)} due tasks` },
    { label: 'Cycle Time', value: cycleDays > 0 ? `${cycleDays}d` : 'N/A', delta: 'Average days per completion (last 7d)' },
    { label: 'Blocked Tasks', value: String(blockedTasks), delta: 'Current blocked workload' },
    { label: 'Completed', value: String(completedTasks), delta: `${totalTasks} total tasks` },
  ]

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div>
            <p className='text-sm font-semibold text-foreground'>Reporting Overview</p>
            <p className='text-xs text-muted-foreground'>Performance metrics and delivery trend snapshots.</p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' className='gap-1.5'>
              <Filter className='h-4 w-4' aria-hidden='true' />
              Filter
            </Button>
            <Button variant='outline' size='sm' className='gap-1.5'>
              <Download className='h-4 w-4' aria-hidden='true' />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {kpi.map((item) => (
          <Card key={item.label}>
            <CardHeader className='pb-2'>
              <CardDescription className='text-xs uppercase tracking-wide'>{item.label}</CardDescription>
              <CardTitle className='text-2xl'>{item.value}</CardTitle>
            </CardHeader>
            <CardContent className='pt-0'>
              <p className='text-xs text-muted-foreground'>{item.delta}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className='grid gap-4 xl:grid-cols-[1.35fr_1fr]'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Assignee Throughput (Planned vs Completed)</CardTitle>
            <CardDescription>Workload and completion using task assignee relations</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {teamVelocity.length === 0 ? (
              <div className='rounded-md border bg-muted/10 p-4 text-sm text-muted-foreground'>No assignment data yet.</div>
            ) : (
              teamVelocity.map((row) => (
                <div key={row.team} className='space-y-1.5'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='font-medium text-foreground'>{row.team}</span>
                    <span className='text-muted-foreground'>
                      {row.completed}/{row.planned}
                    </span>
                  </div>
                  <div className='h-2 overflow-hidden rounded-full bg-muted'>
                    <div className='h-full rounded-full bg-primary' style={{ width: `${Math.round((row.completed / Math.max(row.planned, 1)) * 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Weekly Highlights</CardTitle>
            <CardDescription>Important reporting events</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <article className='rounded-md border bg-muted/10 p-3'>
              <p className='text-sm font-medium'>Completion signal</p>
              <p className='mt-1 text-xs text-muted-foreground'>{completedTasks} tasks are currently completed.</p>
              <Badge variant='outline' className='mt-2 gap-1.5'>
                <TrendingUp className='h-3.5 w-3.5' />
                Delivery
              </Badge>
            </article>
            <article className='rounded-md border bg-muted/10 p-3'>
              <p className='text-sm font-medium'>Upcoming due load</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {tasks.filter((task) => {
                  const delta = daysFromTodayUtc(task.dueAt)
                  return delta !== null && delta >= 0 && delta <= 7
                }).length}{' '}
                tasks due in the next 7 days.
              </p>
              <Badge variant='outline' className='mt-2 gap-1.5'>
                <CalendarClock className='h-3.5 w-3.5' />
                Upcoming
              </Badge>
            </article>
            <article className='rounded-md border bg-muted/10 p-3'>
              <p className='text-sm font-medium'>Blocked pressure</p>
              <p className='mt-1 text-xs text-muted-foreground'>{blockedTasks} tasks currently blocked.</p>
              <Badge variant='outline' className='mt-2 gap-1.5'>
                <BarChart3 className='h-3.5 w-3.5' />
                Action
              </Badge>
            </article>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
