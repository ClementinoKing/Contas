import { AtSign, Bell, CheckCheck, CirclePlus, Goal, HelpCircle, Layers, Menu, MessageSquarePlus, Search, ShieldAlert, UserPlus2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/context/auth-context'
import { useUnreadNotifications } from '@/features/layout/hooks/use-unread-notifications'
import { adjustCachedUnreadCount } from '@/features/layout/lib/unread-notifications-sync'
import { Input } from '@/components/ui/input'
import { CreateTaskDialog } from '@/features/tasks/components/create-task-dialog'
import { DEFAULT_PROJECT_COLOR, PROJECT_COLOR_OPTIONS, normalizeProjectColor, projectDotStyle } from '@/features/projects/lib/project-colors'
import { supabase } from '@/lib/supabase'

import { AccountMenu } from './account-menu'
import { InvitePeopleDialog } from './invite-people-dialog'

type ProjectOwnerOption = {
  id: string
  name: string
}

type HeaderNotificationType = 'mention' | 'task' | 'system'

type HeaderNotificationItem = {
  id: string
  title: string
  message: string
  taskId?: string
  createdAt: string
  type: HeaderNotificationType
  read: boolean
}

function notificationTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function HeaderNotificationTypeIcon({ type }: { type: HeaderNotificationType }) {
  if (type === 'mention') return <AtSign className='h-3.5 w-3.5 text-blue-400' aria-hidden='true' />
  if (type === 'system') return <ShieldAlert className='h-3.5 w-3.5 text-amber-400' aria-hidden='true' />
  return <Bell className='h-3.5 w-3.5 text-emerald-400' aria-hidden='true' />
}

function generateProjectKey(name: string) {
  const letters = name
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 4)
  const suffix = Math.floor(100 + Math.random() * 900)
  return `${letters || 'PRJ'}-${suffix}`
}

export function AppHeader({
  onDesktopToggle,
  onMobileToggle,
}: {
  onDesktopToggle: () => void
  onMobileToggle: () => void
}) {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { unreadCount } = useUnreadNotifications()

  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const [projectName, setProjectName] = useState('')
  const [projectColor, setProjectColor] = useState(DEFAULT_PROJECT_COLOR)
  const [projectOwner, setProjectOwner] = useState('')
  const [projectStartDate, setProjectStartDate] = useState<Date | undefined>()
  const [projectEndDate, setProjectEndDate] = useState<Date | undefined>()
  const [projectDescription, setProjectDescription] = useState('')
  const [projectOwners, setProjectOwners] = useState<ProjectOwnerOption[]>([])
  const [projectSubmitError, setProjectSubmitError] = useState<string | null>(null)
  const [projectSubmitting, setProjectSubmitting] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationItems, setNotificationItems] = useState<HeaderNotificationItem[]>([])

  const fetchNotificationItems = useCallback(async () => {
    if (!currentUser?.id) return

    setNotificationsLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, task_id, type, read_at, created_at')
      .eq('recipient_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      console.error('Failed to load header notifications', error)
      setNotificationsLoading(false)
      return
    }

    setNotificationItems(
      Array.from(
        new Map(
          (data ?? []).map((row) => [
            row.id,
            {
              id: row.id,
              title: row.title,
              message: row.message,
              taskId: row.task_id ?? undefined,
              createdAt: row.created_at,
              type: row.type === 'mention' || row.type === 'system' ? row.type : 'task',
              read: Boolean(row.read_at),
            },
          ]),
        ).values(),
      ),
    )
    setNotificationsLoading(false)
  }, [currentUser?.id])

  const resetProjectFlow = () => {
    setProjectName('')
    setProjectColor(DEFAULT_PROJECT_COLOR)
    setProjectOwner('')
    setProjectStartDate(undefined)
    setProjectEndDate(undefined)
    setProjectDescription('')
    setProjectSubmitError(null)
    setProjectSubmitting(false)
  }

  const openCreateProjectModal = useCallback(() => {
    resetProjectFlow()
    setProjectOwner(currentUser?.id ?? '')
    setCreateProjectOpen(true)
  }, [currentUser?.id])

  const handleProjectModalChange = (open: boolean) => {
    if (!open) {
      resetProjectFlow()
    }
    setCreateProjectOpen(open)
  }

  useEffect(() => {
    if (!createProjectOpen || projectOwners.length > 0) return

    let cancelled = false

    void supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true })
      .then((result) => {
        if (cancelled || result.error) return
        const owners = (result.data ?? []).map((profile) => ({
          id: profile.id,
          name: profile.full_name ?? profile.email ?? 'Unknown user',
        }))
        setProjectOwners(owners)
        if (!projectOwner && currentUser?.id && owners.some((owner) => owner.id === currentUser.id)) {
          setProjectOwner(currentUser.id)
        }
      })

    return () => {
      cancelled = true
    }
  }, [createProjectOpen, currentUser?.id, projectOwner, projectOwners.length])

  useEffect(() => {
    if (!currentUser?.id) return
    void fetchNotificationItems()
  }, [currentUser?.id, fetchNotificationItems])

  useEffect(() => {
    const handleOpenCreateProject = () => openCreateProjectModal()
    window.addEventListener('contas:open-create-project', handleOpenCreateProject as EventListener)
    return () => window.removeEventListener('contas:open-create-project', handleOpenCreateProject as EventListener)
  }, [openCreateProjectModal])

  useEffect(() => {
    const onRealtimeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail
      if (detail?.table !== 'notifications') return
      void fetchNotificationItems()
    }
    window.addEventListener('contas:realtime-change', onRealtimeChange as EventListener)

    return () => {
      window.removeEventListener('contas:realtime-change', onRealtimeChange as EventListener)
    }
  }, [fetchNotificationItems])

  const unreadPreviewCount = useMemo(() => notificationItems.filter((item) => !item.read).length, [notificationItems])

  const markNotificationRead = async (id: string, read: boolean) => {
    let changed = false
    setNotificationItems((current) => {
      const target = current.find((item) => item.id === id)
      if (!target || target.read === read) return current
      changed = true
      const next = current.map((item) => (item.id === id ? { ...item, read } : item))
      return next
    })
    if (changed) {
      adjustCachedUnreadCount(read ? -1 : 1)
    }
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: read ? new Date().toISOString() : null })
      .eq('id', id)

    if (error && changed) {
      console.error('Failed to update notification state', error)
      adjustCachedUnreadCount(read ? 1 : -1)
      setNotificationItems((current) => current.map((item) => (item.id === id ? { ...item, read: !read } : item)))
    }
  }

  const markAllNotificationsRead = async () => {
    const unreadIds = notificationItems.filter((item) => !item.read).map((item) => item.id)
    if (unreadIds.length === 0) return

    const nowIso = new Date().toISOString()
    setNotificationItems((current) => current.map((item) => ({ ...item, read: true })))
    adjustCachedUnreadCount(-unreadIds.length)
    const { error } = await supabase.from('notifications').update({ read_at: nowIso }).in('id', unreadIds)
    if (error) {
      console.error('Failed to mark all notifications read', error)
      adjustCachedUnreadCount(unreadIds.length)
      setNotificationItems((current) => current.map((item) => (unreadIds.includes(item.id) ? { ...item, read: false } : item)))
    }
  }

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = projectName.trim()
    const trimmedDescription = projectDescription.trim()

    if (!trimmedName) {
      setProjectSubmitError('Project name is required.')
      return
    }
    if (!projectOwner) {
      setProjectSubmitError('Project owner is required.')
      return
    }
    if (projectStartDate && projectEndDate && projectStartDate.getTime() > projectEndDate.getTime()) {
      setProjectSubmitError('Start date must be before or equal to target end date.')
      return
    }

    setProjectSubmitting(true)
    setProjectSubmitError(null)

    const key = generateProjectKey(trimmedName)

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: trimmedName,
        key,
        status: 'planned',
        color: normalizeProjectColor(projectColor),
        owner_id: projectOwner || null,
        created_by: currentUser?.id ?? null,
        start_date: projectStartDate ? projectStartDate.toISOString().slice(0, 10) : null,
        end_date: projectEndDate ? projectEndDate.toISOString().slice(0, 10) : null,
        description: trimmedDescription || null,
      })
      .select('id')
      .single()

    if (error || !data) {
      setProjectSubmitting(false)
      setProjectSubmitError(error?.message ?? 'Project could not be created. Fix the error and try again.')
      return
    }

    sessionStorage.setItem('contas.projects.last-created-id', data.id)
    window.dispatchEvent(new CustomEvent('contas:project-created', { detail: { projectId: data.id } }))
    handleProjectModalChange(false)
    navigate(`/dashboard/projects/${data.id}`)
  }

  return (
    <>
      <header className='sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
        <div className='flex h-16 w-full items-center gap-3 px-4 md:px-6'>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' size='icon' className='md:hidden' onClick={onMobileToggle} aria-label='Open sidebar'>
              <Menu className='h-5 w-5' aria-hidden='true' />
            </Button>
            <Button variant='ghost' size='icon' className='hidden md:inline-flex' onClick={onDesktopToggle} aria-label='Collapse sidebar'>
              <Menu className='h-5 w-5' aria-hidden='true' />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className='h-9 gap-2 px-3 text-sm font-medium'>
                  <CirclePlus className='h-4 w-4' aria-hidden='true' />
                  Create
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                <DropdownMenuItem onSelect={() => setCreateTaskOpen(true)}>
                  <CirclePlus className='mr-2 h-4 w-4' aria-hidden='true' />
                  Create Task
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openCreateProjectModal}>
                  <Layers className='mr-2 h-4 w-4' aria-hidden='true' />
                  Create Project
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/dashboard/workspace')}>
                  <MessageSquarePlus className='mr-2 h-4 w-4' aria-hidden='true' />
                  Create Message
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/dashboard/goals')}>
                  <Goal className='mr-2 h-4 w-4' aria-hidden='true' />
                  Create Goal
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setInviteOpen(true)}>
                  <UserPlus2 className='mr-2 h-4 w-4' aria-hidden='true' />
                  Invite
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className='mx-auto hidden w-full max-w-xl items-center md:flex'>
            <div className='relative w-full'>
              <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
              <Input aria-label='Search projects and tasks' placeholder='Search tasks, projects, and teammates' className='pl-9' />
            </div>
          </div>

          <div className='ml-auto flex items-center gap-1'>
            <Button variant='ghost' size='icon' aria-label='Help center'>
              <HelpCircle className='h-5 w-5' aria-hidden='true' />
            </Button>
            <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                  className='relative'
                >
                  <Bell className='h-5 w-5' aria-hidden='true' />
                  {unreadCount > 0 ? (
                    <span className='absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white'>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-[360px] p-0'>
                <div className='flex items-center justify-between border-b px-3 py-2'>
                  <DropdownMenuLabel className='p-0'>Notifications</DropdownMenuLabel>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='h-7 w-7'
                    aria-label='Mark all read'
                    title='Mark all read'
                    onClick={() => void markAllNotificationsRead()}
                    disabled={unreadPreviewCount === 0}
                  >
                    <CheckCheck className='h-3.5 w-3.5' aria-hidden='true' />
                  </Button>
                </div>
                <div className='max-h-[420px] space-y-1 overflow-y-auto p-1'>
                  {notificationsLoading ? (
                    <div className='px-2 py-6 text-center text-sm text-muted-foreground'>Loading notifications...</div>
                  ) : null}
                  {!notificationsLoading && notificationItems.length === 0 ? (
                    <div className='px-2 py-6 text-center text-sm text-muted-foreground'>No notifications yet.</div>
                  ) : null}
                  {!notificationsLoading
                    ? notificationItems.map((item) => (
                        <button
                          key={item.id}
                          type='button'
                          onClick={() => {
                            if (!item.read) {
                              void markNotificationRead(item.id, true)
                            }
                            setNotificationsOpen(false)
                            const params = new URLSearchParams({ openNotificationId: item.id })
                            if (item.taskId) {
                              params.set('openTaskId', item.taskId)
                            }
                            navigate(`/dashboard/notifications?${params.toString()}`)
                          }}
                          className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${item.read ? 'bg-muted/10 hover:bg-muted/20' : 'border-primary/30 bg-primary/5 hover:bg-primary/10'}`}
                        >
                          <div className='flex items-start gap-2'>
                            <div className='mt-0.5 rounded-md border bg-background p-1'>
                              <HeaderNotificationTypeIcon type={item.type} />
                            </div>
                            <div className='min-w-0 flex-1 space-y-0.5'>
                              <div className='flex items-start justify-between gap-2'>
                                <p className='truncate text-sm font-semibold text-foreground'>{item.title}</p>
                                <span className='shrink-0 text-[11px] text-muted-foreground'>{notificationTimeLabel(item.createdAt)}</span>
                              </div>
                              <p className='line-clamp-2 text-xs text-muted-foreground'>{item.message}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    : null}
                </div>
                <DropdownMenuSeparator className='my-0' />
                <div className='p-1'>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault()
                      setNotificationsOpen(false)
                      navigate('/dashboard/notifications')
                    }}
                    className='justify-center text-sm font-medium'
                  >
                    View all notifications
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <AccountMenu />
          </div>
        </div>
        <div className='border-t px-4 py-2 md:hidden'>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
            <Input aria-label='Search projects and tasks' placeholder='Search tasks and projects' className='pl-9' />
          </div>
        </div>
      </header>

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        onTaskCreated={() => navigate('/dashboard/my-tasks')}
      />

      <Dialog open={createProjectOpen} onOpenChange={handleProjectModalChange}>
        <DialogContent className='max-h-[88vh] max-w-3xl overflow-hidden p-0'>
          <div className='flex max-h-[88vh] flex-col'>
            <DialogHeader className='border-b px-6 py-4'>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Add the core details and choose a project color.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateProject} className='flex min-h-0 flex-1 flex-col'>
              <section className='min-h-0 flex-1 overflow-y-auto p-5 md:p-6'>
                <div className='mx-auto grid w-full max-w-3xl gap-4 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Project Name</label>
                    <Input
                      required
                      placeholder='Enter project name'
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Owner</label>
                    <select
                      required
                      value={projectOwner}
                      onChange={(event) => setProjectOwner(event.target.value)}
                      className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    >
                      <option value='' disabled>
                        Select owner
                      </option>
                      {projectOwners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Start Date</label>
                    <DatePicker value={projectStartDate} onChange={setProjectStartDate} placeholder='Pick start date' withTime={false} />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Target End Date</label>
                    <DatePicker value={projectEndDate} onChange={setProjectEndDate} placeholder='Pick end date' withTime={false} />
                  </div>
                  <div className='space-y-2 md:col-span-2'>
                    <label className='text-sm font-medium text-foreground'>Project Color</label>
                    <div className='flex flex-wrap items-center gap-3 rounded-md border border-input bg-background px-3 py-2'>
                      {PROJECT_COLOR_OPTIONS.map((color) => (
                        <button
                          key={color}
                          type='button'
                          onClick={() => setProjectColor(color)}
                          className={`h-6 w-6 rounded-full border-2 ${normalizeProjectColor(projectColor) === color ? 'border-foreground' : 'border-transparent'}`}
                          style={projectDotStyle(color)}
                          aria-label={`Select project color ${color}`}
                        />
                      ))}
                      <span className='ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground'>
                        Custom
                        <input
                          type='color'
                          value={normalizeProjectColor(projectColor)}
                          onChange={(event) => setProjectColor(event.target.value)}
                          className='h-7 w-9 cursor-pointer rounded border border-input bg-background p-0.5'
                          aria-label='Pick custom project color'
                        />
                      </span>
                    </div>
                  </div>
                  <div className='space-y-2 md:col-span-2'>
                    <label className='text-sm font-medium text-foreground'>Project Description</label>
                    <textarea
                      rows={6}
                      value={projectDescription}
                      onChange={(event) => setProjectDescription(event.target.value)}
                      placeholder='Describe the project scope, goals, and outcomes.'
                      className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    />
                  </div>
                </div>
              </section>

              <DialogFooter className='border-t px-6 py-4'>
                {projectSubmitError ? <p className='mr-auto text-sm text-destructive'>{projectSubmitError}</p> : null}
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    handleProjectModalChange(false)
                  }}
                >
                  Cancel
                </Button>
                <Button type='submit' disabled={projectSubmitting}>
                  {projectSubmitting ? 'Creating...' : 'Create Project'}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <InvitePeopleDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
}
