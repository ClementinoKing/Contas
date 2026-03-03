import { BarChart3, CalendarClock, Download, Filter, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const KPI = [
  { label: 'On-time Delivery', value: '82%', delta: '+6% vs last month' },
  { label: 'Cycle Time', value: '4.1d', delta: '-0.7d improvement' },
  { label: 'Blocked Tasks', value: '9', delta: '-3 this week' },
  { label: 'Completed', value: '74', delta: '+12 this sprint' },
] as const

const teamVelocity = [
  { team: 'Product', planned: 28, completed: 24 },
  { team: 'Engineering', planned: 42, completed: 39 },
  { team: 'Design', planned: 18, completed: 14 },
  { team: 'Operations', planned: 22, completed: 19 },
] as const

export function ReportingPage() {
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
        {KPI.map((item) => (
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
            <CardTitle>Team Delivery (Planned vs Completed)</CardTitle>
            <CardDescription>Execution signal by functional team</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {teamVelocity.map((row) => (
              <div key={row.team} className='space-y-1.5'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='font-medium text-foreground'>{row.team}</span>
                  <span className='text-muted-foreground'>
                    {row.completed}/{row.planned}
                  </span>
                </div>
                <div className='h-2 overflow-hidden rounded-full bg-muted'>
                  <div className='h-full rounded-full bg-primary' style={{ width: `${Math.round((row.completed / row.planned) * 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Weekly Highlights</CardTitle>
            <CardDescription>Important reporting events</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <article className='rounded-md border bg-muted/10 p-3'>
              <p className='text-sm font-medium'>Velocity trend up this week</p>
              <p className='mt-1 text-xs text-muted-foreground'>Completion pace improved in Engineering and Product.</p>
              <Badge variant='outline' className='mt-2 gap-1.5'>
                <TrendingUp className='h-3.5 w-3.5' />
                Positive
              </Badge>
            </article>
            <article className='rounded-md border bg-muted/10 p-3'>
              <p className='text-sm font-medium'>Leadership review scheduled</p>
              <p className='mt-1 text-xs text-muted-foreground'>Quarterly reporting sync on Friday, 10:00 AM.</p>
              <Badge variant='outline' className='mt-2 gap-1.5'>
                <CalendarClock className='h-3.5 w-3.5' />
                Upcoming
              </Badge>
            </article>
            <article className='rounded-md border bg-muted/10 p-3'>
              <p className='text-sm font-medium'>Backlog health check due</p>
              <p className='mt-1 text-xs text-muted-foreground'>Review stale tasks and remove blocked items.</p>
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
