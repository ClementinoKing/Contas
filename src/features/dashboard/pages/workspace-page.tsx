import { CalendarDays, FileText, Users2, Workflow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

const organizationTimeline = [
  { title: 'Weekly planning', time: 'Today • 10:00 AM', type: 'Meeting' },
  { title: 'Release readiness review', time: 'Tomorrow • 2:30 PM', type: 'Review' },
  { title: 'Leadership sync', time: 'Fri • 11:00 AM', type: 'Update' },
] as const

type TeamMember = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  job_title: string | null
  department: string | null
  role_label: string | null
  out_of_office: boolean | null
}

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function memberRole(member: TeamMember) {
  return member.job_title ?? member.role_label ?? member.department ?? 'Team member'
}

function memberStatus(member: TeamMember) {
  return member.out_of_office ? 'Away' : 'Available'
}

export function WorkspacePage() {
  const [members, setMembers] = useState<TeamMember[]>([])

  useEffect(() => {
    let cancelled = false

    void supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, job_title, department, role_label, out_of_office')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setMembers(data as TeamMember[])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const activeCollaborators = members.length
  const availableCollaborators = useMemo(
    () => members.filter((member) => !member.out_of_office).length,
    [members],
  )

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div>
            <p className='text-sm font-semibold text-foreground'>Organization Hub</p>
            <p className='text-xs text-muted-foreground'>Shared context, team visibility, and operating signals.</p>
          </div>
          <Button size='sm' className='gap-1.5'>
            <Workflow className='h-4 w-4' />
            Manage organization
          </Button>
        </CardContent>
      </Card>

      <section className='grid gap-4 xl:grid-cols-[1.35fr_1fr]'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>Profiles currently in the system</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {members.length === 0 ? (
              <p className='rounded-md border bg-muted/10 px-3 py-4 text-sm text-muted-foreground'>
                No team profiles found yet.
              </p>
            ) : (
              members.map((member) => {
                const displayName = member.full_name ?? member.email ?? 'Unnamed user'
                return (
                  <article key={member.id} className='flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2.5'>
                    <div className='flex items-center gap-3'>
                      <Avatar className='h-9 w-9 border'>
                        {member.avatar_url ? <AvatarImage src={member.avatar_url} alt={displayName} /> : null}
                        <AvatarFallback className='text-xs font-semibold'>{initials(displayName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className='text-sm font-medium text-foreground'>{displayName}</p>
                        <p className='text-xs text-muted-foreground'>{memberRole(member)}</p>
                      </div>
                    </div>
                    <Badge variant='outline'>{memberStatus(member)}</Badge>
                  </article>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Organization Signals</CardTitle>
            <CardDescription>Quick operational indicators</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-md border bg-muted/10 p-3'>
              <p className='inline-flex items-center gap-2 text-sm font-medium'>
                <Users2 className='h-4 w-4 text-blue-400' />
                {activeCollaborators} active collaborators
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>{availableCollaborators} currently available.</p>
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
          <CardTitle>Upcoming Organization Timeline</CardTitle>
          <CardDescription>Upcoming cross-functional sessions and operating checkpoints</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {organizationTimeline.map((event) => (
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
