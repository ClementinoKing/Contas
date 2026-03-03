import { CheckCircle2, Flag, Plus, Target, TimerReset } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const goals = [
  {
    title: 'Improve sprint predictability',
    owner: 'Product Ops',
    progress: 68,
    deadline: 'Mar 30',
    status: 'In Progress',
  },
  {
    title: 'Reduce blocker resolution time',
    owner: 'Engineering',
    progress: 54,
    deadline: 'Apr 08',
    status: 'In Progress',
  },
  {
    title: 'Increase roadmap visibility for leadership',
    owner: 'PM Office',
    progress: 83,
    deadline: 'Mar 21',
    status: 'Near Complete',
  },
] as const

export function GoalsPage() {
  const completed = goals.filter((goal) => goal.progress >= 80).length

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div>
            <p className='text-sm font-semibold text-foreground'>Goals & Outcomes</p>
            <p className='text-xs text-muted-foreground'>Align team execution with measurable targets.</p>
          </div>
          <Button size='sm' className='gap-1.5'>
            <Plus className='h-4 w-4' />
            New Goal
          </Button>
        </CardContent>
      </Card>

      <section className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Active Goals</CardDescription>
            <CardTitle>{goals.length}</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 text-xs text-muted-foreground'>Current quarter target set</CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Near Complete</CardDescription>
            <CardTitle>{completed}</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 text-xs text-muted-foreground'>80%+ progress threshold</CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Average Progress</CardDescription>
            <CardTitle>
              {Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length)}%
            </CardTitle>
          </CardHeader>
          <CardContent className='pt-0 text-xs text-muted-foreground'>Across all active goals</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle>Goal Tracker</CardTitle>
          <CardDescription>Monitor progress and deadlines with clear ownership.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {goals.map((goal) => (
            <article key={goal.title} className='rounded-md border bg-muted/10 p-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='text-sm font-semibold text-foreground'>{goal.title}</p>
                  <p className='mt-1 text-xs text-muted-foreground'>Owner: {goal.owner}</p>
                </div>
                <Badge variant='outline'>{goal.status}</Badge>
              </div>

              <div className='mt-3 space-y-1.5'>
                <div className='flex items-center justify-between text-xs'>
                  <span className='text-muted-foreground'>Progress</span>
                  <span className='font-medium text-foreground'>{goal.progress}%</span>
                </div>
                <div className='h-2 rounded-full bg-muted'>
                  <div className='h-full rounded-full bg-primary' style={{ width: `${goal.progress}%` }} />
                </div>
              </div>

              <div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
                <span className='inline-flex items-center gap-1.5'>
                  <Target className='h-3.5 w-3.5' />
                  Outcome tracked
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  <TimerReset className='h-3.5 w-3.5' />
                  Deadline {goal.deadline}
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  {goal.progress >= 80 ? <CheckCircle2 className='h-3.5 w-3.5 text-emerald-400' /> : <Flag className='h-3.5 w-3.5' />}
                  {goal.progress >= 80 ? 'Ready to close' : 'Needs follow-up'}
                </span>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
