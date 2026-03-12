import {
  Activity,
  CalendarDays,
  Check,
  CheckCheck,
  CirclePlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  KanbanSquare,
  List,
  MessageSquare,
  Loader2,
  MessageCircle,
  NotebookPen,
  Paperclip,
  Pencil,
  Search,
  Send,
  Heart,
  Mic,
  Smile,
  Square,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/features/auth/context/auth-context'
import { CreateTaskDialog, type CreatedTaskPayload } from '@/features/tasks/components/create-task-dialog'
import type { TaskRow } from '@/features/tasks/tasks-data'
import { resolveAvatarUrl, resolveR2ObjectUrl, uploadVoiceToR2 } from '@/lib/r2'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type TaskTab = 'list' | 'board' | 'calendar' | 'notes'
type CalendarView = 'daily' | 'weekly' | 'monthly' | 'yearly'
type BoardSavedView = 'all' | 'my-open' | 'due-soon'
type BoardDueFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'none'
type BoardCompletionFilter = 'all' | 'open' | 'completed'
type ListScopeFilter = 'all' | 'assigned_to_me' | 'created_by_me' | 'due_soon' | 'overdue'
type ListCompletionFilter = 'all' | 'open' | 'completed'
type ListStatusFilter = 'all' | TaskRow['status']

const MY_TASKS_ACTIVE_TAB_KEY = 'contas.my-tasks.active-tab'
const COMMENT_PAYLOAD_PREFIX = '__contas_comment_v1__:'
const COMMENT_EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '🙏', '✅']

type VoicePayload = {
  file: File
  previewUrl: string
  durationMs: number
}

type BoardComment = {
  id: string
  authorId: string
  author: string
  authorAvatarUrl?: string
  content: string
  voiceDataUrl?: string
  voiceDurationMs?: number
  createdAt: string
  likes: number
  likedByMe: boolean
  replies: Array<{
    id: string
    authorId: string
    author: string
    authorAvatarUrl?: string
    content: string
    createdAt: string
  }>
}

type BoardActivity = {
  id: string
  message: string
  createdAt: string
}

type BoardTask = {
  id: string
  title: string
  due: string
  assignee: string
  description: string
  completed: boolean
  comments: BoardComment[]
  activity: BoardActivity[]
}

type BoardDefinition = {
  id: string
  title: string
  sortOrder: number
  isDefault: boolean
}

type BoardColumn = { id: string; title: string; isDefault: boolean; items: BoardTask[] }
type BoardTaskDraft = {
  title: string
  projectId: string
  startDate: string
  endDate: string
  assigneeIds: string[]
  status: TaskRow['status']
  priority: TaskRow['priority']
  description: string
  completed: boolean
}
type HoverAlign = 'left' | 'center' | 'right'

const BOARD_ME_ASSIGNEE = 'Lina'

const TABS: Array<{ key: TaskTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: 'list', label: 'List', icon: List },
  { key: 'board', label: 'Board', icon: KanbanSquare },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'notes', label: 'Notes', icon: NotebookPen },
]

const BOARD_SAVED_VIEWS: Array<{ key: BoardSavedView; label: string }> = [
  { key: 'all', label: 'All Tasks' },
  { key: 'my-open', label: 'My Open Work' },
  { key: 'due-soon', label: 'Due Soon' },
]

const CALENDAR_VIEW_TABS: Array<{ key: CalendarView; label: string }> = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
]

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function nowTimeLabel() {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(),
  )
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return nowTimeLabel()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return nowTimeLabel()
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(parsed)
}

function serializeCommentContent(
  text: string,
  voice?: { voiceDataUrl?: string; voiceStorageKey?: string; durationMs?: number } | null,
) {
  if (!voice) return text
  const payload = JSON.stringify({
    text,
    voiceDataUrl: voice.voiceDataUrl,
    voiceStorageKey: voice.voiceStorageKey,
    voiceDurationMs: voice.durationMs,
  })
  const encoded = window.btoa(unescape(encodeURIComponent(payload)))
  return `${COMMENT_PAYLOAD_PREFIX}${encoded}`
}

function parseCommentContent(content: string) {
  if (!content.startsWith(COMMENT_PAYLOAD_PREFIX)) {
    return {
      text: content,
      voiceDataUrl: undefined as string | undefined,
      voiceStorageKey: undefined as string | undefined,
      voiceDurationMs: undefined as number | undefined,
    }
  }
  try {
    const encoded = content.slice(COMMENT_PAYLOAD_PREFIX.length)
    const decoded = decodeURIComponent(escape(window.atob(encoded)))
    const payload = JSON.parse(decoded) as {
      text?: string
      voiceDataUrl?: string
      voiceStorageKey?: string
      voiceDurationMs?: number
    }
    return {
      text: payload.text ?? '',
      voiceDataUrl: payload.voiceDataUrl,
      voiceStorageKey: payload.voiceStorageKey,
      voiceDurationMs: payload.voiceDurationMs,
    }
  } catch {
    return {
      text: content,
      voiceDataUrl: undefined as string | undefined,
      voiceStorageKey: undefined as string | undefined,
      voiceDurationMs: undefined as number | undefined,
    }
  }
}

function formatVoiceDuration(durationMs?: number) {
  if (!durationMs) return '0:00'
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getMentionDraft(value: string, cursor: number | null) {
  if (cursor === null || cursor < 0) return null
  const beforeCursor = value.slice(0, cursor)
  const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9._-]*)$/)
  if (!match) return null

  const query = match[2] ?? ''
  const start = cursor - query.length - 1
  return { start, end: cursor, query }
}

function initialsForName(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  )
}

function isDirectAvatarUrl(value?: string | null) {
  if (!value) return false
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')
}

function makeActivity(message: string): BoardActivity {
  return {
    id: `act-${crypto.randomUUID()}`,
    message,
    createdAt: nowTimeLabel(),
  }
}

const INITIAL_BOARD_DEFINITIONS: BoardDefinition[] = [
  { id: 'planned', title: 'Planned', sortOrder: 0, isDefault: true },
  { id: 'in_progress', title: 'In Progress', sortOrder: 1, isDefault: true },
  { id: 'review', title: 'Review', sortOrder: 2, isDefault: true },
  { id: 'blocked', title: 'Blocked', sortOrder: 3, isDefault: true },
]

function parseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return startOfDay(next)
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return startOfDay(next)
}

function addYears(date: Date, years: number) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return startOfDay(next)
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getWeekStart(date: Date) {
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  return addDays(date, mondayOffset)
}

function getMonthGridStart(date: Date) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
  return getWeekStart(monthStart)
}

function spansDate(task: TaskRow, date: Date) {
  const target = startOfDay(date).getTime()
  const start = parseDate(task.startDate).getTime()
  const end = parseDate(task.endDate).getTime()
  return target >= start && target <= end
}

function intersectsRange(task: TaskRow, rangeStart: Date, rangeEnd: Date) {
  const taskStart = parseDate(task.startDate).getTime()
  const taskEnd = parseDate(task.endDate).getTime()
  const start = startOfDay(rangeStart).getTime()
  const end = startOfDay(rangeEnd).getTime()
  return taskStart <= end && taskEnd >= start
}

function formatRange(task: TaskRow) {
  const start = parseDate(task.startDate)
  const end = parseDate(task.endDate)
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

function calendarBarTone(status: TaskRow['status']) {
  switch (status) {
    case 'In Progress':
      return 'bg-blue-500/80'
    case 'Review':
      return 'bg-emerald-500/80'
    case 'Planned':
      return 'bg-amber-500/80'
    case 'Blocked':
      return 'bg-rose-500/80'
    default:
      return 'bg-slate-500/80'
  }
}

function statusBadgeTone(status: TaskRow['status']) {
  switch (status) {
    case 'In Progress':
      return 'border-blue-500/40 bg-blue-500/15 text-blue-300'
    case 'Review':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
    case 'Planned':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-300'
    case 'Blocked':
      return 'border-rose-500/40 bg-rose-500/15 text-rose-300'
    default:
      return 'border-slate-500/40 bg-slate-500/15 text-slate-300'
  }
}

function priorityBadgeTone(priority: TaskRow['priority']) {
  switch (priority) {
    case 'Urgent':
      return 'border-rose-500/40 bg-rose-500/15 text-rose-300'
    case 'High':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-300'
    case 'Medium':
      return 'border-blue-500/40 bg-blue-500/15 text-blue-300'
    default:
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
  }
}

function taskHoverDetails(task: TaskRow) {
  return {
    range: formatRange(task),
  }
}

function parseBoardDueDate(due: string) {
  const dueWithTime = parseBoardDueValue(due)
  return dueWithTime ? startOfDay(dueWithTime) : null
}

function parseBoardDueValue(due: string) {
  const label = due.trim()
  if (!label || label === 'No due date' || label === 'Completed') return null
  if (label.startsWith('Today')) {
    const now = new Date()
    const todayWithTime = new Date(now)
    todayWithTime.setSeconds(0, 0)

    const timePart = label.split(',').slice(1).join(',').trim()
    if (!timePart) return todayWithTime

    const parsedTime = new Date(`1970-01-01 ${timePart}`)
    if (Number.isNaN(parsedTime.getTime())) return todayWithTime

    todayWithTime.setHours(parsedTime.getHours(), parsedTime.getMinutes(), 0, 0)
    return todayWithTime
  }

  const year = new Date().getFullYear()
  const parsed = /\b\d{4}\b/.test(label) ? new Date(label) : new Date(`${label}, ${year}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function toDateInputValue(date?: Date | null) {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function dateFromInputValue(value: string) {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

function normalizeTaskScheduleDates(startDate: string, endDate: string, fallbackStart?: string, fallbackEnd?: string) {
  const today = toDateInputValue(new Date())
  const normalizedStart = startDate || endDate || fallbackStart || fallbackEnd || today
  const normalizedEnd = endDate || startDate || fallbackEnd || fallbackStart || today
  if (normalizedStart <= normalizedEnd) {
    return { startDate: normalizedStart, endDate: normalizedEnd, valid: true }
  }
  return { startDate: normalizedStart, endDate: normalizedEnd, valid: false }
}

function formatTaskDueLabel(value?: string | null) {
  if (!value) return 'No due date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No due date'
  const today = startOfDay(new Date())
  if (isSameDay(startOfDay(parsed), today)) return 'Today'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed)
}

function mapTaskStatus(value?: string | null): TaskRow['status'] {
  switch (value) {
    case 'in_progress':
      return 'In Progress'
    case 'review':
      return 'Review'
    case 'blocked':
      return 'Blocked'
    case 'done':
      return 'Done'
    default:
      return 'Planned'
  }
}

function mapTaskPriority(value?: string | null): TaskRow['priority'] {
  switch (value) {
    case 'urgent':
      return 'Urgent'
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    default:
      return 'Low'
  }
}

function mapTaskPriorityToDatabasePriority(priority: TaskRow['priority']) {
  switch (priority) {
    case 'Urgent':
      return 'urgent'
    case 'High':
      return 'high'
    case 'Medium':
      return 'medium'
    default:
      return 'low'
  }
}

function createBoardId(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return base ? `board_${base}_${crypto.randomUUID().slice(0, 8)}` : `board_${crypto.randomUUID()}`
}

function isStatusBackedBoardColumn(value: string) {
  return value === 'planned' || value === 'in_progress' || value === 'review' || value === 'blocked'
}

function boardColumnIdFromTask(task: Pick<TaskRow, 'status' | 'boardColumn'>) {
  if (task.boardColumn) return task.boardColumn

  switch (task.status) {
    case 'Done':
      return 'review'
    case 'In Progress':
      return 'in_progress'
    case 'Review':
      return 'review'
    case 'Blocked':
      return 'blocked'
    default:
      return 'planned'
  }
}

function fallbackBoardTitle(boardId: string) {
  return boardId
    .replace(/^board_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function createBoardColumnsFromTasks(
  tasks: TaskRow[],
  boardDefinitions: BoardDefinition[],
  commentsByTaskId: Record<string, BoardComment[]>,
): BoardColumn[] {
  const definitionSource = boardDefinitions.length > 0 ? boardDefinitions : INITIAL_BOARD_DEFINITIONS
  const columns = definitionSource
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((column) => ({ id: column.id, title: column.title, isDefault: column.isDefault, items: [] as BoardTask[] }))
  const columnMap = new Map(columns.map((column) => [column.id, column]))

  tasks.forEach((task) => {
    const columnId = boardColumnIdFromTask(task)
    let column = columnMap.get(columnId)
    if (!column) {
      column = { id: columnId, title: fallbackBoardTitle(columnId), isDefault: false, items: [] }
      columnMap.set(columnId, column)
      columns.push(column)
    }
    if (!column) return

    column.items.push({
      id: task.id,
      title: task.title,
      due: task.due,
      assignee: task.owner,
      description: task.description ?? `${task.projectName} task`,
      completed: task.completed ?? false,
      comments: commentsByTaskId[task.id] ?? [],
      activity: [makeActivity('Loaded from task database')],
    })
  })

  return columns
}

function mapColumnIdToTaskStatus(columnId: string): TaskRow['status'] {
  switch (columnId) {
    case 'in_progress':
      return 'In Progress'
    case 'review':
      return 'Review'
    case 'blocked':
      return 'Blocked'
    default:
      return 'Planned'
  }
}

function mapTaskStatusToDatabaseStatus(status: TaskRow['status']) {
  switch (status) {
    case 'In Progress':
      return 'in_progress'
    case 'Review':
      return 'review'
    case 'Blocked':
      return 'blocked'
    case 'Done':
      return 'done'
    default:
      return 'planned'
  }
}

function nextTaskStatusForBoardMove(columnId: string, currentStatus: TaskRow['status']) {
  return isStatusBackedBoardColumn(columnId) ? mapColumnIdToTaskStatus(columnId) : currentStatus
}

function boardColumnIdFromStatus(status: TaskRow['status']) {
  switch (status) {
    case 'In Progress':
      return 'in_progress'
    case 'Review':
      return 'review'
    case 'Blocked':
      return 'blocked'
    default:
      return 'planned'
  }
}

async function fetchBoardDefinitions() {
  const withDefaults = await supabase.from('boards').select('id, name, sort_order, is_default').order('sort_order', { ascending: true })

  if (!withDefaults.error && withDefaults.data) {
    return withDefaults.data.map((board) => ({
      id: board.id,
      title: board.name,
      sortOrder: board.sort_order ?? 0,
      isDefault: board.is_default ?? false,
    }))
  }

  const withoutDefaults = await supabase.from('boards').select('id, name, sort_order').order('sort_order', { ascending: true })

  if (!withoutDefaults.error && withoutDefaults.data) {
    return withoutDefaults.data.map((board) => ({
      id: board.id,
      title: board.name,
      sortOrder: board.sort_order ?? 0,
      isDefault: board.id === 'planned' || board.id === 'in_progress' || board.id === 'review' || board.id === 'blocked',
    }))
  }

  return INITIAL_BOARD_DEFINITIONS
}

function TaskHoverCard({
  task,
  align = 'left',
  onOpenTask,
}: {
  task: TaskRow
  align?: HoverAlign
  onOpenTask?: (taskId: string) => void
}) {
  const details = taskHoverDetails(task)

  return (
    <div
      className={cn(
        'pointer-events-none absolute top-full z-30 mt-2 hidden w-[min(16rem,calc(100vw-2rem))] rounded-lg border bg-card p-3 shadow-lg group-hover:block group-focus-within:block',
        align === 'left' && 'left-0',
        align === 'center' && 'left-1/2 -translate-x-1/2',
        align === 'right' && 'right-0',
      )}
    >
      <div className='space-y-1'>
        <p className='text-sm font-semibold text-foreground'>{task.title}</p>
      </div>

      <div className='mt-3 space-y-1.5 text-xs'>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-muted-foreground'>Project</span>
          <span className='font-medium text-foreground'>{task.projectName}</span>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-muted-foreground'>Owner</span>
          <span className='font-medium text-foreground'>{task.owner}</span>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-muted-foreground'>Range</span>
          <span className='font-medium text-foreground'>{details.range}</span>
        </div>
      </div>

      <div className='mt-3 flex items-center justify-between'>
        <Badge variant='outline' className={statusBadgeTone(task.status)}>{task.status}</Badge>
        <button
          type='button'
          className='pointer-events-auto text-xs font-medium text-primary hover:underline'
          onClick={() => onOpenTask?.(task.id)}
        >
          Open task
        </button>
      </div>
    </div>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/60', className)} />
}

function TaskListSkeleton() {
  return (
    <Card className='flex h-full w-full min-h-0 flex-col overflow-hidden'>
      <CardHeader className='pb-3'>
        <div className='flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between'>
          <div className='grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(320px,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(220px,1fr)]'>
            <SkeletonBlock className='h-10' />
            <SkeletonBlock className='h-10' />
            <SkeletonBlock className='h-10' />
            <div className='grid grid-cols-2 gap-2'>
              <SkeletonBlock className='h-10' />
              <SkeletonBlock className='h-10' />
            </div>
          </div>
          <SkeletonBlock className='h-10 w-32 self-end xl:self-auto' />
        </div>
      </CardHeader>
      <CardContent className='min-h-0 flex-1 p-3'>
        <div className='h-full space-y-4 overflow-auto'>
          {Array.from({ length: 3 }, (_, sectionIndex) => (
            <section key={sectionIndex} className='overflow-hidden rounded-md border'>
              <div className='flex items-center justify-between border-b bg-muted/25 px-4 py-2'>
                <SkeletonBlock className='h-4 w-20' />
                <SkeletonBlock className='h-3 w-12' />
              </div>
              <table className='w-full table-fixed text-sm'>
                <colgroup>
                  <col className='w-12' />
                  <col />
                  <col className='w-44' />
                  <col className='w-32' />
                  <col className='w-28' />
                  <col className='w-32' />
                  <col className='w-24' />
                </colgroup>
                <thead className='border-b bg-muted/15 text-left text-xs uppercase tracking-wide text-muted-foreground'>
                  <tr>
                    <th className='px-4 py-2' />
                    <th className='px-4 py-2'><SkeletonBlock className='h-3 w-10' /></th>
                    <th className='px-3 py-2'><SkeletonBlock className='h-3 w-12' /></th>
                    <th className='px-3 py-2'><SkeletonBlock className='h-3 w-16' /></th>
                    <th className='px-3 py-2'><SkeletonBlock className='h-3 w-8' /></th>
                    <th className='px-3 py-2'><SkeletonBlock className='h-3 w-12' /></th>
                    <th className='px-3 py-2 text-right'><SkeletonBlock className='ml-auto h-3 w-10' /></th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 2 }, (_, rowIndex) => (
                    <tr key={rowIndex} className='border-b last:border-b-0'>
                      <td className='px-4 py-3'>
                        <SkeletonBlock className='h-5 w-5 rounded-md' />
                      </td>
                      <td className='px-4 py-3'>
                        <SkeletonBlock className='h-4 w-40' />
                      </td>
                      <td className='px-3 py-3'>
                        <SkeletonBlock className='h-4 w-28' />
                      </td>
                      <td className='px-3 py-3'>
                        <div className='flex items-center gap-1.5'>
                          <SkeletonBlock className='h-6 w-6 rounded-full' />
                          <SkeletonBlock className='h-6 w-6 rounded-full' />
                        </div>
                      </td>
                      <td className='px-3 py-3'>
                        <SkeletonBlock className='h-4 w-14' />
                      </td>
                      <td className='px-3 py-3'>
                        <SkeletonBlock className='h-6 w-16 rounded-full' />
                      </td>
                      <td className='px-3 py-3'>
                        <div className='flex justify-end'>
                          <SkeletonBlock className='h-9 w-9 rounded-xl' />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function TaskBoardSkeleton() {
  return (
    <div className='space-y-3'>
      <Card>
        <CardContent className='space-y-3 p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            {Array.from({ length: 3 }, (_, index) => (
              <SkeletonBlock key={index} className='h-8 w-24 rounded-md' />
            ))}
          </div>
          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
            <SkeletonBlock className='h-10 md:col-span-2' />
            <SkeletonBlock className='h-10' />
            <SkeletonBlock className='h-10' />
            <SkeletonBlock className='h-10' />
          </div>
        </CardContent>
      </Card>
      <section className='w-full max-w-full overflow-hidden rounded-lg border bg-muted/10 p-2'>
        <div className='w-full max-w-full overflow-x-auto overscroll-x-contain pb-1'>
          <div className='inline-flex min-w-full gap-3 pr-1'>
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} className='w-[320px] shrink-0'>
                <CardHeader className='pb-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <SkeletonBlock className='h-4 w-24' />
                    <SkeletonBlock className='h-6 w-14' />
                  </div>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {Array.from({ length: 3 }, (_, itemIndex) => (
                    <div key={itemIndex} className='rounded-md border bg-muted/20 p-2.5'>
                      <div className='flex items-start justify-between gap-2'>
                        <div className='flex min-w-0 items-start gap-2'>
                          <SkeletonBlock className='mt-0.5 h-4 w-4 rounded' />
                          <div className='space-y-2'>
                            <SkeletonBlock className='h-4 w-32' />
                            <SkeletonBlock className='h-3 w-20' />
                          </div>
                        </div>
                        <SkeletonBlock className='h-7 w-7 rounded-md' />
                      </div>
                    </div>
                  ))}
                  <SkeletonBlock className='h-9 w-full' />
                </CardContent>
              </Card>
            ))}
            <Card className='w-[320px] shrink-0'>
              <CardHeader className='pb-3'>
                <SkeletonBlock className='h-4 w-24' />
                <SkeletonBlock className='h-3 w-40' />
              </CardHeader>
              <CardContent className='space-y-2'>
                <SkeletonBlock className='h-10 w-full' />
                <SkeletonBlock className='h-9 w-full' />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}

function TaskCalendarSkeleton() {
  return (
    <div className='space-y-3'>
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div className='inline-flex flex-wrap gap-1 rounded-md bg-muted/35 p-1'>
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonBlock key={index} className='h-8 w-20' />
            ))}
          </div>
          <div className='flex items-center gap-1'>
            <SkeletonBlock className='h-8 w-8' />
            <SkeletonBlock className='h-8 w-16' />
            <SkeletonBlock className='h-8 w-8' />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='pb-3'>
          <SkeletonBlock className='h-5 w-36' />
          <SkeletonBlock className='h-4 w-56' />
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-7 gap-2 pb-2'>
            {Array.from({ length: 7 }, (_, index) => (
              <SkeletonBlock key={index} className='mx-auto h-3 w-10' />
            ))}
          </div>
          <div className='grid grid-cols-7 gap-2'>
            {Array.from({ length: 35 }, (_, index) => (
              <div key={index} className='min-h-[90px] rounded-md border bg-card p-1.5'>
                <SkeletonBlock className='mb-2 h-6 w-6 rounded-full' />
                <div className='space-y-1'>
                  <SkeletonBlock className='h-4 w-full rounded-sm' />
                  <SkeletonBlock className='h-4 w-4/5 rounded-sm' />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function MyTasksPage() {
  const { currentUser } = useAuth()
  const [activeTab, setActiveTab] = useState<TaskTab>(() => {
    const storedTab = localStorage.getItem(MY_TASKS_ACTIVE_TAB_KEY)
    return storedTab === 'board' || storedTab === 'calendar' || storedTab === 'notes' || storedTab === 'list' ? storedTab : 'list'
  })
  const [calendarView, setCalendarView] = useState<CalendarView>('monthly')
  const [calendarDate, setCalendarDate] = useState<Date>(() => startOfDay(new Date()))
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [taskRows, setTaskRows] = useState<TaskRow[]>([])
  const [commentsByTaskId, setCommentsByTaskId] = useState<Record<string, BoardComment[]>>({})
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [members, setMembers] = useState<Array<{ id: string; name: string; avatarUrl?: string }>>([])
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [createTaskColumnId, setCreateTaskColumnId] = useState('planned')
  const [realtimeReloadToken, setRealtimeReloadToken] = useState(0)

  const [boardDefinitions, setBoardDefinitions] = useState<BoardDefinition[]>(INITIAL_BOARD_DEFINITIONS)
  const [boardColumns, setBoardColumns] = useState<BoardColumn[]>(() =>
    createBoardColumnsFromTasks([], INITIAL_BOARD_DEFINITIONS, {}),
  )
  const [newColumnName, setNewColumnName] = useState('')
  const [draggingTask, setDraggingTask] = useState<{ taskId: string; fromColumnId: string } | null>(null)

  const [editingTask, setEditingTask] = useState<{ columnId: string; taskId: string } | null>(null)
  const [editingTaskDraft, setEditingTaskDraft] = useState<BoardTaskDraft>({
    title: '',
    projectId: '',
    startDate: '',
    endDate: '',
    assigneeIds: [],
    status: 'Planned',
    priority: 'Low',
    description: '',
    completed: false,
  })

  const [savedBoardView, setSavedBoardView] = useState<BoardSavedView>('all')
  const [boardSearch, setBoardSearch] = useState('')
  const [boardAssigneeFilter, setBoardAssigneeFilter] = useState('all')
  const [boardDueFilter, setBoardDueFilter] = useState<BoardDueFilter>('all')
  const [boardCompletionFilter, setBoardCompletionFilter] = useState<BoardCompletionFilter>('all')

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [bulkMoveTargetColumnId, setBulkMoveTargetColumnId] = useState('')
  const [bulkAssignValue, setBulkAssignValue] = useState('')

  const [activeTaskRef, setActiveTaskRef] = useState<{ columnId: string; taskId: string } | null>(null)
  const [detailDraft, setDetailDraft] = useState<BoardTaskDraft>({
    title: '',
    projectId: '',
    startDate: '',
    endDate: '',
    assigneeIds: [],
    status: 'Planned',
    priority: 'Low',
    description: '',
    completed: false,
  })
  const [commentDraft, setCommentDraft] = useState('')
  const [commentEmojiOpen, setCommentEmojiOpen] = useState(false)
  const [pendingVoiceComment, setPendingVoiceComment] = useState<VoicePayload | null>(null)
  const [isRecordingVoiceComment, setIsRecordingVoiceComment] = useState(false)
  const [voiceCommentError, setVoiceCommentError] = useState<string | null>(null)
  const [replyDraftByCommentId, setReplyDraftByCommentId] = useState<Record<string, string>>({})
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<string | null>(null)
  const [descriptionMentionDraft, setDescriptionMentionDraft] = useState<{ start: number; end: number; query: string } | null>(null)
  const [descriptionMentionActiveIndex, setDescriptionMentionActiveIndex] = useState(0)
  const [detailAssigneeOpen, setDetailAssigneeOpen] = useState(false)
  const [detailAssigneeSearch, setDetailAssigneeSearch] = useState('')
  const [detailSaveState, setDetailSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const detailDescriptionDebounceRef = useRef<number | null>(null)
  const detailSavedFlashRef = useRef<number | null>(null)
  const detailLastPersistedRef = useRef('')
  const commentMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const commentVoiceChunksRef = useRef<BlobPart[]>([])
  const commentVoiceStartAtRef = useRef(0)
  const [listSearch, setListSearch] = useState('')
  const [listScopeFilter, setListScopeFilter] = useState<ListScopeFilter>('all')
  const [listCompletionFilter, setListCompletionFilter] = useState<ListCompletionFilter>('all')
  const [listStatusFilter, setListStatusFilter] = useState<ListStatusFilter>('all')
  const [listProjectFilter, setListProjectFilter] = useState('all')
  const clearPendingVoiceComment = useCallback(() => {
    setPendingVoiceComment((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }, [])

  const weekStart = useMemo(() => getWeekStart(calendarDate), [calendarDate])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  const monthDays = useMemo(() => {
    const start = getMonthGridStart(calendarDate)
    return Array.from({ length: 42 }, (_, index) => addDays(start, index))
  }, [calendarDate])

  const yearMonths = useMemo(
    () => Array.from({ length: 12 }, (_, index) => new Date(calendarDate.getFullYear(), index, 1)),
    [calendarDate],
  )

  useEffect(() => {
    const onRealtimeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail
      const table = detail?.table
      if (!table) return
      if (!['tasks', 'projects', 'task_assignees', 'task_comments', 'boards', 'notifications'].includes(table)) return
      setRealtimeReloadToken((value) => value + 1)
    }

    window.addEventListener('contas:realtime-change', onRealtimeChange as EventListener)
    return () => {
      window.removeEventListener('contas:realtime-change', onRealtimeChange as EventListener)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingTasks(true)

    void Promise.all([
      fetchBoardDefinitions(),
      supabase
        .from('tasks')
        .select('id, title, description, status, priority, board_column, project_id, assigned_to, created_by, due_at, start_at, completed_at, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('task_assignees').select('task_id, assignee_id'),
      supabase
        .from('task_comments')
        .select('id, task_id, author_id, content, created_at, parent_comment_id')
        .order('created_at', { ascending: false }),
      supabase.from('task_comment_reactions').select('comment_id, user_id, reaction'),
      supabase.from('projects').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name', { ascending: true }),
    ]).then(
      async ([
        fetchedBoards,
        tasksResult,
        taskAssigneesResult,
        taskCommentsResult,
        taskCommentReactionsResult,
        projectsResult,
        profilesResult,
      ]) => {
      if (cancelled) return

      const projects = (projectsResult.data ?? []).map((project) => ({ id: project.id, name: project.name ?? 'Untitled project' }))
      const members = await Promise.all(
        (profilesResult.data ?? []).map(async (profile) => {
          const rawAvatar = profile.avatar_url ?? undefined
          if (!rawAvatar) {
            return {
              id: profile.id,
              name: profile.full_name ?? profile.email ?? 'Unknown member',
              avatarUrl: undefined,
            }
          }

          if (isDirectAvatarUrl(rawAvatar)) {
            return {
              id: profile.id,
              name: profile.full_name ?? profile.email ?? 'Unknown member',
              avatarUrl: rawAvatar,
            }
          }

          try {
            const resolvedUrl = await resolveAvatarUrl(rawAvatar)
            return {
              id: profile.id,
              name: profile.full_name ?? profile.email ?? 'Unknown member',
              avatarUrl: resolvedUrl,
            }
          } catch {
            return {
              id: profile.id,
              name: profile.full_name ?? profile.email ?? 'Unknown member',
              avatarUrl: undefined,
            }
          }
        }),
      )
      setProjects(projects)
      setMembers(members)

      if (tasksResult.error || !tasksResult.data) {
        setLoadingTasks(false)
        return
      }

      setBoardDefinitions(fetchedBoards)

      const projectMap = new Map(projects.map((project) => [project.id, project.name]))
      const memberMap = new Map(members.map((member) => [member.id, member.name]))
      const avatarMap = new Map(members.map((member) => [member.id, member.avatarUrl]))
      const assigneeIdsByTaskId = new Map<string, string[]>()
      if (!taskAssigneesResult.error && taskAssigneesResult.data) {
        for (const row of taskAssigneesResult.data) {
          const list = assigneeIdsByTaskId.get(row.task_id) ?? []
          list.push(row.assignee_id)
          assigneeIdsByTaskId.set(row.task_id, list)
        }
      }
      const commentsByTask = new Map<string, BoardComment[]>()
      const likeCountByCommentId = new Map<string, number>()
      const likedByMeCommentIds = new Set<string>()
      if (!taskCommentReactionsResult.error && taskCommentReactionsResult.data) {
        for (const row of taskCommentReactionsResult.data) {
          if (row.reaction !== 'like') continue
          likeCountByCommentId.set(row.comment_id, (likeCountByCommentId.get(row.comment_id) ?? 0) + 1)
          if (row.user_id === currentUser?.id) {
            likedByMeCommentIds.add(row.comment_id)
          }
        }
      }
      if (!taskCommentsResult.error && taskCommentsResult.data) {
        const parsedCommentContentById = new Map<
          string,
          { text: string; voiceDataUrl?: string; voiceDurationMs?: number; voiceStorageKey?: string }
        >()
        await Promise.all(
          taskCommentsResult.data.map(async (row) => {
            const parsedContent = parseCommentContent(row.content)
            let resolvedVoiceUrl = parsedContent.voiceDataUrl

            if (parsedContent.voiceStorageKey) {
              try {
                resolvedVoiceUrl = await resolveR2ObjectUrl(parsedContent.voiceStorageKey)
              } catch {
                resolvedVoiceUrl = parsedContent.voiceDataUrl
              }
            }

            parsedCommentContentById.set(row.id, {
              text: parsedContent.text,
              voiceDataUrl: resolvedVoiceUrl,
              voiceDurationMs: parsedContent.voiceDurationMs,
              voiceStorageKey: parsedContent.voiceStorageKey,
            })
          }),
        )

        const rootsById = new Map<string, BoardComment>()
        for (const row of taskCommentsResult.data) {
          if (row.parent_comment_id) continue
          const taskComments = commentsByTask.get(row.task_id) ?? []
          const authorName = row.author_id ? memberMap.get(row.author_id) : undefined
          const parsedContent = parsedCommentContentById.get(row.id) ?? parseCommentContent(row.content)
          const root: BoardComment = {
            id: row.id,
            authorId: row.author_id ?? '',
            author: authorName ?? BOARD_ME_ASSIGNEE,
            authorAvatarUrl: row.author_id ? avatarMap.get(row.author_id) : undefined,
            content: parsedContent.text,
            voiceDataUrl: parsedContent.voiceDataUrl,
            voiceDurationMs: parsedContent.voiceDurationMs,
            createdAt: dateTimeLabel(row.created_at),
            likes: likeCountByCommentId.get(row.id) ?? 0,
            likedByMe: likedByMeCommentIds.has(row.id),
            replies: [],
          }
          taskComments.push(root)
          commentsByTask.set(row.task_id, taskComments)
          rootsById.set(row.id, root)
        }
        for (const row of taskCommentsResult.data) {
          if (!row.parent_comment_id) continue
          const parent = rootsById.get(row.parent_comment_id)
          if (!parent) continue
          const authorName = row.author_id ? memberMap.get(row.author_id) : undefined
          const parsedContent = parsedCommentContentById.get(row.id) ?? parseCommentContent(row.content)
          parent.replies.push({
            id: row.id,
            authorId: row.author_id ?? '',
            author: authorName ?? BOARD_ME_ASSIGNEE,
            authorAvatarUrl: row.author_id ? avatarMap.get(row.author_id) : undefined,
            content: parsedContent.text,
            createdAt: dateTimeLabel(row.created_at),
          })
        }
      }
      setCommentsByTaskId(Object.fromEntries(commentsByTask.entries()))

      setTaskRows(
        tasksResult.data.map((task) => {
          const baseDate = task.start_at ?? task.due_at ?? task.created_at ?? new Date().toISOString()
          const startDate = new Date(baseDate)
          const endDate = task.due_at ? new Date(task.due_at) : startDate
          const assigneeIds = assigneeIdsByTaskId.get(task.id) ?? (task.assigned_to ? [task.assigned_to] : [])
          const assigneeNames = assigneeIds.map((id) => memberMap.get(id)).filter((name): name is string => Boolean(name))

          return {
            id: task.id,
            title: task.title,
            description: task.description ?? `${projectMap.get(task.project_id ?? '') ?? 'Unassigned project'} task`,
            createdById: task.created_by ?? '',
            owner: assigneeNames.length > 0 ? assigneeNames.join(', ') : 'Unassigned',
            assigneeIds,
            due: formatTaskDueLabel(task.due_at),
            completed: Boolean(task.completed_at),
            status: mapTaskStatus(task.status),
            priority: mapTaskPriority(task.priority),
            boardColumn: task.board_column ?? undefined,
            projectId: task.project_id ?? '',
            projectName: projectMap.get(task.project_id ?? '') ?? 'Unassigned project',
            startDate: startDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10),
          }
        }),
      )
      setLoadingTasks(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [currentUser?.id, realtimeReloadToken])

  useEffect(() => {
    setBoardColumns(createBoardColumnsFromTasks(taskRows, boardDefinitions, commentsByTaskId))
  }, [taskRows, boardDefinitions, commentsByTaskId])

  useEffect(() => {
    localStorage.setItem(MY_TASKS_ACTIVE_TAB_KEY, activeTab)
  }, [activeTab])

  const dailyTasks = useMemo(() => taskRows.filter((task) => spansDate(task, calendarDate)), [calendarDate, taskRows])

  const weeklyTasks = useMemo(
    () => taskRows.filter((task) => intersectsRange(task, weekStart, weekEnd)),
    [taskRows, weekStart, weekEnd],
  )

  const selectedTaskSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])
  const holdSelectTimerRef = useRef<number | null>(null)
  const holdSelectedTaskIdRef = useRef<string | null>(null)

  const allAssignees = useMemo(
    () =>
      Array.from(
        new Set(
          boardColumns
            .flatMap((column) => column.items)
            .map((task) => task.assignee)
            .filter(Boolean),
        ),
      ).sort(),
    [boardColumns],
  )
  const totalTasksCount = useMemo(
    () => boardColumns.reduce((count, column) => count + column.items.length, 0),
    [boardColumns],
  )

  const boardMatchesFilters = useCallback((task: BoardTask) => {
    const query = boardSearch.trim().toLowerCase()
    if (query) {
      const haystack = `${task.title} ${task.assignee} ${task.due} ${task.description}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }

    if (savedBoardView === 'my-open' && (task.assignee !== BOARD_ME_ASSIGNEE || task.completed)) return false

    if (savedBoardView === 'due-soon') {
      const dueDate = parseBoardDueDate(task.due)
      const today = startOfDay(new Date())
      const inSevenDays = addDays(today, 7)
      if (task.completed || !dueDate || dueDate < today || dueDate > inSevenDays) return false
    }

    if (boardAssigneeFilter !== 'all' && task.assignee !== boardAssigneeFilter) return false

    if (boardCompletionFilter === 'open' && task.completed) return false
    if (boardCompletionFilter === 'completed' && !task.completed) return false

    if (boardDueFilter !== 'all') {
      const dueDate = parseBoardDueDate(task.due)
      const today = startOfDay(new Date())

      if (boardDueFilter === 'none' && dueDate !== null) return false
      if (boardDueFilter === 'today' && (!dueDate || !isSameDay(dueDate, today))) return false
      if (boardDueFilter === 'upcoming' && (!dueDate || dueDate <= today)) return false
      if (boardDueFilter === 'overdue' && (!dueDate || dueDate >= today || task.completed)) return false
    }

    return true
  }, [boardAssigneeFilter, boardCompletionFilter, boardDueFilter, boardSearch, savedBoardView])

  const visibleBoardColumns = useMemo(
    () =>
      boardColumns.map((column) => ({
        ...column,
        items: column.items.filter(boardMatchesFilters),
      })),
    [boardColumns, boardMatchesFilters],
  )

  const selectedTasksCount = selectedTaskIds.length

  const listFilteredTasks = useMemo(() => {
    const currentUserId = currentUser?.id ?? ''
    const today = startOfDay(new Date())
    const dueSoonLimit = addDays(today, 7)
    const query = listSearch.trim().toLowerCase()

    return taskRows.filter((task) => {
      if (query) {
        const haystack = `${task.title} ${task.projectName} ${task.owner} ${task.description ?? ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }

      if (listProjectFilter !== 'all' && task.projectId !== listProjectFilter) return false
      if (listStatusFilter !== 'all' && task.status !== listStatusFilter) return false
      if (listCompletionFilter === 'open' && task.completed) return false
      if (listCompletionFilter === 'completed' && !task.completed) return false

      if (listScopeFilter === 'assigned_to_me' && (!currentUserId || !task.assigneeIds.includes(currentUserId))) return false
      if (listScopeFilter === 'created_by_me' && (!currentUserId || task.createdById !== currentUserId)) return false
      if (listScopeFilter === 'due_soon') {
        const dueDate = task.endDate ? parseDate(task.endDate) : null
        if (!dueDate || dueDate < today || dueDate > dueSoonLimit || task.completed) return false
      }
      if (listScopeFilter === 'overdue') {
        const dueDate = task.endDate ? parseDate(task.endDate) : null
        if (!dueDate || dueDate >= today || task.completed) return false
      }

      return true
    })
  }, [currentUser?.id, listCompletionFilter, listProjectFilter, listScopeFilter, listSearch, listStatusFilter, taskRows])

  const listSections = useMemo(() => {
    const definitions = (boardDefinitions.length > 0 ? boardDefinitions : INITIAL_BOARD_DEFINITIONS)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const sections = definitions.map((definition) => ({
      id: definition.id,
      title: definition.title,
      tasks: [] as TaskRow[],
    }))
    const sectionById = new Map(sections.map((section) => [section.id, section]))

    listFilteredTasks.forEach((task) => {
      const columnId = boardColumnIdFromTask(task)
      let section = sectionById.get(columnId)
      if (!section) {
        section = {
          id: columnId,
          title: fallbackBoardTitle(columnId),
          tasks: [],
        }
        sections.push(section)
        sectionById.set(columnId, section)
      }
      section.tasks.push(task)
    })

    return sections
  }, [listFilteredTasks, boardDefinitions])

  const canEditTaskById = useCallback(
    (taskId: string) => {
      const task = taskRows.find((item) => item.id === taskId)
      if (!task) return false
      return Boolean(currentUser?.id && task.createdById === currentUser.id)
    },
    [currentUser?.id, taskRows],
  )

  const openTaskDetailsById = (taskId: string) => {
    for (const column of boardColumns) {
      const task = column.items.find((item) => item.id === taskId)
      if (task) {
        openTaskDetails(column.id, task)
        return
      }
    }
  }

  const handleTaskDialogOpenChange = (open: boolean) => {
    setTaskDialogOpen(open)
    if (!open) setCreateTaskColumnId('planned')
  }

  const openTaskDialogForColumn = (columnId: string) => {
    setCreateTaskColumnId(columnId)
    setTaskDialogOpen(true)
  }

  const handleTaskCreated = (task: CreatedTaskPayload) => {
    const startDate = new Date(task.startAt)
    const endDate = task.dueAt ? new Date(task.dueAt) : startDate

    setTaskRows((rows) => [
      {
        id: task.id,
        title: task.title,
        description: task.description,
        createdById: task.createdById ?? currentUser?.id ?? '',
        owner: task.assigneeName,
        assigneeIds: task.assigneeIds,
        due: formatTaskDueLabel(task.dueAt),
        completed: false,
        status: mapTaskStatus(task.status),
        priority: mapTaskPriority(task.priority),
        boardColumn: task.boardColumn ?? 'planned',
        projectId: task.projectId,
        projectName: task.projectName,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
      },
      ...rows,
    ])
  }

  const moveCalendar = (direction: 'prev' | 'next') => {
    const factor = direction === 'prev' ? -1 : 1

    if (calendarView === 'daily') {
      setCalendarDate((date) => addDays(date, factor))
      return
    }
    if (calendarView === 'weekly') {
      setCalendarDate((date) => addDays(date, factor * 7))
      return
    }
    if (calendarView === 'monthly') {
      setCalendarDate((date) => addMonths(date, factor))
      return
    }
    setCalendarDate((date) => addYears(date, factor))
  }

  useEffect(() => () => {
    if (detailDescriptionDebounceRef.current !== null) {
      window.clearTimeout(detailDescriptionDebounceRef.current)
    }
    if (detailSavedFlashRef.current !== null) {
      window.clearTimeout(detailSavedFlashRef.current)
    }
  }, [])

  useEffect(() => {
    const validIds = new Set(boardColumns.flatMap((column) => column.items.map((item) => item.id)))
    setSelectedTaskIds((ids) => ids.filter((id) => validIds.has(id)))
  }, [boardColumns])

  useEffect(() => {
    if (!bulkMoveTargetColumnId && boardColumns[0]) {
      setBulkMoveTargetColumnId(boardColumns[0].id)
      return
    }
    if (bulkMoveTargetColumnId && !boardColumns.some((column) => column.id === bulkMoveTargetColumnId)) {
      setBulkMoveTargetColumnId(boardColumns[0]?.id ?? '')
    }
  }, [boardColumns, bulkMoveTargetColumnId])

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((ids) => (ids.includes(taskId) ? ids.filter((id) => id !== taskId) : [...ids, taskId]))
  }

  const clearHoldTimer = () => {
    if (holdSelectTimerRef.current !== null) {
      window.clearTimeout(holdSelectTimerRef.current)
      holdSelectTimerRef.current = null
    }
  }

  const beginHoldSelect = (taskId: string) => {
    clearHoldTimer()
    holdSelectedTaskIdRef.current = null
    holdSelectTimerRef.current = window.setTimeout(() => {
      toggleTaskSelection(taskId)
      holdSelectedTaskIdRef.current = taskId
      holdSelectTimerRef.current = null
    }, 320)
  }

  const endHoldSelect = () => {
    clearHoldTimer()
  }

  const shouldIgnoreHoldTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest('[data-no-hold="true"]'))

  const clearSelection = () => {
    setSelectedTaskIds([])
  }

  const selectVisibleTasksInColumn = (columnId: string) => {
    const column = visibleBoardColumns.find((item) => item.id === columnId)
    if (!column) return

    setSelectedTaskIds((ids) => {
      const next = new Set(ids)
      const allSelected = column.items.every((item) => next.has(item.id))

      for (const item of column.items) {
        if (allSelected) {
          next.delete(item.id)
        } else {
          next.add(item.id)
        }
      }

      return Array.from(next)
    })
  }

  const updateSelectedTasks = (updater: (task: BoardTask) => BoardTask) => {
    setBoardColumns((columns) =>
      columns.map((column) => ({
        ...column,
        items: column.items.map((item) => (selectedTaskSet.has(item.id) ? updater(item) : item)),
      })),
    )
  }

  const markSelectedCompleted = async () => {
    if (selectedTaskSet.size === 0) return
    const selectedIds = Array.from(selectedTaskSet).filter((taskId) => canEditTaskById(taskId))
    if (selectedIds.length === 0) return
    const selectedEditableSet = new Set(selectedIds)
    const previousRows = taskRows
    const completedAt = new Date().toISOString()
    setTaskRows((rows) => rows.map((task) => (selectedEditableSet.has(task.id) ? { ...task, completed: true } : task)))
    const { error } = await supabase.from('tasks').update({ completed_at: completedAt }).in('id', selectedIds)
    if (error) {
      console.error('Failed to mark selected tasks complete', error)
      setTaskRows(previousRows)
      return
    }
    clearSelection()
  }

  const assignSelectedTasks = () => {
    const assignee = bulkAssignValue.trim()
    if (!assignee || selectedTaskSet.size === 0) return

    updateSelectedTasks((task) => ({
      ...task,
      assignee,
      activity: [makeActivity(`Assigned to ${assignee} from bulk action`), ...task.activity],
    }))
    setBulkAssignValue('')
  }

  const moveSelectedTasks = async () => {
    if (!bulkMoveTargetColumnId || selectedTaskSet.size === 0) return
    const selectedIds = Array.from(selectedTaskSet).filter((taskId) => canEditTaskById(taskId))
    if (selectedIds.length === 0) return
    const selectedEditableSet = new Set(selectedIds)
    const previousRows = taskRows
    setTaskRows((rows) =>
      rows.map((task) =>
        selectedEditableSet.has(task.id)
          ? { ...task, status: nextTaskStatusForBoardMove(bulkMoveTargetColumnId, task.status), boardColumn: bulkMoveTargetColumnId }
          : task,
      ),
    )
    const { error } = isStatusBackedBoardColumn(bulkMoveTargetColumnId)
      ? await supabase
          .from('tasks')
          .update({ status: mapColumnIdToTaskStatus(bulkMoveTargetColumnId) === 'Planned' ? 'planned' : bulkMoveTargetColumnId, board_column: bulkMoveTargetColumnId })
          .in('id', selectedIds)
      : await supabase.from('tasks').update({ board_column: bulkMoveTargetColumnId }).in('id', selectedIds)
    if (error) {
      console.error('Failed to move selected tasks', error)
      setTaskRows(previousRows)
      return
    }

    clearSelection()
  }

  const applySavedView = (view: BoardSavedView) => {
    setSavedBoardView(view)
    if (view === 'all') {
      setBoardAssigneeFilter('all')
      setBoardDueFilter('all')
      setBoardCompletionFilter('all')
      return
    }
    if (view === 'my-open') {
      setBoardAssigneeFilter(BOARD_ME_ASSIGNEE)
      setBoardDueFilter('all')
      setBoardCompletionFilter('open')
      return
    }
    setBoardAssigneeFilter('all')
    setBoardDueFilter('upcoming')
    setBoardCompletionFilter('open')
  }

  const handleBoardDragStart = (taskId: string, fromColumnId: string) => {
    setDraggingTask({ taskId, fromColumnId })
  }

  const handleBoardDrop = async (toColumnId: string) => {
    if (!draggingTask) return
    if (draggingTask.fromColumnId === toColumnId) {
      setDraggingTask(null)
      return
    }

    const taskId = draggingTask.taskId
    if (!canEditTaskById(taskId)) {
      setDraggingTask(null)
      return
    }
    const previousRows = taskRows
    const currentTask = taskRows.find((task) => task.id === taskId)
    if (!currentTask) {
      setDraggingTask(null)
      return
    }
    setTaskRows((rows) =>
      rows.map((task) =>
        task.id === taskId ? { ...task, status: nextTaskStatusForBoardMove(toColumnId, task.status), boardColumn: toColumnId } : task,
      ),
    )
    setDraggingTask(null)

    const { error } = isStatusBackedBoardColumn(toColumnId)
      ? await supabase
          .from('tasks')
          .update({ status: mapTaskStatusToDatabaseStatus(nextTaskStatusForBoardMove(toColumnId, currentTask.status)), board_column: toColumnId })
          .eq('id', taskId)
      : await supabase.from('tasks').update({ board_column: toColumnId }).eq('id', taskId)
    if (error) {
      console.error('Failed to move task on board', error)
      setTaskRows(previousRows)
    }
  }

  const handleAddBoardColumn = async () => {
    const trimmedName = newColumnName.trim()
    if (!trimmedName) return
    const newBoard = {
      id: createBoardId(trimmedName),
      name: trimmedName,
      sort_order: boardDefinitions.length,
      is_default: false,
      created_by: currentUser?.id ?? null,
    }
    const previousDefinitions = boardDefinitions
    setBoardDefinitions((definitions) => [
      ...definitions,
      { id: newBoard.id, title: newBoard.name, sortOrder: newBoard.sort_order, isDefault: false },
    ])
    setNewColumnName('')
    const { error } = await supabase.from('boards').insert(newBoard)
    if (error) {
      console.error('Failed to create board column', error)
      setBoardDefinitions(previousDefinitions)
    }
  }

  const handleDeleteBoardColumn = async (columnId: string) => {
    const column = boardDefinitions.find((item) => item.id === columnId)
    if (!column || column.isDefault) return

    const previousDefinitions = boardDefinitions
    const previousRows = taskRows

    setBoardDefinitions((definitions) => definitions.filter((item) => item.id !== columnId))
    setTaskRows((rows) =>
      rows.map((task) =>
        task.boardColumn === columnId
          ? { ...task, boardColumn: 'planned', status: 'Planned' }
          : task,
      ),
    )

    const { error: moveError } = await supabase
      .from('tasks')
      .update({ board_column: 'planned', status: 'planned' })
      .eq('board_column', columnId)

    if (moveError) {
      console.error('Failed to reassign tasks before deleting board column', moveError)
      setBoardDefinitions(previousDefinitions)
      setTaskRows(previousRows)
      return
    }

    const { error: deleteError } = await supabase.from('boards').delete().eq('id', columnId)

    if (deleteError) {
      console.error('Failed to delete board column', deleteError)
      setBoardDefinitions(previousDefinitions)
      setTaskRows(previousRows)
    }
  }

  const toggleBoardTaskCompleted = async (taskId: string) => {
    if (!canEditTaskById(taskId)) return
    const nextCompleted = !(taskRows.find((task) => task.id === taskId)?.completed ?? false)
    const previousRows = taskRows
    setTaskRows((rows) => rows.map((task) => (task.id === taskId ? { ...task, completed: nextCompleted } : task)))
    const { error } = await supabase
      .from('tasks')
      .update({ completed_at: nextCompleted ? new Date().toISOString() : null })
      .eq('id', taskId)
    if (error) {
      console.error('Failed to update task completion', error)
      setTaskRows(previousRows)
    }
  }

  const resetTaskDraft = () => ({
    title: '',
    projectId: '',
    startDate: '',
    endDate: '',
    assigneeIds: [],
    status: 'Planned' as TaskRow['status'],
    priority: 'Low' as TaskRow['priority'],
    description: '',
    completed: false,
  })

  const persistTaskDraft = async (taskId: string, draft: BoardTaskDraft) => {
    const existingTask = taskRows.find((task) => task.id === taskId)
    if (!existingTask) return { ok: false as const, nextBoardColumn: '' }
    if (!currentUser?.id || existingTask.createdById !== currentUser.id) return { ok: false as const, nextBoardColumn: '' }

    const title = draft.title.trim()
    if (!title) return { ok: false as const, nextBoardColumn: '' }

    const normalizedSchedule = normalizeTaskScheduleDates(
      draft.startDate,
      draft.endDate,
      existingTask.startDate,
      existingTask.endDate,
    )
    if (!normalizedSchedule.valid) return { ok: false as const, nextBoardColumn: '' }

    const nextAssigneeIds = draft.assigneeIds
    const previousAssigneeIds = existingTask.assigneeIds
    const nextAssigneeNames = nextAssigneeIds
      .map((id) => members.find((member) => member.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    const nextAssignee = nextAssigneeNames.length > 0 ? nextAssigneeNames.join(', ') : 'Unassigned'
    const nextDescription = draft.description.trim() || 'No description yet.'
    const nextProject = projects.find((project) => project.id === draft.projectId)
    const defaultStatusColumn = boardColumnIdFromStatus(draft.status)
    const nextBoardColumn =
      existingTask.boardColumn && !isStatusBackedBoardColumn(existingTask.boardColumn)
        ? existingTask.boardColumn
        : defaultStatusColumn
    const startAtIso = `${normalizedSchedule.startDate}T00:00:00.000Z`
    const dueAtIso = `${normalizedSchedule.endDate}T00:00:00.000Z`
    const previousRows = taskRows

    setTaskRows((rows) =>
      rows.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title,
              projectId: draft.projectId,
              projectName: nextProject?.name ?? 'Unassigned project',
              due: formatTaskDueLabel(dueAtIso),
              owner: nextAssignee,
              assigneeIds: nextAssigneeIds,
              status: draft.status,
              priority: draft.priority,
              boardColumn: nextBoardColumn,
              description: nextDescription,
              startDate: normalizedSchedule.startDate,
              endDate: normalizedSchedule.endDate,
              completed: draft.completed,
            }
          : task,
      ),
    )

    const { error } = await supabase
      .from('tasks')
      .update({
        title,
        description: nextDescription,
        status: mapTaskStatusToDatabaseStatus(draft.status),
        priority: mapTaskPriorityToDatabasePriority(draft.priority),
        board_column: nextBoardColumn,
        project_id: draft.projectId || null,
        start_at: startAtIso,
        due_at: dueAtIso,
        assigned_to: nextAssigneeIds[0] ?? null,
        completed_at: draft.completed ? new Date().toISOString() : null,
      })
      .eq('id', taskId)

    if (error) {
      console.error('Failed to save task details', error)
      setTaskRows(previousRows)
      return { ok: false as const, nextBoardColumn: '' }
    }

    const { error: clearError } = await supabase.from('task_assignees').delete().eq('task_id', taskId)
    if (clearError) {
      console.error('Failed to clear task assignees', clearError)
      setTaskRows(previousRows)
      return { ok: false as const, nextBoardColumn: '' }
    }

    if (nextAssigneeIds.length > 0) {
      const { error: insertError } = await supabase
        .from('task_assignees')
        .insert(nextAssigneeIds.map((assigneeId) => ({ task_id: taskId, assignee_id: assigneeId })))
      if (insertError) {
        console.error('Failed to save task assignees', insertError)
        setTaskRows(previousRows)
        return { ok: false as const, nextBoardColumn: '' }
      }
    }

    if (currentUser?.id) {
      const addedAssigneeIds = nextAssigneeIds.filter(
        (assigneeId) => !previousAssigneeIds.includes(assigneeId) && assigneeId !== currentUser.id,
      )
      if (addedAssigneeIds.length > 0) {
        const notifications = addedAssigneeIds.map((recipientId) => ({
          recipient_id: recipientId,
          actor_id: currentUser.id,
          task_id: taskId,
          type: 'task' as const,
          title: 'Task assigned to you',
          message: `You were assigned "${title}".`,
          metadata: { event: 'task_assigned', source: 'task_edit' },
        }))
        const { error: notificationsError } = await supabase.from('notifications').insert(notifications)
        if (notificationsError) {
          console.error('Failed to create assignment notifications', notificationsError)
        }
      }
    }

    return { ok: true as const, nextBoardColumn }
  }

  const startEditingBoardTask = (columnId: string, task: BoardTask) => {
    if (!canEditTaskById(task.id)) return
    setEditingTask({ columnId, taskId: task.id })
    const taskRow = taskRows.find((item) => item.id === task.id)
    setEditingTaskDraft({
      title: task.title,
      projectId: taskRow?.projectId ?? '',
      startDate: taskRow?.startDate ?? '',
      endDate: taskRow?.endDate ?? '',
      assigneeIds: taskRow?.assigneeIds ?? [],
      status: taskRow?.status ?? 'Planned',
      priority: taskRow?.priority ?? 'Low',
      description: task.description,
      completed: taskRow?.completed ?? false,
    })
  }

  const saveEditingBoardTask = async () => {
    if (!editingTask) return
    const result = await persistTaskDraft(editingTask.taskId, editingTaskDraft)
    if (!result.ok) return

    setEditingTask(null)
    setEditingTaskDraft(resetTaskDraft())
  }

  const cancelEditingBoardTask = () => {
    setEditingTask(null)
    setEditingTaskDraft(resetTaskDraft())
  }

  const openTaskDetails = (columnId: string, task: BoardTask) => {
    const taskRow = taskRows.find((item) => item.id === task.id)
    setActiveTaskRef({ columnId, taskId: task.id })
    setDetailDraft({
      title: task.title,
      projectId: taskRow?.projectId ?? '',
      startDate: taskRow?.startDate ?? '',
      endDate: taskRow?.endDate ?? '',
      assigneeIds: taskRow?.assigneeIds ?? [],
      status: taskRow?.status ?? 'Planned',
      priority: taskRow?.priority ?? 'Low',
      description: task.description,
      completed: taskRow?.completed ?? false,
    })
    setCommentDraft('')
    setDetailAssigneeOpen(false)
    setDetailAssigneeSearch('')
    const nextDraft: BoardTaskDraft = {
      title: task.title,
      projectId: taskRow?.projectId ?? '',
      startDate: taskRow?.startDate ?? '',
      endDate: taskRow?.endDate ?? '',
      assigneeIds: taskRow?.assigneeIds ?? [],
      status: taskRow?.status ?? 'Planned',
      priority: taskRow?.priority ?? 'Low',
      description: task.description,
      completed: taskRow?.completed ?? false,
    }
    detailLastPersistedRef.current = serializeDetailDraft(nextDraft)
    setDetailSaveState('idle')
    clearDetailSaveTimers()
  }

  const closeTaskDetails = () => {
    setActiveTaskRef(null)
    setCommentDraft('')
    setDetailAssigneeOpen(false)
    setDetailAssigneeSearch('')
    setDetailSaveState('idle')
    clearDetailSaveTimers()
  }

  const activeTaskData = useMemo(() => {
    if (!activeTaskRef) return null
    const column = boardColumns.find((item) => item.id === activeTaskRef.columnId)
    if (!column) return null
    const task = column.items.find((item) => item.id === activeTaskRef.taskId)
    if (!task) return null
    return { column, task }
  }, [activeTaskRef, boardColumns])
  const activeTaskRow = useMemo(() => {
    const taskId = activeTaskData?.task.id
    if (!taskId) return null
    return taskRows.find((task) => task.id === taskId) ?? null
  }, [activeTaskData?.task.id, taskRows])
  const canEditActiveTask = Boolean(currentUser?.id && activeTaskRow?.createdById === currentUser.id)
  const activeCommentAuthor = useMemo(() => {
    const member = members.find((item) => item.id === currentUser?.id)
    return {
      id: currentUser?.id ?? '',
      name: member?.name ?? BOARD_ME_ASSIGNEE,
      avatarUrl: member?.avatarUrl,
    }
  }, [currentUser?.id, members])

  const detailTeammateOptions = useMemo(
    () => members.filter((member) => member.id !== currentUser?.id),
    [currentUser?.id, members],
  )
  const filteredDetailTeammates = useMemo(() => {
    const query = detailAssigneeSearch.trim().toLowerCase()
    if (!query) return detailTeammateOptions
    return detailTeammateOptions.filter((member) => member.name.toLowerCase().includes(query))
  }, [detailAssigneeSearch, detailTeammateOptions])
  const descriptionMentionOptions = useMemo(() => {
    if (!descriptionMentionDraft) return []
    const query = descriptionMentionDraft.query.trim().toLowerCase()
    const candidates = query
      ? detailTeammateOptions.filter((member) => member.name.toLowerCase().includes(query))
      : detailTeammateOptions
    return candidates.slice(0, 6)
  }, [descriptionMentionDraft, detailTeammateOptions])

  useEffect(() => {
    setReplyDraftByCommentId({})
    setActiveReplyCommentId(null)
    setCommentDraft('')
    clearPendingVoiceComment()
    setVoiceCommentError(null)
    setCommentEmojiOpen(false)
    const recorder = commentMediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [activeTaskRef?.taskId, clearPendingVoiceComment])
  useEffect(() => {
    setDescriptionMentionDraft(null)
    setDescriptionMentionActiveIndex(0)
  }, [activeTaskRef?.taskId])
  useEffect(() => {
    setDescriptionMentionActiveIndex(0)
  }, [descriptionMentionDraft?.query])
  useEffect(() => {
    return () => {
      clearPendingVoiceComment()
      const recorder = commentMediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    }
  }, [clearPendingVoiceComment])

  const serializeDetailDraft = (draft: BoardTaskDraft) =>
    JSON.stringify({
      ...draft,
      assigneeIds: [...draft.assigneeIds].sort(),
    })

  const clearDetailSaveTimers = () => {
    if (detailDescriptionDebounceRef.current !== null) {
      window.clearTimeout(detailDescriptionDebounceRef.current)
      detailDescriptionDebounceRef.current = null
    }
    if (detailSavedFlashRef.current !== null) {
      window.clearTimeout(detailSavedFlashRef.current)
      detailSavedFlashRef.current = null
    }
  }

  const saveDetailTask = async (draft = detailDraft) => {
    if (!activeTaskRef) return
    if (!canEditActiveTask) return
    const nextSerialized = serializeDetailDraft(draft)
    if (nextSerialized === detailLastPersistedRef.current) {
      return
    }

    setDetailSaveState('saving')
    const result = await persistTaskDraft(activeTaskRef.taskId, draft)
    if (!result.ok) {
      setDetailSaveState('error')
      return
    }

    detailLastPersistedRef.current = nextSerialized
    setActiveTaskRef({ columnId: result.nextBoardColumn, taskId: activeTaskRef.taskId })
    setDetailSaveState('saved')
    if (detailSavedFlashRef.current !== null) {
      window.clearTimeout(detailSavedFlashRef.current)
    }
    detailSavedFlashRef.current = window.setTimeout(() => {
      setDetailSaveState('idle')
      detailSavedFlashRef.current = null
    }, 1200)
  }

  const triggerDetailAutosave = () => {
    clearDetailSaveTimers()
    void saveDetailTask()
  }

  const triggerDetailAutosaveWithDraft = (nextDraft: BoardTaskDraft) => {
    clearDetailSaveTimers()
    void saveDetailTask(nextDraft)
  }

  const triggerDebouncedDescriptionAutosave = (nextDraft: BoardTaskDraft) => {
    if (detailDescriptionDebounceRef.current !== null) {
      window.clearTimeout(detailDescriptionDebounceRef.current)
    }
    detailDescriptionDebounceRef.current = window.setTimeout(() => {
      void saveDetailTask(nextDraft)
      detailDescriptionDebounceRef.current = null
    }, 650)
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!canEditTaskById(taskId)) return
    const previousRows = taskRows
    setTaskRows((rows) => rows.filter((task) => task.id !== taskId))
    setSelectedTaskIds((ids) => ids.filter((id) => id !== taskId))

    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) {
      console.error('Failed to delete task', error)
      setTaskRows(previousRows)
    }
  }

  function stopVoiceCommentRecording() {
    const recorder = commentMediaRecorderRef.current
    if (!recorder) return
    if (recorder.state !== 'inactive') recorder.stop()
  }

  const startVoiceCommentRecording = async () => {
    if (isRecordingVoiceComment) return
    setVoiceCommentError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceCommentError('Voice recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      commentVoiceChunksRef.current = []
      commentVoiceStartAtRef.current = Date.now()

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          commentVoiceChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const durationMs = Date.now() - commentVoiceStartAtRef.current
        const mimeType = recorder.mimeType || 'audio/webm'
        const fileExt = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([new Blob(commentVoiceChunksRef.current, { type: mimeType })], `voice-${Date.now()}.${fileExt}`, {
          type: mimeType,
        })
        const previewUrl = URL.createObjectURL(file)
        setPendingVoiceComment((current) => {
          if (current) URL.revokeObjectURL(current.previewUrl)
          return { file, previewUrl, durationMs }
        })
        stream.getTracks().forEach((track) => track.stop())
        commentMediaRecorderRef.current = null
        setIsRecordingVoiceComment(false)
      }

      commentMediaRecorderRef.current = recorder
      recorder.start()
      setIsRecordingVoiceComment(true)
    } catch (error) {
      console.error('Failed to start voice recording', error)
      setVoiceCommentError('Microphone permission is required to record voice.')
      setIsRecordingVoiceComment(false)
      commentMediaRecorderRef.current = null
    }
  }

  const addCommentToTask = async () => {
    if (!activeTaskRef) return
    if (!currentUser?.id) return
    const contentText = commentDraft.trim()
    if (!contentText && !pendingVoiceComment) return
    let uploadedVoice: { key: string; url: string } | null = null
    if (pendingVoiceComment) {
      try {
        uploadedVoice = await uploadVoiceToR2(pendingVoiceComment.file)
      } catch (error) {
        setVoiceCommentError(error instanceof Error ? error.message : 'Voice upload failed.')
        return
      }
    }
    const content =
      uploadedVoice || pendingVoiceComment
        ? serializeCommentContent(contentText, {
            voiceDataUrl: uploadedVoice?.url,
            voiceStorageKey: uploadedVoice?.key,
            durationMs: pendingVoiceComment?.durationMs,
          })
        : contentText

    const { data, error } = await supabase
      .from('task_comments')
      .insert({
        task_id: activeTaskRef.taskId,
        author_id: currentUser.id,
        content,
        parent_comment_id: null,
      })
      .select('id, task_id, author_id, content, created_at')
      .single()

    if (error || !data) {
      console.error('Failed to add comment', error)
      return
    }

    const comment: BoardComment = {
      id: data.id,
      authorId: data.author_id ?? currentUser.id,
      author: activeCommentAuthor.name,
      authorAvatarUrl: activeCommentAuthor.avatarUrl,
      content: contentText,
      voiceDataUrl: uploadedVoice?.url,
      voiceDurationMs: pendingVoiceComment?.durationMs,
      createdAt: dateTimeLabel(data.created_at),
      likes: 0,
      likedByMe: false,
      replies: [],
    }
    setCommentsByTaskId((current) => ({
      ...current,
      [activeTaskRef.taskId]: [comment, ...(current[activeTaskRef.taskId] ?? [])],
    }))

    setCommentDraft('')
    setPendingVoiceComment((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return null
    })
    setBoardColumns((columns) =>
      columns.map((column) =>
        column.id === activeTaskRef.columnId
          ? {
              ...column,
              items: column.items.map((item) =>
                item.id === activeTaskRef.taskId
                  ? {
                      ...item,
                      activity: [makeActivity('Comment added'), ...item.activity],
                    }
                  : item,
              ),
            }
          : column,
      ),
    )
  }

  const toggleCommentLike = async (commentId: string) => {
    if (!activeTaskRef) return
    if (!currentUser?.id) return

    let wasLikedByMe = false
    setCommentsByTaskId((current) => {
      const taskComments = current[activeTaskRef.taskId] ?? []
      return {
        ...current,
        [activeTaskRef.taskId]: taskComments.map((comment) => {
          if (comment.id !== commentId) return comment
          wasLikedByMe = comment.likedByMe
          const likedByMe = !comment.likedByMe
          const likes = Math.max(0, comment.likes + (likedByMe ? 1 : -1))
          return { ...comment, likedByMe, likes }
        }),
      }
    })

    if (wasLikedByMe) {
      const { error } = await supabase
        .from('task_comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', currentUser.id)
        .eq('reaction', 'like')
      if (!error) return
      console.error('Failed to remove like', error)
    } else {
      const { error } = await supabase.from('task_comment_reactions').insert({
        comment_id: commentId,
        user_id: currentUser.id,
        reaction: 'like',
      })
      if (!error) return
      console.error('Failed to add like', error)
    }

    setCommentsByTaskId((current) => {
      const taskComments = current[activeTaskRef.taskId] ?? []
      return {
        ...current,
        [activeTaskRef.taskId]: taskComments.map((comment) => {
          if (comment.id !== commentId) return comment
          const likedByMe = !comment.likedByMe
          const likes = Math.max(0, comment.likes + (likedByMe ? 1 : -1))
          return { ...comment, likedByMe, likes }
        }),
      }
    })
  }

  const addReplyToComment = async (commentId: string) => {
    if (!activeTaskRef) return
    if (!currentUser?.id) return
    const content = (replyDraftByCommentId[commentId] ?? '').trim()
    if (!content) return

    const { data, error } = await supabase
      .from('task_comments')
      .insert({
        task_id: activeTaskRef.taskId,
        author_id: currentUser.id,
        content,
        parent_comment_id: commentId,
      })
      .select('id, author_id, content, created_at')
      .single()
    if (error || !data) {
      console.error('Failed to add reply', error)
      return
    }

    const reply = {
      id: data.id,
      authorId: data.author_id ?? currentUser.id,
      author: activeCommentAuthor.name,
      authorAvatarUrl: activeCommentAuthor.avatarUrl,
      content: data.content,
      createdAt: dateTimeLabel(data.created_at),
    }

    setCommentsByTaskId((current) => ({
      ...current,
      [activeTaskRef.taskId]: (current[activeTaskRef.taskId] ?? []).map((comment) =>
        comment.id === commentId ? { ...comment, replies: [reply, ...comment.replies] } : comment,
      ),
    }))

    setReplyDraftByCommentId((drafts) => ({ ...drafts, [commentId]: '' }))
    setActiveReplyCommentId(null)
    setBoardColumns((columns) =>
      columns.map((column) =>
        column.id === activeTaskRef.columnId
          ? {
              ...column,
              items: column.items.map((item) =>
                item.id === activeTaskRef.taskId
                  ? {
                      ...item,
                      activity: [makeActivity('Reply added'), ...item.activity],
                    }
                  : item,
              ),
            }
          : column,
      ),
    )
  }

  const insertDescriptionMention = (memberId: string) => {
    const mention = descriptionMentionDraft
    if (!mention) return
    const teammate = detailTeammateOptions.find((member) => member.id === memberId)
    if (!teammate) return

    const mentionText = `@${teammate.name} `
    const nextDescription = `${detailDraft.description.slice(0, mention.start)}${mentionText}${detailDraft.description.slice(mention.end)}`
    const nextDraft = { ...detailDraft, description: nextDescription }
    setDetailDraft(nextDraft)
    triggerDebouncedDescriptionAutosave(nextDraft)
    setDescriptionMentionDraft(null)
    setDescriptionMentionActiveIndex(0)

    const nextCursor = mention.start + mentionText.length
    window.requestAnimationFrame(() => {
      descriptionTextareaRef.current?.focus()
      descriptionTextareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const renderCalendarContent = () => {
    if (calendarView === 'daily') {
      return (
        <Card>
          <CardContent className='space-y-2 p-4 md:p-5'>
            {dailyTasks.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No tasks scheduled for this day.</p>
            ) : (
              dailyTasks.map((task) => (
                <article key={task.id} className='rounded-md border bg-muted/15 p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <button
                      type='button'
                      onClick={() => openTaskDetailsById(task.id)}
                      className='font-medium text-foreground hover:underline'
                    >
                      {task.title}
                    </button>
                    <Badge variant='outline' className={statusBadgeTone(task.status)}>{task.status}</Badge>
                  </div>
                  <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
                    <Link to={`/dashboard/projects/${task.projectId}`} className='font-medium text-primary hover:underline'>
                      {task.projectName}
                    </Link>
                    <span>•</span>
                    <span>{task.owner}</span>
                    <span>•</span>
                    <span>{formatRange(task)}</span>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      )
    }

    if (calendarView === 'weekly') {
      return (
        <Card>
          <CardContent className='space-y-3 p-4 md:p-5'>
            <div className='grid grid-cols-7 gap-2'>
              {Array.from({ length: 7 }, (_, index) => {
                const day = addDays(weekStart, index)
                const dayTasks = taskRows.filter((task) => spansDate(task, day)).length
                return (
                  <div key={day.toISOString()} className='rounded-md border bg-muted/15 p-2 text-center'>
                    <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                      {WEEKDAY_LABELS[index]}
                    </p>
                    <p className='mt-1 text-sm font-semibold text-foreground'>{day.getDate()}</p>
                    <p className='text-[11px] text-muted-foreground'>{dayTasks} tasks</p>
                  </div>
                )
              })}
            </div>

            <div className='space-y-2 rounded-md border p-3'>
              {weeklyTasks.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No task spans in this week.</p>
              ) : (
                weeklyTasks.map((task) => {
                  const taskStart = parseDate(task.startDate)
                  const taskEnd = parseDate(task.endDate)
                  const visibleStart = taskStart.getTime() < weekStart.getTime() ? weekStart : taskStart
                  const visibleEnd = taskEnd.getTime() > weekEnd.getTime() ? weekEnd : taskEnd
                  const startOffset = Math.round((visibleStart.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
                  const spanDays =
                    Math.round((visibleEnd.getTime() - visibleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
                  const hoverAlign: HoverAlign =
                    startOffset + spanDays > 5 ? 'right' : startOffset < 2 ? 'left' : 'center'

                  return (
                    <div key={task.id} className='space-y-1'>
                      <div className='flex items-center justify-between text-xs text-muted-foreground'>
                        <button
                          type='button'
                          onClick={() => openTaskDetailsById(task.id)}
                          className='hover:text-foreground hover:underline'
                        >
                          {task.title}
                        </button>
                        <span>{formatRange(task)}</span>
                      </div>
                      <div className='group relative h-7 rounded-md bg-muted/25'>
                        <button
                          type='button'
                          onClick={() => openTaskDetailsById(task.id)}
                          className={cn('absolute top-1 h-5 rounded px-2 text-[11px] font-medium text-white', calendarBarTone(task.status))}
                          style={{
                            left: `${(startOffset / 7) * 100}%`,
                            width: `${(spanDays / 7) * 100}%`,
                          }}
                        >
                          <div className='truncate leading-5'>{task.title}</div>
                        </button>
                        <TaskHoverCard task={task} align={hoverAlign} onOpenTask={openTaskDetailsById} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      )
    }

    if (calendarView === 'monthly') {
      return (
        <Card>
          <CardContent className='p-4 md:p-5'>
            <div className='grid grid-cols-7 gap-2 pb-2'>
              {WEEKDAY_LABELS.map((label) => (
                <p key={label} className='text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                  {label}
                </p>
              ))}
            </div>
            <div className='grid grid-cols-7 gap-2'>
              {monthDays.map((day, index) => {
                const dayTasks = taskRows.filter((task) => spansDate(task, day))
                const outside = day.getMonth() !== calendarDate.getMonth()
                const today = isSameDay(day, new Date())
                const columnIndex = index % 7
                const hoverAlign: HoverAlign = columnIndex >= 5 ? 'right' : columnIndex <= 1 ? 'left' : 'center'

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'min-h-[90px] rounded-md border bg-card p-1.5',
                      outside && 'border-dashed border-muted-foreground/30 bg-muted/45 text-muted-foreground/80',
                    )}
                  >
                    <p
                      className={cn(
                        'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                        outside && 'opacity-75',
                        today && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {day.getDate()}
                    </p>
                    <div className='space-y-1'>
                      {dayTasks.slice(0, 2).map((task) => (
                        <div key={`${task.id}-${day.toISOString()}`} className='group relative'>
                          <button
                            type='button'
                            onClick={() => openTaskDetailsById(task.id)}
                            className={cn('block w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-white', calendarBarTone(task.status))}
                          >
                            <span className='block truncate whitespace-nowrap'>{task.title}</span>
                          </button>
                          <TaskHoverCard task={task} align={hoverAlign} onOpenTask={openTaskDetailsById} />
                        </div>
                      ))}
                      {dayTasks.length > 2 ? (
                        <p className='text-[10px] font-medium text-muted-foreground'>+{dayTasks.length - 2} more</p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardContent className='grid gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3'>
          {yearMonths.map((monthDate) => {
            const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
            const monthTasks = taskRows.filter((task) => intersectsRange(task, monthStart, monthEnd))

            return (
              <div key={monthDate.toISOString()} className='rounded-md border bg-muted/10 p-3'>
                <div className='mb-2 flex items-center justify-between'>
                  <p className='text-sm font-semibold text-foreground'>
                    {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(monthDate)}
                  </p>
                  <Badge variant='outline'>{monthTasks.length}</Badge>
                </div>
                <div className='space-y-1'>
                  {monthTasks.slice(0, 3).map((task) => (
                    <div key={`${monthDate.getMonth()}-${task.id}`} className='group relative'>
                      <button
                        type='button'
                        onClick={() => openTaskDetailsById(task.id)}
                        className='truncate text-xs text-muted-foreground hover:text-foreground hover:underline'
                      >
                        {task.title}
                      </button>
                      <TaskHoverCard task={task} align='right' onOpenTask={openTaskDetailsById} />
                    </div>
                  ))}
                  {monthTasks.length === 0 ? <p className='text-xs text-muted-foreground'>No tasks</p> : null}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    )
  }

  const renderBoardContent = () => (
    <div className='space-y-3'>
      <Card>
        <CardContent className='space-y-3 p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            {BOARD_SAVED_VIEWS.map((view) => (
              <button
                key={view.key}
                type='button'
                onClick={() => applySavedView(view.key)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  savedBoardView === view.key
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {view.label}
              </button>
            ))}
          </div>

          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
            <div className='relative md:col-span-2'>
              <Search className='pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={boardSearch}
                onChange={(event) => setBoardSearch(event.target.value)}
                className='pl-8'
                placeholder='Search tasks, assignees, due dates'
              />
            </div>

            <select
              value={boardAssigneeFilter}
              onChange={(event) => setBoardAssigneeFilter(event.target.value)}
              className='h-9 rounded-md border bg-background px-3 text-sm'
              aria-label='Filter by assignee'
            >
              <option value='all'>All assignees</option>
              {allAssignees.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>

            <select
              value={boardDueFilter}
              onChange={(event) => setBoardDueFilter(event.target.value as BoardDueFilter)}
              className='h-9 rounded-md border bg-background px-3 text-sm'
              aria-label='Filter by due date'
            >
              <option value='all'>All due windows</option>
              <option value='today'>Due today</option>
              <option value='upcoming'>Upcoming</option>
              <option value='overdue'>Overdue</option>
              <option value='none'>No due date</option>
            </select>

            <select
              value={boardCompletionFilter}
              onChange={(event) => setBoardCompletionFilter(event.target.value as BoardCompletionFilter)}
              className='h-9 rounded-md border bg-background px-3 text-sm'
              aria-label='Filter by completion'
            >
              <option value='all'>All statuses</option>
              <option value='open'>Open</option>
              <option value='completed'>Completed</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {selectedTasksCount > 0 ? (
        <Card>
          <CardContent className='flex flex-wrap items-center gap-2 p-3'>
            <p className='text-sm font-medium'>
              {selectedTasksCount} selected
            </p>

            <Button type='button' size='sm' variant='outline' className='gap-1.5' onClick={markSelectedCompleted}>
              <CheckCheck className='h-4 w-4' aria-hidden='true' />
              Mark Complete
            </Button>

            <div className='flex items-center gap-1'>
              <select
                value={bulkMoveTargetColumnId}
                onChange={(event) => setBulkMoveTargetColumnId(event.target.value)}
                className='h-8 rounded-md border bg-background px-2 text-xs'
                aria-label='Move selected tasks to column'
              >
                {boardColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
              <Button type='button' size='sm' variant='outline' onClick={moveSelectedTasks}>
                Move
              </Button>
            </div>

            <div className='flex items-center gap-1'>
              <Input
                value={bulkAssignValue}
                onChange={(event) => setBulkAssignValue(event.target.value)}
                className='h-8 w-36'
                placeholder='Assign to...'
              />
              <Button type='button' size='sm' variant='outline' onClick={assignSelectedTasks}>
                Assign
              </Button>
            </div>

            <Button type='button' size='sm' variant='ghost' className='ml-auto' onClick={clearSelection}>
              Clear
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <section className='w-full max-w-full overflow-hidden rounded-lg border bg-muted/10 p-2'>
        <div className='w-full max-w-full overflow-x-auto overscroll-x-contain pb-1 [scrollbar-gutter:stable_both-edges]'>
          <div className='inline-flex min-w-full gap-3 pr-1'>
            {visibleBoardColumns.map((column) => {
              const allVisibleSelected = column.items.length > 0 && column.items.every((item) => selectedTaskSet.has(item.id))

              return (
                <Card
                  key={column.id}
                  className='w-[320px] shrink-0'
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleBoardDrop(column.id)}
                >
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <CardTitle className='text-sm'>{column.title}</CardTitle>
                      <div className='flex items-center gap-2'>
                        {!column.isDefault ? (
                          <button
                            type='button'
                            onClick={() => void handleDeleteBoardColumn(column.id)}
                            className='inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                            aria-label={`Delete ${column.title} column`}
                          >
                            <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
                          </button>
                        ) : null}
                        <button
                          type='button'
                          onClick={() => selectVisibleTasksInColumn(column.id)}
                          className='text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'
                        >
                          {allVisibleSelected ? 'Clear' : 'Select all'}
                        </button>
                      </div>
                    </div>
                    <CardDescription>{column.items.length} shown</CardDescription>
                  </CardHeader>

                  <CardContent className='space-y-2'>
                    {column.items.length === 0 ? (
                      <div className='rounded-md border border-dashed p-3 text-xs text-muted-foreground'>
                        Drop or add tasks here
                      </div>
                    ) : null}

                    {column.items.map((item) => {
                      const canEditBoardTask = canEditTaskById(item.id)
                      return (
                      <article
                        key={item.id}
                        draggable={canEditBoardTask}
                        onDragStart={() => {
                          if (!canEditBoardTask) return
                          handleBoardDragStart(item.id, column.id)
                        }}
                        onPointerDown={(event) => {
                          if (shouldIgnoreHoldTarget(event.target)) return
                          beginHoldSelect(item.id)
                        }}
                        onPointerUp={endHoldSelect}
                        onPointerLeave={endHoldSelect}
                        onPointerCancel={endHoldSelect}
                        onClick={(event) => {
                          if (shouldIgnoreHoldTarget(event.target)) return
                          if (holdSelectedTaskIdRef.current === item.id) {
                            holdSelectedTaskIdRef.current = null
                            return
                          }
                          openTaskDetails(column.id, item)
                        }}
                        className={cn(
                          'cursor-pointer rounded-md border bg-muted/20 p-2.5 transition-colors active:cursor-grabbing',
                          selectedTaskSet.has(item.id) && 'border-primary/60 bg-primary/10',
                        )}
                      >
                        <div className='flex items-start justify-between gap-2'>
                          <div className='flex min-w-0 items-start gap-2'>
                              <button
                                type='button'
                                data-no-hold='true'
                                disabled={!canEditBoardTask}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (!canEditBoardTask) return
                                  toggleBoardTaskCompleted(item.id)
                                }}
                              className={cn(
                                'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                item.completed
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-border bg-background text-transparent',
                              )}
                              aria-label={item.completed ? 'Mark task as incomplete' : 'Mark task as complete'}
                            >
                              <Check className='h-3 w-3' aria-hidden='true' />
                            </button>

                            <div className='min-w-0'>
                              {editingTask?.columnId === column.id && editingTask?.taskId === item.id ? (
                                <div className='space-y-2' data-no-hold='true'>
                                  <Input
                                    value={editingTaskDraft.title}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      setEditingTaskDraft((draft) => ({ ...draft, title: event.target.value }))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        event.preventDefault()
                                        saveEditingBoardTask()
                                      }
                                      if (event.key === 'Escape') {
                                        event.preventDefault()
                                        cancelEditingBoardTask()
                                      }
                                    }}
                                    className='h-8'
                                  />
                                  <div className='grid grid-cols-2 gap-2'>
                                    <DatePicker
                                      value={dateFromInputValue(editingTaskDraft.startDate)}
                                      onChange={(date) => setEditingTaskDraft((draft) => ({ ...draft, startDate: toDateInputValue(date) }))}
                                      placeholder='Start date'
                                      className='h-8 text-xs'
                                    />
                                    <DatePicker
                                      value={dateFromInputValue(editingTaskDraft.endDate)}
                                      onChange={(date) => setEditingTaskDraft((draft) => ({ ...draft, endDate: toDateInputValue(date) }))}
                                      placeholder='End date'
                                      className='h-8 text-xs'
                                    />
                                  </div>
                                  <div className='grid grid-cols-2 gap-2'>
                                    <select
                                      value={editingTaskDraft.projectId}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setEditingTaskDraft((draft) => ({
                                          ...draft,
                                          projectId: event.target.value,
                                        }))
                                      }
                                      className='h-8 rounded-md border bg-background px-2 text-xs text-foreground'
                                    >
                                      <option value=''>Unassigned project</option>
                                      {projects.map((project) => (
                                        <option key={project.id} value={project.id}>
                                          {project.name}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      value={editingTaskDraft.status}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setEditingTaskDraft((draft) => ({
                                          ...draft,
                                          status: event.target.value as TaskRow['status'],
                                        }))
                                      }
                                      className='h-8 rounded-md border bg-background px-2 text-xs text-foreground'
                                    >
                                      <option value='Planned'>Planned</option>
                                      <option value='In Progress'>In Progress</option>
                                      <option value='Review'>Review</option>
                                      <option value='Blocked'>Blocked</option>
                                      <option value='Done'>Done</option>
                                    </select>
                                  </div>
                                  <select
                                    value={editingTaskDraft.priority}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      setEditingTaskDraft((draft) => ({
                                        ...draft,
                                        priority: event.target.value as TaskRow['priority'],
                                      }))
                                    }
                                    className='h-8 rounded-md border bg-background px-2 text-xs text-foreground'
                                  >
                                    <option value='Low'>Low priority</option>
                                    <option value='Medium'>Medium priority</option>
                                    <option value='High'>High priority</option>
                                    <option value='Urgent'>Urgent priority</option>
                                  </select>
                                  <div className='max-h-28 overflow-y-auto rounded-md border bg-background p-2 text-xs'>
                                    {members.map((member) => (
                                      <label key={member.id} className='flex items-center gap-2 py-1'>
                                        <input
                                          type='checkbox'
                                          checked={editingTaskDraft.assigneeIds.includes(member.id)}
                                          onChange={(event) =>
                                            setEditingTaskDraft((draft) => ({
                                              ...draft,
                                              assigneeIds: event.target.checked
                                                ? [...draft.assigneeIds, member.id]
                                                : draft.assigneeIds.filter((id) => id !== member.id),
                                            }))
                                          }
                                        />
                                        <span>{member.name}</span>
                                      </label>
                                    ))}
                                    {members.length === 0 ? <p className='text-muted-foreground'>No teammates available.</p> : null}
                                  </div>
                                  <label className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                                    <input
                                      type='checkbox'
                                      checked={editingTaskDraft.completed}
                                      onChange={(event) =>
                                        setEditingTaskDraft((draft) => ({ ...draft, completed: event.target.checked }))
                                      }
                                    />
                                    Completed
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={editingTaskDraft.description}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      setEditingTaskDraft((draft) => ({ ...draft, description: event.target.value }))
                                    }
                                    placeholder='Description'
                                    className='w-full rounded-md border bg-background px-3 py-2 text-xs'
                                  />
                                  <div className='flex items-center gap-1'>
                                    <Button
                                      type='button'
                                      size='sm'
                                      className='h-7 px-2 text-xs'
                                      onClick={() => void saveEditingBoardTask()}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      type='button'
                                      size='sm'
                                      variant='outline'
                                      className='h-7 px-2 text-xs'
                                      onClick={cancelEditingBoardTask}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p
                                    className={cn(
                                      'truncate text-sm font-medium text-foreground',
                                      item.completed && 'text-muted-foreground line-through',
                                    )}
                                  >
                                    {item.title}
                                  </p>
                                  <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>{item.description}</p>
                                  <div className='mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                                    <span className='inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5'>
                                      <Clock3 className='h-3 w-3' aria-hidden='true' />
                                      {item.due}
                                    </span>
                                    <span className='inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5'>
                                      <UserRound className='h-3 w-3' aria-hidden='true' />
                                      {item.assignee}
                                    </span>
                                    <span className='inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5'>
                                      <MessageSquare className='h-3 w-3' aria-hidden='true' />
                                      {item.comments.length}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {editingTask?.columnId === column.id && editingTask?.taskId === item.id ? (
                            <button
                              type='button'
                              data-no-hold='true'
                              onClick={(event) => {
                                event.stopPropagation()
                                cancelEditingBoardTask()
                              }}
                              className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                              aria-label='Cancel edit'
                            >
                              <X className='h-3.5 w-3.5' aria-hidden='true' />
                            </button>
                          ) : canEditBoardTask ? (
                            <button
                              type='button'
                              data-no-hold='true'
                              onClick={(event) => {
                                event.stopPropagation()
                                startEditingBoardTask(column.id, item)
                              }}
                              className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                              aria-label='Edit task'
                            >
                              <Pencil className='h-3.5 w-3.5' aria-hidden='true' />
                            </button>
                          ) : (
                            <span className='inline-flex h-7 w-7 shrink-0' />
                          )}
                        </div>
                      </article>
                    )})}

                    <div className='border-t pt-2'>
                      <Button type='button' variant='outline' className='w-full gap-2' onClick={() => openTaskDialogForColumn(column.id)}>
                        <CirclePlus className='h-4 w-4' aria-hidden='true' />
                        Add Task
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            <Card className='w-[320px] shrink-0'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-sm'>Add Column</CardTitle>
                <CardDescription>Create another section for tasks.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                <Input
                  value={newColumnName}
                  onChange={(event) => setNewColumnName(event.target.value)}
                  placeholder='Column name'
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddBoardColumn()
                    }
                  }}
                />
                <Button type='button' className='w-full' onClick={handleAddBoardColumn}>
                  Add Column
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )

  const renderContent = () => {
    if (loadingTasks) {
      if (activeTab === 'list') return <TaskListSkeleton />
      if (activeTab === 'board') return <TaskBoardSkeleton />
      if (activeTab === 'calendar') return <TaskCalendarSkeleton />
    }

    switch (activeTab) {
      case 'list':
        return (
          <Card className='flex h-full w-full min-h-0 flex-col overflow-hidden'>
            <CardHeader className='pb-3'>
              <div className='flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between'>
                <div className='grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(320px,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(220px,1fr)]'>
                  <div className='relative'>
                  <Search className='pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    value={listSearch}
                    onChange={(event) => setListSearch(event.target.value)}
                    className='h-10 pl-8'
                    placeholder='Search task, project, assignee'
                  />
                </div>

                <select
                  value={listScopeFilter}
                  onChange={(event) => setListScopeFilter(event.target.value as ListScopeFilter)}
                  className='h-10 rounded-md border bg-background px-3 text-sm'
                  aria-label='Filter tasks by scope'
                >
                  <option value='all'>All tasks</option>
                  <option value='assigned_to_me'>Assigned to me</option>
                  <option value='created_by_me'>Created by me</option>
                  <option value='due_soon'>Due soon</option>
                  <option value='overdue'>Overdue</option>
                </select>

                <select
                  value={listStatusFilter}
                  onChange={(event) => setListStatusFilter(event.target.value as ListStatusFilter)}
                  className='h-10 rounded-md border bg-background px-3 text-sm'
                  aria-label='Filter tasks by status'
                >
                  <option value='all'>All statuses</option>
                  <option value='Planned'>Planned</option>
                  <option value='In Progress'>In Progress</option>
                  <option value='Review'>Review</option>
                  <option value='Blocked'>Blocked</option>
                  <option value='Done'>Done</option>
                </select>

                <div className='grid grid-cols-2 gap-2'>
                  <select
                    value={listCompletionFilter}
                    onChange={(event) => setListCompletionFilter(event.target.value as ListCompletionFilter)}
                    className='h-10 rounded-md border bg-background px-3 text-sm'
                    aria-label='Filter tasks by completion'
                  >
                    <option value='all'>All</option>
                    <option value='open'>Open</option>
                    <option value='completed'>Completed</option>
                  </select>
                  <select
                    value={listProjectFilter}
                    onChange={(event) => setListProjectFilter(event.target.value)}
                    className='h-10 rounded-md border bg-background px-3 text-sm'
                    aria-label='Filter tasks by project'
                  >
                    <option value='all'>All projects</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                </div>
                <Button type='button' onClick={() => setTaskDialogOpen(true)} className='h-10 shrink-0 gap-2 self-end px-3 xl:self-auto'>
                  <CirclePlus className='h-4 w-4' aria-hidden='true' />
                  Create Task
                </Button>
              </div>
            </CardHeader>
            <CardContent className='min-h-0 flex-1 p-3'>
              <div className='h-full space-y-4 overflow-auto'>
                {listSections.map((section) => (
                  <section key={section.id} className='overflow-hidden rounded-md border'>
                    <div className='flex items-center justify-between border-b bg-muted/25 px-4 py-2'>
                      <h3 className='text-sm font-semibold text-foreground'>{section.title}</h3>
                      <span className='text-xs text-muted-foreground'>{section.tasks.length} tasks</span>
                    </div>
                    {section.tasks.length === 0 ? (
                      <p className='px-4 py-3 text-sm text-muted-foreground'>No tasks in this column.</p>
                    ) : (
                      <table className='w-full table-fixed text-sm'>
                        <colgroup>
                          <col className='w-12' />
                          <col />
                          <col className='w-44' />
                          <col className='w-32' />
                          <col className='w-28' />
                          <col className='w-32' />
                          <col className='w-24' />
                        </colgroup>
                        <thead className='border-b bg-muted/15 text-left text-xs uppercase tracking-wide text-muted-foreground'>
                          <tr>
                            <th className='w-12 px-4 py-2 font-medium' aria-label='Complete task' />
                            <th className='px-4 py-2 font-medium'>Task</th>
                            <th className='px-3 py-2 font-medium'>Project</th>
                            <th className='px-3 py-2 font-medium'>Assignees</th>
                            <th className='px-3 py-2 font-medium'>Due</th>
                            <th className='px-3 py-2 font-medium'>Priority</th>
                            <th className='px-4 py-2 font-medium text-right'>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.tasks.map((task) => {
                            const canEditTaskRow = canEditTaskById(task.id)
                            return (
                            <tr
                              key={task.id}
                              className='cursor-pointer border-b transition-colors hover:bg-muted/10 last:border-b-0'
                              onClick={() => openTaskDetailsById(task.id)}
                            >
                              <td className='px-4 py-2.5'>
                                <button
                                  type='button'
                                  disabled={!canEditTaskRow}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    if (!canEditTaskRow) return
                                    void toggleBoardTaskCompleted(task.id)
                                  }}
                                  className={cn(
                                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                    task.completed
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-border bg-background text-transparent',
                                  )}
                                  aria-label={task.completed ? `Mark ${task.title} as incomplete` : `Mark ${task.title} as complete`}
                                >
                                  <Check className='h-3 w-3' aria-hidden='true' />
                                </button>
                              </td>
                              <td className='px-4 py-2.5'>
                                <span className={cn('font-medium text-foreground', task.completed && 'text-muted-foreground line-through')}>
                                  {task.title}
                                </span>
                              </td>
                              <td className='px-3 py-2.5'>
                                <Link
                                  to={`/dashboard/projects/${task.projectId}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className='block truncate text-xs font-medium text-primary hover:underline'
                                >
                                  {task.projectName}
                                </Link>
                              </td>
                              <td className='px-3 py-2.5'>
                                {task.assigneeIds.length > 0 ? (
                                  <div className='flex items-center'>
                                    {task.assigneeIds.slice(0, 4).map((assigneeId, index) => {
                                      const member = members.find((item) => item.id === assigneeId)
                                      const label = member?.name ?? 'Unknown'
                                      const initials = label
                                        .split(/\s+/)
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((part) => part[0]?.toUpperCase() ?? '')
                                        .join('')
                                      return (
                                        <div key={assigneeId} className={cn('relative', index > 0 && '-ml-1')}>
                                          <Avatar className='h-5 w-5 border border-background' title={label}>
                                            {member?.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={label} /> : null}
                                            <AvatarFallback className='text-[8px] font-semibold'>{initials || 'U'}</AvatarFallback>
                                          </Avatar>
                                        </div>
                                      )
                                    })}
                                    {task.assigneeIds.length > 4 ? (
                                      <div className='-ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted text-[7px] font-semibold text-muted-foreground'>
                                        +{task.assigneeIds.length - 4}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className='text-sm text-muted-foreground'>-</span>
                                )}
                              </td>
                              <td className='px-3 py-2.5 whitespace-nowrap'>{task.due}</td>
                              <td className='px-3 py-2.5'>
                                <Badge variant='outline' className={cn('whitespace-nowrap', priorityBadgeTone(task.priority))}>
                                  {task.priority}
                                </Badge>
                              </td>
                              <td className='px-4 py-2.5'>
                                <div className='flex items-center justify-end gap-1'>
                                  {canEditTaskRow ? (
                                    <button
                                      type='button'
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void handleDeleteTask(task.id)
                                      }}
                                      className='inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                                      aria-label={`Delete ${task.title}`}
                                    >
                                      <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )})}
                        </tbody>
                      </table>
                    )}
                  </section>
                ))}
              </div>
            </CardContent>
          </Card>
        )

      case 'board':
        return renderBoardContent()

      case 'calendar':
        return (
          <div className='space-y-3'>
            <Card>
              <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
                <div className='inline-flex flex-wrap gap-1 rounded-md bg-muted/35 p-1'>
                  {CALENDAR_VIEW_TABS.map((view) => (
                    <button
                      key={view.key}
                      type='button'
                      onClick={() => setCalendarView(view.key)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        calendarView === view.key
                          ? 'border bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>

                <div className='flex items-center gap-1'>
                  <Button variant='outline' size='icon' className='h-8 w-8' onClick={() => moveCalendar('prev')} aria-label='Previous period'>
                    <ChevronLeft className='h-4 w-4' aria-hidden='true' />
                  </Button>
                  <Button variant='outline' size='sm' className='h-8' onClick={() => setCalendarDate(startOfDay(new Date()))}>
                    Today
                  </Button>
                  <Button variant='outline' size='icon' className='h-8 w-8' onClick={() => moveCalendar('next')} aria-label='Next period'>
                    <ChevronRight className='h-4 w-4' aria-hidden='true' />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {renderCalendarContent()}
          </div>
        )

      case 'notes':
        return (
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Notes</CardTitle>
              <CardDescription>Capture quick updates and context for your tasks.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Input placeholder='Note title' />
              <textarea
                rows={6}
                placeholder='Write your task note here...'
                className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              />
              <div className='flex items-center justify-between'>
                <Button variant='outline' size='sm' className='gap-1.5'>
                  <Paperclip className='h-4 w-4' aria-hidden='true' />
                  Attach file
                </Button>
                <Button size='sm'>Save note</Button>
              </div>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <>
      <div className='flex h-full min-h-0 flex-col gap-4 overflow-hidden'>
        <Card>
          <CardContent className='p-2'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='inline-flex flex-wrap gap-1 rounded-md bg-muted/35 p-1'>
                {TABS.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.key}
                      type='button'
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        activeTab === tab.key
                          ? 'border bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      <Icon className='h-4 w-4' aria-hidden='true' />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
              {activeTab === 'board' ? (
                <p className='text-xs text-muted-foreground sm:text-sm'>
                  {totalTasksCount} total tasks • {selectedTasksCount} selected • Press and hold a task to select
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className={cn('min-h-0', activeTab === 'list' && 'flex flex-1 overflow-hidden')}>
          {renderContent()}
        </div>
      </div>

      <CreateTaskDialog
        open={taskDialogOpen}
        onOpenChange={handleTaskDialogOpenChange}
        onTaskCreated={handleTaskCreated}
        initialBoardColumn={createTaskColumnId}
      />

      <Dialog open={Boolean(activeTaskData)} onOpenChange={(open) => (!open ? closeTaskDetails() : undefined)}>
        <DialogContent className='max-h-[90vh] max-w-4xl overflow-hidden p-0'>
          {activeTaskData ? (
            <div className='flex max-h-[90vh] min-h-0 flex-col'>
              <DialogHeader className='border-b px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <DialogTitle>Task Details</DialogTitle>
                    <DialogDescription>{activeTaskData.column.title}</DialogDescription>
                    {!canEditActiveTask ? (
                      <p className='mt-1 text-xs text-amber-300'>Only the task creator can edit details. You can still add comments.</p>
                    ) : null}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {detailSaveState === 'saving' ? (
                      <span className='inline-flex items-center gap-1'>
                        <Loader2 className='h-3.5 w-3.5 animate-spin' />
                        Saving...
                      </span>
                    ) : null}
                    {detailSaveState === 'saved' ? <span className='inline-flex items-center gap-1 text-emerald-300'><Check className='h-3.5 w-3.5' />Saved</span> : null}
                    {detailSaveState === 'error' ? <span className='text-rose-300'>Save failed</span> : null}
                  </div>
                </div>
              </DialogHeader>

              <div className='grid min-h-0 flex-1 lg:grid-cols-[minmax(0,2.1fr)_360px]'>
                <div className='flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain border-r p-4'>
                  <div className='flex flex-1 flex-col gap-4'>
                    <Input
                      value={detailDraft.title}
                      onChange={(event) => setDetailDraft((draft) => ({ ...draft, title: event.target.value }))}
                      onBlur={triggerDetailAutosave}
                      placeholder='Task title'
                      className='h-11 text-lg font-semibold'
                      readOnly={!canEditActiveTask}
                    />

                  <div className='grid gap-3 md:grid-cols-2'>
                    <div className='space-y-1.5'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Start Date</p>
                      <DatePicker
                        value={dateFromInputValue(detailDraft.startDate)}
                        disabled={!canEditActiveTask}
                        onChange={(date) => {
                          const nextDraft = { ...detailDraft, startDate: toDateInputValue(date) }
                          setDetailDraft(nextDraft)
                          triggerDetailAutosaveWithDraft(nextDraft)
                        }}
                        placeholder='Start date'
                        className='h-9'
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Due Date</p>
                      <DatePicker
                        value={dateFromInputValue(detailDraft.endDate)}
                        disabled={!canEditActiveTask}
                        onChange={(date) => {
                          const nextDraft = { ...detailDraft, endDate: toDateInputValue(date) }
                          setDetailDraft(nextDraft)
                          triggerDetailAutosaveWithDraft(nextDraft)
                        }}
                        placeholder='Due date'
                        className='h-9'
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Project</p>
                      <select
                        value={detailDraft.projectId}
                        disabled={!canEditActiveTask}
                        onChange={(event) => {
                          const nextDraft = { ...detailDraft, projectId: event.target.value }
                          setDetailDraft(nextDraft)
                          triggerDetailAutosaveWithDraft(nextDraft)
                        }}
                        className='h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground'
                      >
                        <option value=''>Unassigned project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className='space-y-1.5'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Status</p>
                      <select
                        value={detailDraft.status}
                        disabled={!canEditActiveTask}
                        onChange={(event) => {
                          const nextDraft = { ...detailDraft, status: event.target.value as TaskRow['status'] }
                          setDetailDraft(nextDraft)
                          triggerDetailAutosaveWithDraft(nextDraft)
                        }}
                        className='h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground'
                      >
                        <option value='Planned'>Planned</option>
                        <option value='In Progress'>In Progress</option>
                        <option value='Review'>Review</option>
                        <option value='Blocked'>Blocked</option>
                        <option value='Done'>Done</option>
                      </select>
                    </div>
                    <div className='space-y-1.5'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Priority</p>
                      <select
                        value={detailDraft.priority}
                        disabled={!canEditActiveTask}
                        onChange={(event) => {
                          const nextDraft = { ...detailDraft, priority: event.target.value as TaskRow['priority'] }
                          setDetailDraft(nextDraft)
                          triggerDetailAutosaveWithDraft(nextDraft)
                        }}
                        className='h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground'
                      >
                        <option value='Low'>Low priority</option>
                        <option value='Medium'>Medium priority</option>
                        <option value='High'>High priority</option>
                        <option value='Urgent'>Urgent priority</option>
                      </select>
                    </div>
                    <div className='space-y-1.5'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Completion</p>
                      <button
                        type='button'
                        disabled={!canEditActiveTask}
                        onClick={() => {
                          const nextDraft = { ...detailDraft, completed: !detailDraft.completed }
                          setDetailDraft(nextDraft)
                          triggerDetailAutosaveWithDraft(nextDraft)
                        }}
                        className={cn(
                          'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm',
                          detailDraft.completed ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'text-muted-foreground',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]',
                            detailDraft.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border',
                          )}
                        >
                          <Check className='h-3 w-3' />
                        </span>
                        {detailDraft.completed ? 'Completed' : 'Open'}
                      </button>
                    </div>
                  </div>

                  <div className='space-y-2 rounded-md border bg-muted/10 p-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Assignees</p>
                      <Popover open={detailAssigneeOpen} onOpenChange={setDetailAssigneeOpen}>
                        <PopoverTrigger asChild>
                          <Button type='button' size='sm' variant='outline' className='h-8' disabled={!canEditActiveTask}>
                            Add assignee
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className='w-72 p-2' align='end'>
                          <Input
                            value={detailAssigneeSearch}
                            onChange={(event) => setDetailAssigneeSearch(event.target.value)}
                            placeholder='Search teammates'
                            className='h-8'
                          />
                          <div className='mt-2 max-h-48 space-y-1 overflow-y-auto'>
                            {filteredDetailTeammates.length === 0 ? (
                              <p className='px-2 py-3 text-xs text-muted-foreground'>No teammates found.</p>
                            ) : (
                              filteredDetailTeammates.map((member) => {
                                const selected = detailDraft.assigneeIds.includes(member.id)
                                return (
                                  <button
                                    key={member.id}
                                    type='button'
                                    disabled={!canEditActiveTask}
                                    onClick={() => {
                                      const nextDraft = {
                                        ...detailDraft,
                                        assigneeIds: selected
                                          ? detailDraft.assigneeIds.filter((id) => id !== member.id)
                                          : [...detailDraft.assigneeIds, member.id],
                                      }
                                      setDetailDraft(nextDraft)
                                      triggerDetailAutosaveWithDraft(nextDraft)
                                    }}
                                    className={cn(
                                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                      selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                                    )}
                                  >
                                    <span className='truncate'>{member.name}</span>
                                    {selected ? <Check className='h-4 w-4' /> : null}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {detailDraft.assigneeIds.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>No assignees selected.</p>
                      ) : (
                        detailDraft.assigneeIds.map((assigneeId) => {
                          const member = detailTeammateOptions.find((item) => item.id === assigneeId)
                          const label = member?.name ?? 'Unknown user'
                          return (
                            <span key={assigneeId} className='inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-xs'>
                              <Avatar className='h-5 w-5 border'>
                                {member?.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={label} /> : null}
                                <AvatarFallback className='text-[9px] font-semibold'>{initialsForName(label)}</AvatarFallback>
                              </Avatar>
                              <span className='max-w-28 truncate'>{label}</span>
                              <button
                                type='button'
                                disabled={!canEditActiveTask}
                                onClick={() => {
                                  const nextDraft = {
                                    ...detailDraft,
                                    assigneeIds: detailDraft.assigneeIds.filter((id) => id !== assigneeId),
                                  }
                                  setDetailDraft(nextDraft)
                                  triggerDetailAutosaveWithDraft(nextDraft)
                                }}
                                className='inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground'
                                aria-label={`Remove ${label}`}
                              >
                                <X className='h-3 w-3' />
                              </button>
                            </span>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className='mt-auto flex min-h-[220px] flex-1 flex-col space-y-1.5'>
                    <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Description</p>
                    <div className='relative flex min-h-0 flex-1'>
                    <textarea
                      ref={descriptionTextareaRef}
                      rows={6}
                      value={detailDraft.description}
                      readOnly={!canEditActiveTask}
                      onChange={(event) => {
                        const nextDraft = { ...detailDraft, description: event.target.value }
                        setDetailDraft(nextDraft)
                        triggerDebouncedDescriptionAutosave(nextDraft)
                        setDescriptionMentionDraft(getMentionDraft(event.target.value, event.target.selectionStart))
                      }}
                      onClick={(event) => setDescriptionMentionDraft(getMentionDraft(event.currentTarget.value, event.currentTarget.selectionStart))}
                      onKeyUp={(event) =>
                        setDescriptionMentionDraft(getMentionDraft(event.currentTarget.value, event.currentTarget.selectionStart))
                      }
                      onKeyDown={(event) => {
                        if (!descriptionMentionDraft || descriptionMentionOptions.length === 0) return
                        if (event.key === 'ArrowDown') {
                          event.preventDefault()
                          setDescriptionMentionActiveIndex((index) => (index + 1) % descriptionMentionOptions.length)
                          return
                        }
                        if (event.key === 'ArrowUp') {
                          event.preventDefault()
                          setDescriptionMentionActiveIndex(
                            (index) => (index - 1 + descriptionMentionOptions.length) % descriptionMentionOptions.length,
                          )
                          return
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          const selected = descriptionMentionOptions[descriptionMentionActiveIndex]
                          if (selected) insertDescriptionMention(selected.id)
                          return
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setDescriptionMentionDraft(null)
                        }
                      }}
                      onBlur={triggerDetailAutosave}
                      placeholder='Describe the task...'
                      className='h-full min-h-[180px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm'
                    />
                    {descriptionMentionDraft && descriptionMentionOptions.length > 0 ? (
                      <div className='absolute bottom-2 left-2 z-20 w-[min(20rem,calc(100%-1rem))] rounded-md border bg-card p-1 shadow-lg'>
                        {descriptionMentionOptions.map((member, index) => (
                          <button
                            key={member.id}
                            type='button'
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertDescriptionMention(member.id)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                              index === descriptionMentionActiveIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                            )}
                          >
                            <Avatar className='h-5 w-5 border'>
                              {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={member.name} /> : null}
                              <AvatarFallback className='text-[9px] font-semibold'>{initialsForName(member.name)}</AvatarFallback>
                            </Avatar>
                            <span className='truncate'>{member.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    </div>
                  </div>

                </div>
                </div>

                <aside className='flex min-h-0 flex-col bg-muted/15'>
                  <div className='border-b px-3 py-3'>
                    <div className='inline-flex items-center gap-1 text-sm font-semibold'>
                      <MessageSquare className='h-4 w-4' />
                      Comments
                    </div>
                  </div>
                  <div className='min-h-0 flex-1'>
                    <div className='h-full space-y-3 overflow-y-auto px-3 py-3'>
                      <div className='space-y-3'>
                        {activeTaskData.task.comments.length === 0 ? (
                          <p className='text-xs text-muted-foreground'>No comments yet.</p>
                        ) : (
                          activeTaskData.task.comments.map((comment) => (
                            <article key={comment.id} className='rounded-md px-1 py-1.5'>
                              <div className='flex gap-2'>
                                <Avatar className='mt-0.5 h-7 w-7 border'>
                                  {comment.authorAvatarUrl ? <AvatarImage src={comment.authorAvatarUrl} alt={comment.author} /> : null}
                                  <AvatarFallback className='text-[10px] font-semibold'>{initialsForName(comment.author)}</AvatarFallback>
                                </Avatar>
                                <div className='min-w-0 flex-1'>
                                  <div className='flex items-center gap-1 text-xs'>
                                    <span className='font-semibold text-foreground'>{comment.author}</span>
                                    <span className='text-muted-foreground'>· {comment.createdAt}</span>
                                  </div>
                                  {comment.content ? <p className='mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground'>{comment.content}</p> : null}
                                  {comment.voiceDataUrl ? (
                                    <div className='mt-2 space-y-1'>
                                      <audio controls src={comment.voiceDataUrl} className='h-8 w-full' />
                                      <p className='text-[11px] text-muted-foreground'>Voice message · {formatVoiceDuration(comment.voiceDurationMs)}</p>
                                    </div>
                                  ) : null}
                                  <div className='mt-2 flex items-center gap-1'>
                                    <button
                                      type='button'
                                      onClick={() => toggleCommentLike(comment.id)}
                                      className={cn(
                                        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-300',
                                        comment.likedByMe ? 'text-rose-300' : '',
                                      )}
                                    >
                                      <Heart className={cn('h-3.5 w-3.5', comment.likedByMe ? 'fill-current' : '')} />
                                      <span>{comment.likes > 0 ? comment.likes : 'Like'}</span>
                                    </button>
                                    <button
                                      type='button'
                                      onClick={() =>
                                        setActiveReplyCommentId((current) => (current === comment.id ? null : comment.id))
                                      }
                                      className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-sky-500/10 hover:text-sky-300'
                                    >
                                      <MessageCircle className='h-3.5 w-3.5' />
                                      <span>{comment.replies.length > 0 ? `Reply ${comment.replies.length}` : 'Reply'}</span>
                                    </button>
                                  </div>

                                  {comment.replies.length > 0 ? (
                                    <div className='mt-2 space-y-2 border-l border-border/70 pl-2.5'>
                                      {comment.replies.map((reply) => (
                                        <div key={reply.id} className='rounded-md bg-background/40 px-2 py-1.5'>
                                          <div className='flex items-center gap-1 text-[11px]'>
                                            <span className='font-medium text-foreground'>{reply.author}</span>
                                            <span className='text-muted-foreground'>· {reply.createdAt}</span>
                                          </div>
                                          <p className='mt-0.5 whitespace-pre-wrap text-xs text-foreground'>{reply.content}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}

                                  {activeReplyCommentId === comment.id ? (
                                    <div className='mt-2 flex items-start gap-2'>
                                      <Input
                                        value={replyDraftByCommentId[comment.id] ?? ''}
                                        onChange={(event) =>
                                          setReplyDraftByCommentId((drafts) => ({ ...drafts, [comment.id]: event.target.value }))
                                        }
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') {
                                            event.preventDefault()
                                            addReplyToComment(comment.id)
                                          }
                                        }}
                                        placeholder='Write a reply...'
                                        className='h-8'
                                      />
                                      <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        className='h-8 w-8 shrink-0 px-0'
                                        onClick={() => addReplyToComment(comment.id)}
                                        aria-label='Send reply'
                                      >
                                        <Send className='h-3.5 w-3.5' />
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          ))
                        )}
                      </div>

                      <div className='border-t pt-3'>
                        <div className='inline-flex items-center gap-1 text-sm font-semibold'>
                          <Activity className='h-4 w-4' />
                          Activity
                        </div>
                        <div className='mt-2 space-y-2'>
                          {activeTaskData.task.activity.slice(0, 40).map((log) => (
                            <div key={log.id} className='relative border-l pl-3 text-xs'>
                              <span className='absolute -left-[4px] top-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/70' />
                              <p className='text-foreground'>{log.message}</p>
                              <p className='text-[11px] text-muted-foreground'>{log.createdAt}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className='border-t px-3 py-3'>
                    <div className='space-y-2'>
                      {pendingVoiceComment ? (
                        <div className='rounded-md border bg-background/70 p-2'>
                          <div className='flex items-center justify-between gap-2'>
                            <p className='text-xs text-muted-foreground'>Voice message ready · {formatVoiceDuration(pendingVoiceComment.durationMs)}</p>
                            <button
                              type='button'
                              onClick={() =>
                                setPendingVoiceComment((current) => {
                                  if (current) URL.revokeObjectURL(current.previewUrl)
                                  return null
                                })
                              }
                              className='inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground'
                              aria-label='Remove voice message'
                            >
                              <X className='h-3.5 w-3.5' />
                            </button>
                          </div>
                          <audio controls src={pendingVoiceComment.previewUrl} className='mt-1 h-8 w-full' />
                        </div>
                      ) : null}
                      {voiceCommentError ? <p className='text-xs text-rose-300'>{voiceCommentError}</p> : null}
                    <div className='flex items-center gap-2'>
                      <Avatar className='mt-0.5 h-7 w-7 border'>
                        {activeCommentAuthor.avatarUrl ? <AvatarImage src={activeCommentAuthor.avatarUrl} alt={activeCommentAuthor.name} /> : null}
                        <AvatarFallback className='text-[10px] font-semibold'>{initialsForName(activeCommentAuthor.name)}</AvatarFallback>
                      </Avatar>
                      <Input
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addCommentToTask()
                          }
                        }}
                        placeholder='Add a comment...'
                        className='h-9 w-full rounded-full border bg-background px-3 text-sm'
                      />
                      <Popover open={commentEmojiOpen} onOpenChange={setCommentEmojiOpen}>
                        <PopoverTrigger asChild>
                          <Button type='button' size='sm' variant='outline' className='h-9 w-9 shrink-0 rounded-full px-0' aria-label='Add emoji'>
                            <Smile className='h-4 w-4' />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className='w-auto p-1.5' align='end'>
                          <div className='flex items-center gap-1'>
                            {COMMENT_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type='button'
                                onClick={() => {
                                  setCommentDraft((value) => `${value}${emoji}`)
                                  setCommentEmojiOpen(false)
                                }}
                                className='inline-flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-accent'
                                aria-label={`Insert ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        className={cn(
                          'h-9 w-9 shrink-0 rounded-full px-0',
                          isRecordingVoiceComment && 'border-rose-500/60 bg-rose-500/10 text-rose-300',
                        )}
                        onClick={isRecordingVoiceComment ? stopVoiceCommentRecording : () => void startVoiceCommentRecording()}
                        aria-label={isRecordingVoiceComment ? 'Stop recording' : 'Record voice message'}
                      >
                        {isRecordingVoiceComment ? <Square className='h-4 w-4' /> : <Mic className='h-4 w-4' />}
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        className='h-9 w-9 shrink-0 rounded-full px-0'
                        onClick={addCommentToTask}
                        disabled={!commentDraft.trim() && !pendingVoiceComment}
                        aria-label='Send comment'
                      >
                        <Send className='h-4 w-4' />
                      </Button>
                    </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
