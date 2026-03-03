import { ArrowUpRight, CalendarClock, Rocket } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTenant } from '@/features/tenancy/context/tenant-context'

import { MetricsGrid } from '../components/metrics-grid'

const recentTasks = [
  { title: 'Finalize Q2 roadmap review', due: 'Today', status: 'In Review' },
  { title: 'Sync dependencies with Mobile squad', due: 'Tomorrow', status: 'In Progress' },
  { title: 'Prepare stakeholder reporting deck', due: 'Mar 5', status: 'Planned' },
  { title: 'Refine onboarding task templates', due: 'Mar 7', status: 'Backlog' },
] as const

export function DashboardHomePage() {
  const { currentTenant } = useTenant()

  return (
    <div className='space-y-5'>
      <MetricsGrid />

      <div className='grid gap-5 xl:grid-cols-[2fr_1fr]'>
        <Card>
          <CardHeader>
            <CardTitle>Recent Tasks</CardTitle>
            <CardDescription>Latest activity for {currentTenant.name}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {recentTasks.map((task) => (
              <article key={task.title} className='flex items-center justify-between rounded-lg border bg-muted/25 p-3'>
                <div>
                  <h3 className='font-medium text-foreground'>{task.title}</h3>
                  <p className='text-sm text-muted-foreground'>Due {task.due}</p>
                </div>
                <Badge variant='outline'>{task.status}</Badge>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Move work forward fast</CardDescription>
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
