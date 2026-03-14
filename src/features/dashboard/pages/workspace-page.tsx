import { CalendarDays, FileText, Users2, Workflow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

const WORKSPACE_MEMBERS_CACHE_KEY = 'contas.workspace.members.v1'
const WORKSPACE_PRESENCE_CACHE_KEY = 'contas.workspace.presence.v1'
const WORKSPACE_TIMELINE_CACHE_KEY = 'contas.workspace.timeline.v1'
const ONLINE_WINDOW_MS = 5 * 60 * 1000

type TeamMember = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  job_title: string | null
  department: string | null
  role_label: string | null
  availability_schedule: unknown
}

type PresenceSession = {
  user_id: string
  is_online: boolean
  last_seen_at: string | null
}

type WeekdayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
type AvailabilityBlock = { day: WeekdayKey; startTime: string; endTime: string }
const WEEKDAY_BY_INDEX: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

type OrganizationTimelineEvent = {
  id: string
  title: string
  event_type: string
  starts_at: string
}

function readCachedArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { items?: T[] } | T[]
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed.items)) return parsed.items
    return []
  } catch {
    return []
  }
}

function writeCachedArray<T>(key: string, items: T[]) {
  localStorage.setItem(key, JSON.stringify({ items, cachedAt: Date.now() }))
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

function isValidTimeValue(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function normalizeAvailabilitySchedule(raw: unknown): AvailabilityBlock[] {
  if (!Array.isArray(raw)) return []
  const validDays = new Set<WeekdayKey>(WEEKDAY_BY_INDEX)
  return raw
    .filter((item): item is { day?: unknown; startTime?: unknown; endTime?: unknown } => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      day: typeof item.day === 'string' ? item.day.toLowerCase() : '',
      startTime: typeof item.startTime === 'string' ? item.startTime : '',
      endTime: typeof item.endTime === 'string' ? item.endTime : '',
    }))
    .filter((item): item is AvailabilityBlock => {
      return (
        validDays.has(item.day as WeekdayKey) &&
        isValidTimeValue(item.startTime) &&
        isValidTimeValue(item.endTime) &&
        toMinutes(item.endTime) > toMinutes(item.startTime)
      )
    })
}

function isMemberAvailable(member: TeamMember) {
  const schedule = normalizeAvailabilitySchedule(member.availability_schedule)
  if (schedule.length === 0) return false
  const now = new Date()
  const currentDay = WEEKDAY_BY_INDEX[now.getDay()]
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return schedule.some(
    (block) =>
      block.day === currentDay &&
      currentMinutes >= toMinutes(block.startTime) &&
      currentMinutes < toMinutes(block.endTime),
  )
}

function isPresenceSessionActive(session: PresenceSession, nowMs: number) {
  if (!session.is_online) return false
  if (!session.last_seen_at) return true
  const lastSeenMs = new Date(session.last_seen_at).getTime()
  if (Number.isNaN(lastSeenMs)) return false
  return nowMs - lastSeenMs <= ONLINE_WINDOW_MS
}

function isMemberOnline(memberId: string, presenceSessions: PresenceSession[], nowMs: number) {
  return presenceSessions.some((session) => session.user_id === memberId && isPresenceSessionActive(session, nowMs))
}

function formatTimelineTime(startsAt: string) {
  const eventDate = new Date(startsAt)
  if (Number.isNaN(eventDate.getTime())) return 'TBD'

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfEventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate())
  const dayDiff = Math.round((startOfEventDay.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000))

  const timeLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(eventDate)
  if (dayDiff === 0) return `Today • ${timeLabel}`
  if (dayDiff === 1) return `Tomorrow • ${timeLabel}`
  if (dayDiff > 1 && dayDiff <= 6) {
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(eventDate)
    return `${weekday} • ${timeLabel}`
  }
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(eventDate)
  return `${dateLabel} • ${timeLabel}`
}

export function WorkspacePage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [presenceSessions, setPresenceSessions] = useState<PresenceSession[]>([])
  const [timelineEvents, setTimelineEvents] = useState<OrganizationTimelineEvent[]>([])
  const [clockMs, setClockMs] = useState(() => Date.now())

  useEffect(() => {
    const cachedMembers = readCachedArray<TeamMember>(WORKSPACE_MEMBERS_CACHE_KEY)
    if (cachedMembers.length > 0) setMembers(cachedMembers)

    const cachedPresence = readCachedArray<PresenceSession>(WORKSPACE_PRESENCE_CACHE_KEY)
    if (cachedPresence.length > 0) setPresenceSessions(cachedPresence)

    const cachedTimeline = readCachedArray<OrganizationTimelineEvent>(WORKSPACE_TIMELINE_CACHE_KEY)
    if (cachedTimeline.length > 0) setTimelineEvents(cachedTimeline)

    let cancelled = false
    let refreshTimer: number | null = null
    let pollTimer: number | null = null

    const loadMembersAndPresence = async () => {
      const membersResult = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, job_title, department, role_label, availability_schedule')
        .order('full_name', { ascending: true })
      if (!cancelled && !membersResult.error && membersResult.data) {
        setMembers(membersResult.data as TeamMember[])
        writeCachedArray(WORKSPACE_MEMBERS_CACHE_KEY, membersResult.data as TeamMember[])
      }

      const sinceIso = new Date(Date.now() - 6 * 60 * 1000).toISOString()
      const presenceResult = await supabase
        .from('user_presence_sessions')
        .select('user_id, is_online, last_seen_at')
        .eq('is_online', true)
        .gte('last_seen_at', sinceIso)

      if (!cancelled && !presenceResult.error && presenceResult.data) {
        setPresenceSessions(presenceResult.data as PresenceSession[])
        writeCachedArray(WORKSPACE_PRESENCE_CACHE_KEY, presenceResult.data as PresenceSession[])
      }

      const timelineResult = await supabase
        .from('organization_timeline_events')
        .select('id, title, event_type, starts_at')
        .gte('starts_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
        .order('starts_at', { ascending: true })
        .limit(10)

      if (!cancelled && !timelineResult.error && timelineResult.data) {
        setTimelineEvents(timelineResult.data as OrganizationTimelineEvent[])
        writeCachedArray(WORKSPACE_TIMELINE_CACHE_KEY, timelineResult.data as OrganizationTimelineEvent[])
      }
    }

    void loadMembersAndPresence()

    const channel = supabase
      .channel('workspace-profiles-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (refreshTimer !== null) {
          window.clearTimeout(refreshTimer)
        }
        refreshTimer = window.setTimeout(() => {
          void loadMembersAndPresence()
          refreshTimer = null
        }, 200)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence_sessions' }, () => {
        if (refreshTimer !== null) {
          window.clearTimeout(refreshTimer)
        }
        refreshTimer = window.setTimeout(() => {
          void loadMembersAndPresence()
          refreshTimer = null
        }, 200)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_timeline_events' }, () => {
        if (refreshTimer !== null) {
          window.clearTimeout(refreshTimer)
        }
        refreshTimer = window.setTimeout(() => {
          void loadMembersAndPresence()
          refreshTimer = null
        }, 200)
      })
      .subscribe()

    pollTimer = window.setInterval(() => {
      void loadMembersAndPresence()
    }, 45000)

    return () => {
      cancelled = true
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer)
      }
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockMs(Date.now())
    }, 15000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const activeCollaborators = members.length
  const onlineCollaborators = useMemo(
    () => members.filter((member) => isMemberOnline(member.id, presenceSessions, clockMs)).length,
    [clockMs, members, presenceSessions],
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
          </CardHeader>
          <CardContent className='space-y-2'>
            {members.length === 0 ? (
              <p className='rounded-md border bg-muted/10 px-3 py-4 text-sm text-muted-foreground'>
                No team profiles found yet.
              </p>
            ) : (
              members.map((member) => {
                const displayName = member.full_name ?? member.email ?? 'Unnamed user'
                const online = isMemberOnline(member.id, presenceSessions, clockMs)
                const available = isMemberAvailable(member)
                return (
                  <article key={member.id} className='flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2.5'>
                    <div className='flex items-center gap-3'>
                      <div className='relative'>
                        <Avatar className='h-9 w-9 border'>
                          {member.avatar_url ? <AvatarImage src={member.avatar_url} alt={displayName} /> : null}
                          <AvatarFallback className='text-xs font-semibold'>{initials(displayName)}</AvatarFallback>
                        </Avatar>
                        <span
                          className={
                            online
                              ? 'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background bg-emerald-400'
                              : 'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background bg-rose-400'
                          }
                          aria-label={online ? 'Online' : 'Offline'}
                          title={online ? 'Online' : 'Offline'}
                        />
                      </div>
                      <div>
                        <p className='text-sm font-medium text-foreground'>{displayName}</p>
                        <p className='text-xs text-muted-foreground'>{memberRole(member)}</p>
                      </div>
                    </div>
                    <Badge
                      variant='outline'
                      className={
                        available
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                      }
                    >
                      {available ? 'Available' : 'Unavailable'}
                    </Badge>
                  </article>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Organization Signals</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-md border bg-muted/10 p-3'>
              <p className='inline-flex items-center gap-2 text-sm font-medium'>
                <Users2 className='h-4 w-4 text-blue-400' />
                {activeCollaborators} active collaborators
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>{onlineCollaborators} currently online.</p>
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
        </CardHeader>
        <CardContent className='space-y-2'>
          {timelineEvents.length === 0 ? (
            <p className='rounded-md border bg-muted/10 px-3 py-4 text-sm text-muted-foreground'>No upcoming events.</p>
          ) : (
            timelineEvents.map((event) => (
              <article key={event.id} className='flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2.5'>
                <div>
                  <p className='text-sm font-medium text-foreground'>{event.title}</p>
                  <p className='text-xs text-muted-foreground'>{event.event_type}</p>
                </div>
                <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <CalendarDays className='h-3.5 w-3.5' />
                  {formatTimelineTime(event.starts_at)}
                </span>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
