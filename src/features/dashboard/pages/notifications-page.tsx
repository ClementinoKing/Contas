import { Bell, CheckCheck, Filter, MessageSquareText, ShieldAlert, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type NotificationType = 'mention' | 'task' | 'system'
type NotificationFilter = 'all' | 'unread' | 'mentions' | 'system'

type NotificationItem = {
  id: string
  title: string
  message: string
  time: string
  type: NotificationType
  read: boolean
}

const FILTERS: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'system', label: 'System' },
]

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Lina mentioned you in Atlas Revamp',
    message: '@Clement please review the updated API milestones before standup.',
    time: '2 min ago',
    type: 'mention',
    read: false,
  },
  {
    id: 'n2',
    title: 'Task moved to Review',
    message: 'Review API contract updates was moved to Review by James.',
    time: '18 min ago',
    type: 'task',
    read: false,
  },
  {
    id: 'n3',
    title: 'Organization security reminder',
    message: 'Enable two-factor authentication for all admins before Friday.',
    time: '1 hour ago',
    type: 'system',
    read: true,
  },
  {
    id: 'n4',
    title: 'Task due tomorrow',
    message: 'Update onboarding checklist is due tomorrow.',
    time: '3 hours ago',
    type: 'task',
    read: true,
  },
  {
    id: 'n5',
    title: 'Noah mentioned you in Sprint Notes',
    message: 'Can you confirm release scope changes in today’s recap?',
    time: 'Yesterday',
    type: 'mention',
    read: false,
  },
]

function NotificationIcon({ type }: { type: NotificationType }) {
  if (type === 'mention') return <UserRound className='h-4 w-4 text-blue-400' aria-hidden='true' />
  if (type === 'system') return <ShieldAlert className='h-4 w-4 text-amber-400' aria-hidden='true' />
  return <MessageSquareText className='h-4 w-4 text-emerald-400' aria-hidden='true' />
}

export function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [items, setItems] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS)

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items])

  const visibleItems = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'unread') return items.filter((item) => !item.read)
    if (filter === 'mentions') return items.filter((item) => item.type === 'mention')
    return items.filter((item) => item.type === 'system')
  }, [filter, items])

  const markAllRead = () => {
    setItems((current) => current.map((item) => ({ ...item, read: true })))
  }

  const toggleRead = (id: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, read: !item.read } : item)),
    )
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div className='inline-flex flex-wrap gap-1 rounded-md bg-muted/35 p-1'>
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type='button'
                onClick={() => setFilter(item.key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filter === item.key
                    ? 'border bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='gap-1.5'>
              <Bell className='h-3.5 w-3.5' aria-hidden='true' />
              {unreadCount} unread
            </Badge>
            <Button type='button' size='sm' variant='outline' onClick={markAllRead}>
              <CheckCheck className='mr-1.5 h-4 w-4' aria-hidden='true' />
              Mark all read
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Keep up with mentions, task updates, and organization alerts.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {visibleItems.length === 0 ? (
            <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
              No notifications in this filter.
            </div>
          ) : (
            visibleItems.map((item) => (
              <article
                key={item.id}
                className={cn(
                  'rounded-md border px-3 py-3 transition-colors',
                  !item.read ? 'border-primary/30 bg-primary/5' : 'bg-muted/10',
                )}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='flex min-w-0 items-start gap-2.5'>
                    <div className='mt-0.5 rounded-md border bg-background p-1.5'>
                      <NotificationIcon type={item.type} />
                    </div>
                    <div className='min-w-0 space-y-1'>
                      <p className='text-sm font-semibold text-foreground'>{item.title}</p>
                      <p className='text-sm text-muted-foreground'>{item.message}</p>
                      <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                        <span>{item.time}</span>
                        <span>•</span>
                        <span className='capitalize'>{item.type}</span>
                        {!item.read ? (
                          <>
                            <span>•</span>
                            <span className='text-primary'>Unread</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <Button type='button' size='sm' variant='ghost' className='h-8 px-2 text-xs' onClick={() => toggleRead(item.id)}>
                    {item.read ? 'Mark unread' : 'Mark read'}
                  </Button>
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className='flex items-center justify-between p-3 text-xs text-muted-foreground'>
          <span className='inline-flex items-center gap-1.5'>
            <Filter className='h-3.5 w-3.5' aria-hidden='true' />
            Filter: {FILTERS.find((item) => item.key === filter)?.label}
          </span>
          <span>{visibleItems.length} item(s)</span>
        </CardContent>
      </Card>
    </div>
  )
}
