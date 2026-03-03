import { CalendarDays, FileText, Users2, Workflow } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const members = [
  { name: 'Lina', role: 'Product Lead', status: 'Online' },
  { name: 'James', role: 'Engineering Manager', status: 'In Focus' },
  { name: 'Maya', role: 'UX Designer', status: 'Online' },
  { name: 'Noah', role: 'Operations', status: 'Offline' },
] as const

const workspaceTimeline = [
  { title: 'Weekly planning', time: 'Today • 10:00 AM', type: 'Meeting' },
  { title: 'Release readiness review', time: 'Tomorrow • 2:30 PM', type: 'Review' },
  { title: 'Leadership sync', time: 'Fri • 11:00 AM', type: 'Update' },
] as const

export function WorkspacePage() {
  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div>
            <p className='text-sm font-semibold text-foreground'>Workspace Hub</p>
            <p className='text-xs text-muted-foreground'>Shared context, team visibility, and operations signals.</p>
          </div>
          <Button size='sm' className='gap-1.5'>
            <Workflow className='h-4 w-4' />
            Manage workspace
          </Button>
        </CardContent>
      </Card>

      <section className='grid gap-4 xl:grid-cols-[1.35fr_1fr]'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>Current availability and responsibility map</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {members.map((member) => (
              <article key={member.name} className='flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2.5'>
                <div>
                  <p className='text-sm font-medium text-foreground'>{member.name}</p>
                  <p className='text-xs text-muted-foreground'>{member.role}</p>
                </div>
                <Badge variant='outline'>{member.status}</Badge>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Workspace Signals</CardTitle>
            <CardDescription>Quick operational indicators</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-md border bg-muted/10 p-3'>
              <p className='inline-flex items-center gap-2 text-sm font-medium'>
                <Users2 className='h-4 w-4 text-blue-400' />
                4 active collaborators
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>2 currently online, 1 in focus mode.</p>
            </div>
            <div className='rounded-md border bg-muted/10 p-3'>
              <p className='inline-flex items-center gap-2 text-sm font-medium'>
                <FileText className='h-4 w-4 text-emerald-400' />
                6 shared docs updated
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>Knowledge base and project docs changed today.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle>Upcoming Workspace Timeline</CardTitle>
          <CardDescription>Upcoming cross-functional sessions and checkpoints</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {workspaceTimeline.map((event) => (
            <article key={event.title} className='flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2.5'>
              <div>
                <p className='text-sm font-medium text-foreground'>{event.title}</p>
                <p className='text-xs text-muted-foreground'>{event.type}</p>
              </div>
              <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
                <CalendarDays className='h-3.5 w-3.5' />
                {event.time}
              </span>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
