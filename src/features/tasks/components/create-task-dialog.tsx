import { AtSign, Check, ChevronsUpDown, Paperclip, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/features/auth/context/auth-context'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type ProjectOption = { id: string; name: string }
type MemberOption = { id: string; name: string; email?: string; avatarUrl?: string }
type MentionMatch = { start: number; end: number; query: string }
type ScheduleMode = 'single' | 'range'

function mapBoardColumnToStatus(boardColumn?: string) {
  switch (boardColumn) {
    case 'in_progress':
      return 'in_progress'
    case 'review':
      return 'review'
    case 'blocked':
      return 'blocked'
    default:
      return 'planned'
  }
}

export type CreatedTaskPayload = {
  id: string
  title: string
  status: string | null
  priority: string | null
  boardColumn: string | null
  createdById: string
  projectId: string
  projectName: string
  assigneeIds: string[]
  assigneeNames: string[]
  assigneeId: string
  assigneeName: string
  dueAt: string | null
  startAt: string
  createdAt: string
  description: string
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  onTaskCreated,
  initialBoardColumn = 'planned',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaskCreated?: (task: CreatedTaskPayload) => void
  initialBoardColumn?: string
}) {
  const { currentUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([])
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [activeMention, setActiveMention] = useState<MentionMatch | null>(null)
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('single')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('low')
  const [singleDueAt, setSingleDueAt] = useState<Date | undefined>()
  const [rangeStartAt, setRangeStartAt] = useState<Date | undefined>()
  const [rangeEndAt, setRangeEndAt] = useState<Date | undefined>()
  const [selectedAttachment, setSelectedAttachment] = useState('')
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      supabase.from('projects').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name', { ascending: true }),
    ]).then(([projectsResult, profilesResult]) => {
      if (cancelled) return

      const projects = (projectsResult.data ?? []).map((project) => ({ id: project.id, name: project.name ?? 'Untitled project' }))
      const members = (profilesResult.data ?? []).map((profile) => ({
        id: profile.id,
        name: profile.full_name ?? profile.email ?? 'Unknown member',
        email: profile.email ?? undefined,
        avatarUrl: profile.avatar_url ?? undefined,
      }))

      setProjectOptions(projects)
      setMemberOptions(members)
      setProjectId((current) => current || projects[0]?.id || '')
    })

    return () => {
      cancelled = true
    }
  }, [])

  const reset = () => {
    setTitle('')
    setProjectId(projectOptions[0]?.id ?? '')
    setAssigneeIds([])
    setAssigneeSearch('')
    setAssigneeOpen(false)
    setDescription('')
    setActiveMention(null)
    setScheduleMode('single')
    setPriority('low')
    setSingleDueAt(undefined)
    setRangeStartAt(undefined)
    setRangeEndAt(undefined)
    setSelectedAttachment('')
    setErrorMessage(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const handleSubmit = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setErrorMessage('Task title is required.')
      return
    }

    setCreating(true)
    setErrorMessage(null)

    try {
      let startAtIso: string | null = null
      let dueAtIso: string | null = null

      if (scheduleMode === 'single') {
        if (singleDueAt) {
          const iso = singleDueAt.toISOString()
          startAtIso = iso
          dueAtIso = iso
        } else {
          startAtIso = new Date().toISOString()
        }
      } else {
        if (!rangeStartAt || !rangeEndAt) {
          setErrorMessage('Start date and end date are required for date range tasks.')
          setCreating(false)
          return
        }
        if (rangeStartAt.getTime() > rangeEndAt.getTime()) {
          setErrorMessage('Start date must be before or equal to end date.')
          setCreating(false)
          return
        }
        startAtIso = rangeStartAt.toISOString()
        dueAtIso = rangeEndAt.toISOString()
      }

      const primaryAssigneeId = assigneeIds[0] ?? null
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: trimmedTitle,
          description: description.trim() || null,
          status: mapBoardColumnToStatus(initialBoardColumn),
          board_column: initialBoardColumn,
          project_id: projectId || null,
          assigned_to: primaryAssigneeId,
          created_by: currentUser?.id ?? null,
          due_at: dueAtIso,
          start_at: startAtIso,
          priority,
        })
        .select('id, title, description, status, priority, board_column, project_id, assigned_to, created_by, due_at, start_at, created_at')
        .single()

      if (error || !data) {
        throw error ?? new Error('Task could not be created.')
      }

      if (assigneeIds.length > 0) {
        const { error: assigneesError } = await supabase
          .from('task_assignees')
          .insert(assigneeIds.map((assigneeId) => ({ task_id: data.id, assignee_id: assigneeId })))
        if (assigneesError) {
          throw assigneesError
        }

        if (currentUser?.id) {
          const recipients = assigneeIds.filter((assigneeId) => assigneeId !== currentUser.id)
          if (recipients.length > 0) {
            const notifications = recipients.map((recipientId) => ({
              recipient_id: recipientId,
              actor_id: currentUser.id,
              task_id: data.id,
              type: 'task' as const,
              title: 'New task assigned to you',
              message: `You were assigned "${data.title}".`,
              metadata: { event: 'task_assigned', source: 'task_create' },
            }))

            const { error: notificationsError } = await supabase.from('notifications').insert(notifications)
            if (notificationsError) {
              console.error('Failed to create assignment notifications', notificationsError)
            }
          }
        }
      }

      const selectedAssigneeNames = assigneeIds
        .map((id) => memberOptions.find((member) => member.id === id)?.name)
        .filter((name): name is string => Boolean(name))

      onTaskCreated?.({
        id: data.id,
        title: data.title,
        status: data.status,
        priority: data.priority,
        boardColumn: data.board_column ?? null,
        createdById: data.created_by ?? currentUser?.id ?? '',
        projectId: data.project_id ?? '',
        projectName: projectOptions.find((project) => project.id === data.project_id)?.name ?? 'Unassigned project',
        assigneeIds,
        assigneeNames: selectedAssigneeNames,
        assigneeId: data.assigned_to ?? '',
        assigneeName: memberOptions.find((member) => member.id === data.assigned_to)?.name ?? 'Unassigned',
        dueAt: data.due_at ?? null,
        startAt: data.start_at ?? data.created_at ?? new Date().toISOString(),
        createdAt: data.created_at ?? new Date().toISOString(),
        description: data.description ?? '',
      })

      handleOpenChange(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Task could not be created.')
    } finally {
      setCreating(false)
    }
  }

  const teammateOptions = memberOptions.filter((member) => member.id !== currentUser?.id)
  const filteredMembers = teammateOptions.filter((member) => member.name.toLowerCase().includes(assigneeSearch.trim().toLowerCase()))
  const selectedAssigneeNames = assigneeIds
    .map((id) => memberOptions.find((member) => member.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  const mentionMembers = teammateOptions.filter((member) =>
    member.name.toLowerCase().includes((activeMention?.query ?? '').trim().toLowerCase()),
  )

  const initials = (value: string) =>
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'

  const detectMention = (value: string, caretPosition: number) => {
    const beforeCaret = value.slice(0, caretPosition)
    const match = beforeCaret.match(/(^|\s)@([a-zA-Z0-9._-]*)$/)

    if (!match || match.index === undefined) {
      setActiveMention(null)
      return
    }

    const fullMatch = match[0]
    const mentionStart = beforeCaret.length - fullMatch.length + fullMatch.lastIndexOf('@')
    setActiveMention({
      start: mentionStart,
      end: caretPosition,
      query: match[2] ?? '',
    })
  }

  const handleDescriptionChange = (value: string, caretPosition: number) => {
    setDescription(value)
    detectMention(value, caretPosition)
  }

  const insertMention = (member: MemberOption) => {
    if (!activeMention) return

    const mentionText = `@${member.name} `
    const nextDescription = `${description.slice(0, activeMention.start)}${mentionText}${description.slice(activeMention.end)}`
    const nextCaret = activeMention.start + mentionText.length

    setDescription(nextDescription)
    setActiveMention(null)

    window.requestAnimationFrame(() => {
      descriptionRef.current?.focus()
      descriptionRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Add a task and link it to the right project and assignee.</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>Scheduling</label>
            <div className='inline-flex gap-1 rounded-md bg-muted/35 p-1'>
              <button
                type='button'
                onClick={() => setScheduleMode('single')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  scheduleMode === 'single'
                    ? 'border bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                Single Date
              </button>
              <button
                type='button'
                onClick={() => setScheduleMode('range')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  scheduleMode === 'range'
                    ? 'border bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                Date Range
              </button>
            </div>
            {scheduleMode === 'single' ? (
              <DatePicker value={singleDueAt} onChange={setSingleDueAt} placeholder='Due date' className='h-10 w-full text-sm' />
            ) : (
              <div className='grid gap-2 md:grid-cols-2'>
                <DatePicker value={rangeStartAt} onChange={setRangeStartAt} placeholder='Start date' className='h-10 w-full text-sm' />
                <DatePicker value={rangeEndAt} onChange={setRangeEndAt} placeholder='End date' className='h-10 w-full text-sm' />
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>Task Name</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Enter task title' />
          </div>

          <div className='grid gap-3 md:grid-cols-2'>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Assigned To</label>
              <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                <PopoverTrigger asChild>
                  <button
                    type='button'
                    className='flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  >
                    <span className='flex min-w-0 items-center gap-3'>
                      {selectedAssigneeNames.length > 0 ? (
                        <span className='truncate text-left font-medium'>
                          {selectedAssigneeNames.join(', ')}
                        </span>
                      ) : (
                        <span className='text-muted-foreground'>Select teammate</span>
                      )}
                    </span>
                    <ChevronsUpDown className='h-4 w-4 shrink-0 text-muted-foreground' />
                  </button>
                </PopoverTrigger>
                <PopoverContent className='w-[360px] p-0' align='start'>
                  <div className='border-b p-3'>
                    <div className='flex items-center gap-2 rounded-md border bg-background px-3'>
                      <Search className='h-4 w-4 text-muted-foreground' />
                      <input
                        value={assigneeSearch}
                        onChange={(event) => setAssigneeSearch(event.target.value)}
                        placeholder='Search teammates'
                        className='h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground'
                      />
                    </div>
                  </div>

                  <div className='max-h-72 overflow-y-auto p-2'>
                    <button
                      type='button'
                      onClick={() => {
                        setAssigneeIds([])
                        setAssigneeSearch('')
                      }}
                      className='flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent'
                    >
                      <span className='text-muted-foreground'>Unassigned</span>
                      {assigneeIds.length === 0 ? <Check className='h-4 w-4 text-primary' /> : null}
                    </button>

                    {filteredMembers.length === 0 ? (
                      <div className='px-3 py-8 text-center text-sm text-muted-foreground'>No teammates found.</div>
                    ) : (
                      filteredMembers.map((member) => (
                        <button
                          key={member.id}
                          type='button'
                          onClick={() => {
                            setAssigneeIds((ids) => (ids.includes(member.id) ? ids.filter((id) => id !== member.id) : [...ids, member.id]))
                            setAssigneeSearch('')
                          }}
                          className='flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-accent'
                        >
                          <span className='flex min-w-0 items-center gap-3'>
                            <Avatar className='h-8 w-8 border'>
                              {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={member.name} /> : null}
                              <AvatarFallback className='text-[10px] font-semibold'>{initials(member.name)}</AvatarFallback>
                            </Avatar>
                            <span className='truncate text-sm font-medium text-foreground'>{member.name}</span>
                          </span>
                          <Check className={cn('h-4 w-4 text-primary', assigneeIds.includes(member.id) ? 'opacity-100' : 'opacity-0')} />
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedAssigneeNames.length > 0 ? (
                <p className='text-xs text-muted-foreground'>{selectedAssigneeNames.length} teammates selected</p>
              ) : null}
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Project</label>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              >
                <option value=''>No project</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>Priority</label>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as 'low' | 'medium' | 'high' | 'urgent')}
              className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            >
              <option value='low'>Low</option>
              <option value='medium'>Medium</option>
              <option value='high'>High</option>
              <option value='urgent'>Urgent</option>
            </select>
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <label className='text-sm font-medium text-foreground'>Description</label>
              <div className='flex items-center gap-1'>
                <button
                  type='button'
                  onClick={() => {
                    const textarea = descriptionRef.current
                    if (!textarea) return

                    const start = textarea.selectionStart ?? description.length
                    const nextDescription = `${description.slice(0, start)}@${description.slice(start)}`
                    const nextCaret = start + 1

                    setDescription(nextDescription)

                    window.requestAnimationFrame(() => {
                      textarea.focus()
                      textarea.setSelectionRange(nextCaret, nextCaret)
                      detectMention(nextDescription, nextCaret)
                    })
                  }}
                  className='inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                  aria-label='Mention teammate'
                >
                  <AtSign className='h-4 w-4' aria-hidden='true' />
                </button>
                <button
                  type='button'
                  onClick={() => fileInputRef.current?.click()}
                  className='inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                  aria-label='Add attachment'
                >
                  <Paperclip className='h-4 w-4' aria-hidden='true' />
                </button>
              </div>
            </div>
            <div className='relative'>
              <textarea
                ref={descriptionRef}
                rows={5}
                value={description}
                onChange={(event) => handleDescriptionChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                onKeyUp={(event) => detectMention(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                onClick={(event) => detectMention(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                placeholder='Describe the task... use @ to mention teammates'
                className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              />

              {activeMention ? (
                <div className='absolute bottom-3 left-3 z-20 min-w-[180px] max-w-[260px] overflow-hidden rounded-xl border bg-popover/98 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] backdrop-blur'>
                  {mentionMembers.length === 0 ? (
                    <div className='px-3 py-4 text-sm text-muted-foreground'>No matching teammates.</div>
                  ) : (
                    mentionMembers.slice(0, 5).map((member) => (
                      <button
                        key={member.id}
                        type='button'
                        onClick={() => insertMention(member)}
                        className='flex w-full items-center px-3 py-2.5 text-left transition-colors hover:bg-accent'
                      >
                        <div className='truncate text-sm font-medium text-foreground'>{member.name}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type='file'
              className='hidden'
              onChange={(event) => setSelectedAttachment(event.target.files?.[0]?.name ?? '')}
            />
            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>{selectedAttachment ? `Attachment: ${selectedAttachment}` : 'No attachment selected'}</span>
              {scheduleMode === 'single' ? (
                <span>{singleDueAt ? `Due: ${singleDueAt.toLocaleDateString()}` : 'No due date selected'}</span>
              ) : (
                <span>
                  {rangeStartAt && rangeEndAt
                    ? `Range: ${rangeStartAt.toLocaleDateString()} - ${rangeEndAt.toLocaleDateString()}`
                    : 'No range selected'}
                </span>
              )}
            </div>
          </div>

          {errorMessage ? <p className='text-sm text-destructive'>{errorMessage}</p> : null}

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => handleOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type='button' onClick={() => void handleSubmit()} disabled={creating}>
              {creating ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
