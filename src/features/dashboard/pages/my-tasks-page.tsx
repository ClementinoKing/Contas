import {
  Activity,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  KanbanSquare,
  List,
  MessageSquare,
  NotebookPen,
  Paperclip,
  Pencil,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TASK_ROWS, type TaskRow } from '@/features/tasks/tasks-data'
import { cn } from '@/lib/utils'

type TaskTab = 'list' | 'board' | 'calendar' | 'notes'
type CalendarView = 'daily' | 'weekly' | 'monthly' | 'yearly'
type BoardSavedView = 'all' | 'my-open' | 'due-soon'
type BoardDueFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'none'
type BoardCompletionFilter = 'all' | 'open' | 'completed'

type BoardComment = {
  id: string
  author: string
  content: string
  createdAt: string
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

type BoardColumn = { id: string; title: string; items: BoardTask[] }
type BoardTaskDraft = { title: string; due: string; assignee: string; description: string }
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

function makeActivity(message: string): BoardActivity {
  return {
    id: `act-${crypto.randomUUID()}`,
    message,
    createdAt: nowTimeLabel(),
  }
}

const INITIAL_BOARD_COLUMNS: BoardColumn[] = [
  {
    id: 'todo',
    title: 'To Do',
    items: [
      {
        id: 'b-1',
        title: 'Set reporting baseline',
        due: 'Mar 6',
        assignee: 'Lina',
        description: 'Baseline metrics for weekly project reporting and risk visibility.',
        completed: false,
        comments: [{ id: 'c-1', author: 'Lina', content: 'I will draft the first report structure today.', createdAt: 'Mar 2, 10:15 AM' }],
        activity: [makeActivity('Task created in To Do')],
      },
      {
        id: 'b-2',
        title: 'Collect launch assets',
        due: 'Mar 8',
        assignee: 'James',
        description: 'Gather approved visual assets and copy for launch tasks.',
        completed: false,
        comments: [],
        activity: [makeActivity('Task created in To Do')],
      },
    ],
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    items: [
      {
        id: 'b-3',
        title: 'Align sprint milestones',
        due: 'Today',
        assignee: 'Maya',
        description: 'Map sprint outcomes to release milestones and dependencies.',
        completed: false,
        comments: [{ id: 'c-2', author: 'Maya', content: 'Need final sign-off from stakeholders by EOD.', createdAt: 'Mar 2, 09:40 AM' }],
        activity: [makeActivity('Moved to In Progress')],
      },
      {
        id: 'b-4',
        title: 'Consolidate stakeholder feedback',
        due: 'Mar 5',
        assignee: 'Noah',
        description: 'Summarize feedback from product, engineering, and marketing teams.',
        completed: false,
        comments: [],
        activity: [makeActivity('Task created in In Progress')],
      },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    items: [
      {
        id: 'b-5',
        title: 'QA checklist update',
        due: 'Completed',
        assignee: 'Lina',
        description: 'Checklist refreshed with deployment and rollback verification.',
        completed: true,
        comments: [],
        activity: [makeActivity('Task marked complete')],
      },
    ],
  },
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

function taskHoverDetails(task: TaskRow) {
  return {
    range: formatRange(task),
  }
}

function parseBoardDueDate(due: string) {
  const label = due.trim()
  if (!label || label === 'No due date' || label === 'Completed') return null
  if (label === 'Today') return startOfDay(new Date())

  const year = new Date().getFullYear()
  const parsed = new Date(`${label}, ${year}`)
  if (Number.isNaN(parsed.getTime())) return null
  return startOfDay(parsed)
}

function TaskHoverCard({ task, align = 'left' }: { task: TaskRow; align?: HoverAlign }) {
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
        <p className='text-xs text-muted-foreground'>{task.id}</p>
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
        <Badge variant='outline'>{task.status}</Badge>
        <Link to={`/dashboard/projects/${task.projectId}`} className='text-xs font-medium text-primary'>
          Open project
        </Link>
      </div>
    </div>
  )
}

export function MyTasksPage() {
  const [activeTab, setActiveTab] = useState<TaskTab>('list')
  const [calendarView, setCalendarView] = useState<CalendarView>('monthly')
  const [calendarDate, setCalendarDate] = useState<Date>(() => startOfDay(new Date()))

  const [boardColumns, setBoardColumns] = useState<BoardColumn[]>(INITIAL_BOARD_COLUMNS)
  const [newColumnName, setNewColumnName] = useState('')
  const [draggingTask, setDraggingTask] = useState<{ taskId: string; fromColumnId: string } | null>(null)
  const [columnTaskDrafts, setColumnTaskDrafts] = useState<Record<string, BoardTaskDraft>>({})

  const [editingTask, setEditingTask] = useState<{ columnId: string; taskId: string } | null>(null)
  const [editingTaskDraft, setEditingTaskDraft] = useState<BoardTaskDraft>({ title: '', due: '', assignee: '', description: '' })

  const [savedBoardView, setSavedBoardView] = useState<BoardSavedView>('all')
  const [boardSearch, setBoardSearch] = useState('')
  const [boardAssigneeFilter, setBoardAssigneeFilter] = useState('all')
  const [boardDueFilter, setBoardDueFilter] = useState<BoardDueFilter>('all')
  const [boardCompletionFilter, setBoardCompletionFilter] = useState<BoardCompletionFilter>('all')

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [bulkMoveTargetColumnId, setBulkMoveTargetColumnId] = useState('')
  const [bulkAssignValue, setBulkAssignValue] = useState('')

  const [activeTaskRef, setActiveTaskRef] = useState<{ columnId: string; taskId: string } | null>(null)
  const [detailDraft, setDetailDraft] = useState<BoardTaskDraft>({ title: '', due: '', assignee: '', description: '' })
  const [commentDraft, setCommentDraft] = useState('')

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

  const dailyTasks = useMemo(() => TASK_ROWS.filter((task) => spansDate(task, calendarDate)), [calendarDate])

  const weeklyTasks = useMemo(
    () => TASK_ROWS.filter((task) => intersectsRange(task, weekStart, weekEnd)),
    [weekStart, weekEnd],
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

  const boardMatchesFilters = (task: BoardTask) => {
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
  }

  const visibleBoardColumns = useMemo(
    () =>
      boardColumns.map((column) => ({
        ...column,
        items: column.items.filter(boardMatchesFilters),
      })),
    [boardColumns, boardSearch, boardAssigneeFilter, boardDueFilter, boardCompletionFilter, savedBoardView],
  )

  const selectedTasksCount = selectedTaskIds.length

  const getColumnDraft = (columnId: string): BoardTaskDraft =>
    columnTaskDrafts[columnId] ?? { title: '', due: '', assignee: '', description: '' }

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

  const markSelectedCompleted = () => {
    if (selectedTaskSet.size === 0) return
    updateSelectedTasks((task) => ({
      ...task,
      completed: true,
      activity: [makeActivity('Marked complete from bulk action'), ...task.activity],
    }))
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

  const moveSelectedTasks = () => {
    if (!bulkMoveTargetColumnId || selectedTaskSet.size === 0) return

    setBoardColumns((columns) => {
      const selectedItems = columns
        .flatMap((column) => column.items)
        .filter((item) => selectedTaskSet.has(item.id))
        .map((item) => ({
          ...item,
          activity: [makeActivity('Moved via bulk action'), ...item.activity],
        }))

      return columns.map((column) => {
        if (column.id === bulkMoveTargetColumnId) {
          const dedupedExisting = column.items.filter((item) => !selectedTaskSet.has(item.id))
          return { ...column, items: [...dedupedExisting, ...selectedItems] }
        }
        return {
          ...column,
          items: column.items.filter((item) => !selectedTaskSet.has(item.id)),
        }
      })
    })

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

  const handleBoardDrop = (toColumnId: string) => {
    if (!draggingTask) return

    setBoardColumns((columns) => {
      const sourceColumn = columns.find((column) => column.id === draggingTask.fromColumnId)
      const task = sourceColumn?.items.find((item) => item.id === draggingTask.taskId)

      if (!sourceColumn || !task || draggingTask.fromColumnId === toColumnId) {
        return columns
      }

      return columns.map((column) => {
        if (column.id === draggingTask.fromColumnId) {
          return {
            ...column,
            items: column.items.filter((item) => item.id !== draggingTask.taskId),
          }
        }
        if (column.id === toColumnId) {
          return {
            ...column,
            items: [...column.items, { ...task, activity: [makeActivity(`Moved to ${column.title}`), ...task.activity] }],
          }
        }
        return column
      })
    })

    setDraggingTask(null)
  }

  const handleAddBoardColumn = () => {
    const trimmedName = newColumnName.trim()
    if (!trimmedName) return

    setBoardColumns((columns) => [
      ...columns,
      {
        id: `col-${crypto.randomUUID()}`,
        title: trimmedName,
        items: [],
      },
    ])
    setNewColumnName('')
  }

  const handleAddTaskToColumn = (columnId: string) => {
    const draft = getColumnDraft(columnId)
    const title = draft.title.trim()
    if (!title) return

    const nextTask: BoardTask = {
      id: `task-${crypto.randomUUID()}`,
      title,
      due: draft.due.trim() || 'No due date',
      assignee: draft.assignee.trim() || 'Unassigned',
      description: draft.description.trim() || 'No description yet.',
      completed: false,
      comments: [],
      activity: [makeActivity('Task added from board column')],
    }

    setBoardColumns((columns) =>
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              items: [...column.items, nextTask],
            }
          : column,
      ),
    )

    setColumnTaskDrafts((drafts) => ({
      ...drafts,
      [columnId]: { title: '', due: '', assignee: '', description: '' },
    }))
  }

  const toggleBoardTaskCompleted = (columnId: string, taskId: string) => {
    setBoardColumns((columns) =>
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              items: column.items.map((item) =>
                item.id === taskId
                  ? {
                      ...item,
                      completed: !item.completed,
                      activity: [
                        makeActivity(item.completed ? 'Marked incomplete' : 'Marked complete'),
                        ...item.activity,
                      ],
                    }
                  : item,
              ),
            }
          : column,
      ),
    )
  }

  const startEditingBoardTask = (columnId: string, task: BoardTask) => {
    setEditingTask({ columnId, taskId: task.id })
    setEditingTaskDraft({
      title: task.title,
      due: task.due,
      assignee: task.assignee,
      description: task.description,
    })
  }

  const saveEditingBoardTask = () => {
    if (!editingTask) return
    const nextTitle = editingTaskDraft.title.trim()
    if (!nextTitle) return

    setBoardColumns((columns) =>
      columns.map((column) =>
        column.id === editingTask.columnId
          ? {
              ...column,
              items: column.items.map((item) =>
                item.id === editingTask.taskId
                  ? {
                      ...item,
                      title: nextTitle,
                      due: editingTaskDraft.due.trim() || 'No due date',
                      assignee: editingTaskDraft.assignee.trim() || 'Unassigned',
                      description: editingTaskDraft.description.trim() || 'No description yet.',
                      activity: [makeActivity('Task updated from inline edit'), ...item.activity],
                    }
                  : item,
              ),
            }
          : column,
      ),
    )
    setEditingTask(null)
    setEditingTaskDraft({ title: '', due: '', assignee: '', description: '' })
  }

  const cancelEditingBoardTask = () => {
    setEditingTask(null)
    setEditingTaskDraft({ title: '', due: '', assignee: '', description: '' })
  }

  const openTaskDetails = (columnId: string, task: BoardTask) => {
    setActiveTaskRef({ columnId, taskId: task.id })
    setDetailDraft({
      title: task.title,
      due: task.due,
      assignee: task.assignee,
      description: task.description,
    })
    setCommentDraft('')
  }

  const closeTaskDetails = () => {
    setActiveTaskRef(null)
    setCommentDraft('')
  }

  const activeTaskData = useMemo(() => {
    if (!activeTaskRef) return null
    const column = boardColumns.find((item) => item.id === activeTaskRef.columnId)
    if (!column) return null
    const task = column.items.find((item) => item.id === activeTaskRef.taskId)
    if (!task) return null
    return { column, task }
  }, [activeTaskRef, boardColumns])

  const saveDetailTask = () => {
    if (!activeTaskRef) return
    const title = detailDraft.title.trim()
    if (!title) return

    setBoardColumns((columns) =>
      columns.map((column) =>
        column.id === activeTaskRef.columnId
          ? {
              ...column,
              items: column.items.map((item) =>
                item.id === activeTaskRef.taskId
                  ? {
                      ...item,
                      title,
                      due: detailDraft.due.trim() || 'No due date',
                      assignee: detailDraft.assignee.trim() || 'Unassigned',
                      description: detailDraft.description.trim() || 'No description yet.',
                      activity: [makeActivity('Task details updated'), ...item.activity],
                    }
                  : item,
              ),
            }
          : column,
      ),
    )
  }

  const addCommentToTask = () => {
    if (!activeTaskRef) return
    const content = commentDraft.trim()
    if (!content) return

    const comment: BoardComment = {
      id: `comment-${crypto.randomUUID()}`,
      author: BOARD_ME_ASSIGNEE,
      content,
      createdAt: nowTimeLabel(),
    }

    setBoardColumns((columns) =>
      columns.map((column) =>
        column.id === activeTaskRef.columnId
          ? {
              ...column,
              items: column.items.map((item) =>
                item.id === activeTaskRef.taskId
                  ? {
                      ...item,
                      comments: [comment, ...item.comments],
                      activity: [makeActivity('Comment added'), ...item.activity],
                    }
                  : item,
              ),
            }
          : column,
      ),
    )

    setCommentDraft('')
  }

  const renderCalendarContent = () => {
    if (calendarView === 'daily') {
      return (
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Daily Agenda</CardTitle>
            <CardDescription>
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }).format(calendarDate)}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {dailyTasks.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No tasks scheduled for this day.</p>
            ) : (
              dailyTasks.map((task) => (
                <article key={task.id} className='rounded-md border bg-muted/15 p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <p className='font-medium text-foreground'>{task.title}</p>
                    <Badge variant='outline'>{task.status}</Badge>
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
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Weekly Timeline</CardTitle>
            <CardDescription>
              {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(weekStart)}
              {' - '}
              {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(weekEnd)}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='grid grid-cols-7 gap-2'>
              {Array.from({ length: 7 }, (_, index) => {
                const day = addDays(weekStart, index)
                const dayTasks = TASK_ROWS.filter((task) => spansDate(task, day)).length
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
                        <span>{task.title}</span>
                        <span>{formatRange(task)}</span>
                      </div>
                      <div className='group relative h-7 rounded-md bg-muted/25'>
                        <div
                          className={cn('absolute top-1 h-5 rounded px-2 text-[11px] font-medium text-white', calendarBarTone(task.status))}
                          style={{
                            left: `${(startOffset / 7) * 100}%`,
                            width: `${(spanDays / 7) * 100}%`,
                          }}
                        >
                          <div className='truncate leading-5'>{task.projectName}</div>
                        </div>
                        <TaskHoverCard task={task} align={hoverAlign} />
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
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Monthly Calendar</CardTitle>
            <CardDescription>Task bars continue through all active dates.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-7 gap-2 pb-2'>
              {WEEKDAY_LABELS.map((label) => (
                <p key={label} className='text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                  {label}
                </p>
              ))}
            </div>
            <div className='grid grid-cols-7 gap-2'>
              {monthDays.map((day, index) => {
                const dayTasks = TASK_ROWS.filter((task) => spansDate(task, day))
                const outside = day.getMonth() !== calendarDate.getMonth()
                const today = isSameDay(day, new Date())
                const columnIndex = index % 7
                const hoverAlign: HoverAlign = columnIndex >= 5 ? 'right' : columnIndex <= 1 ? 'left' : 'center'

                return (
                  <div
                    key={day.toISOString()}
                    className={cn('min-h-[90px] rounded-md border bg-card p-1.5', outside && 'bg-muted/15 text-muted-foreground')}
                  >
                    <p
                      className={cn(
                        'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                        today && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {day.getDate()}
                    </p>
                    <div className='space-y-1'>
                      {dayTasks.slice(0, 2).map((task) => (
                        <div key={`${task.id}-${day.toISOString()}`} className='group relative'>
                          <div className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium text-white', calendarBarTone(task.status))}>
                            <span className='truncate'>{task.projectName}</span>
                          </div>
                          <TaskHoverCard task={task} align={hoverAlign} />
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
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Yearly Overview</CardTitle>
          <CardDescription>{calendarDate.getFullYear()} workload by month.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {yearMonths.map((monthDate) => {
            const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
            const monthTasks = TASK_ROWS.filter((task) => intersectsRange(task, monthStart, monthEnd))

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
                      <p className='truncate text-xs text-muted-foreground'>{task.title}</p>
                      <TaskHoverCard task={task} align='right' />
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
                      <button
                        type='button'
                        onClick={() => selectVisibleTasksInColumn(column.id)}
                        className='text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'
                      >
                        {allVisibleSelected ? 'Clear' : 'Select all'}
                      </button>
                    </div>
                    <CardDescription>{column.items.length} shown</CardDescription>
                  </CardHeader>

                  <CardContent className='space-y-2'>
                    {column.items.length === 0 ? (
                      <div className='rounded-md border border-dashed p-3 text-xs text-muted-foreground'>
                        Drop or add tasks here
                      </div>
                    ) : null}

                    {column.items.map((item) => (
                      <article
                        key={item.id}
                        draggable
                        onDragStart={() => handleBoardDragStart(item.id, column.id)}
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
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleBoardTaskCompleted(column.id, item.id)
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
                                    <Input
                                      value={editingTaskDraft.due}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setEditingTaskDraft((draft) => ({ ...draft, due: event.target.value }))
                                      }
                                      className='h-8'
                                      placeholder='Due date'
                                    />
                                    <Input
                                      value={editingTaskDraft.assignee}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) =>
                                        setEditingTaskDraft((draft) => ({ ...draft, assignee: event.target.value }))
                                      }
                                      className='h-8'
                                      placeholder='Assignee'
                                    />
                                  </div>
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
                                    <Button type='button' size='sm' className='h-7 px-2 text-xs' onClick={saveEditingBoardTask}>
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

                          {!(editingTask?.columnId === column.id && editingTask?.taskId === item.id) ? (
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
                          )}
                        </div>
                      </article>
                    ))}

                    <div className='space-y-2 border-t pt-2'>
                      <Input
                        value={getColumnDraft(column.id).title}
                        onChange={(event) =>
                          setColumnTaskDrafts((drafts) => ({
                            ...drafts,
                            [column.id]: {
                              ...getColumnDraft(column.id),
                              title: event.target.value,
                            },
                          }))
                        }
                        placeholder='Add a task...'
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            handleAddTaskToColumn(column.id)
                          }
                        }}
                      />
                      <div className='grid grid-cols-2 gap-2'>
                        <Input
                          value={getColumnDraft(column.id).due}
                          onChange={(event) =>
                            setColumnTaskDrafts((drafts) => ({
                              ...drafts,
                              [column.id]: {
                                ...getColumnDraft(column.id),
                                due: event.target.value,
                              },
                            }))
                          }
                          placeholder='Due date'
                        />
                        <Input
                          value={getColumnDraft(column.id).assignee}
                          onChange={(event) =>
                            setColumnTaskDrafts((drafts) => ({
                              ...drafts,
                              [column.id]: {
                                ...getColumnDraft(column.id),
                                assignee: event.target.value,
                              },
                            }))
                          }
                          placeholder='Assignee'
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={getColumnDraft(column.id).description}
                        onChange={(event) =>
                          setColumnTaskDrafts((drafts) => ({
                            ...drafts,
                            [column.id]: {
                              ...getColumnDraft(column.id),
                              description: event.target.value,
                            },
                          }))
                        }
                        placeholder='Description'
                        className='w-full rounded-md border bg-background px-3 py-2 text-xs'
                      />
                      <Button type='button' variant='outline' className='w-full' onClick={() => handleAddTaskToColumn(column.id)}>
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
    switch (activeTab) {
      case 'list':
        return (
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Task List</CardTitle>
              <CardDescription>Compact table for quick tracking and updates.</CardDescription>
            </CardHeader>
            <CardContent className='p-0'>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead className='border-y bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <tr>
                      <th className='px-4 py-2 font-medium'>Task</th>
                      <th className='px-4 py-2 font-medium'>Project</th>
                      <th className='px-4 py-2 font-medium'>Owner</th>
                      <th className='px-4 py-2 font-medium'>Due</th>
                      <th className='px-4 py-2 font-medium'>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TASK_ROWS.map((task) => (
                      <tr key={task.id} className='border-b last:border-b-0'>
                        <td className='px-4 py-2.5'>
                          <div>
                            <p className='font-medium text-foreground'>{task.title}</p>
                            <p className='text-xs text-muted-foreground'>{task.id}</p>
                          </div>
                        </td>
                        <td className='px-4 py-2.5'>
                          <Link to={`/dashboard/projects/${task.projectId}`} className='text-xs font-medium text-primary hover:underline'>
                            {task.projectName}
                          </Link>
                        </td>
                        <td className='px-4 py-2.5'>{task.owner}</td>
                        <td className='px-4 py-2.5'>{task.due}</td>
                        <td className='px-4 py-2.5'>
                          <Badge variant='outline'>{task.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
      <div className='space-y-4'>
        <Card>
          <CardContent className='p-2'>
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
          </CardContent>
        </Card>

        {activeTab === 'board' ? (
          <Card>
            <CardContent className='flex items-center justify-between p-3 text-sm text-muted-foreground'>
              <span>{totalTasksCount} total tasks across board</span>
              <span>{selectedTasksCount} selected • Press and hold a task to select</span>
            </CardContent>
          </Card>
        ) : null}

        {renderContent()}
      </div>

      <Dialog open={Boolean(activeTaskData)} onOpenChange={(open) => (!open ? closeTaskDetails() : undefined)}>
        <DialogContent className='left-auto right-0 top-0 h-screen max-w-2xl translate-x-0 translate-y-0 rounded-none border-l p-0'>
          {activeTaskData ? (
            <div className='flex h-full flex-col'>
              <DialogHeader className='border-b px-5 py-4'>
                <DialogTitle>Task Details</DialogTitle>
                <DialogDescription>
                  {activeTaskData.column.title}
                </DialogDescription>
              </DialogHeader>

              <div className='grid h-full min-h-0 gap-0 md:grid-cols-[1.4fr_1fr]'>
                <div className='space-y-3 overflow-y-auto p-5'>
                  <Input
                    value={detailDraft.title}
                    onChange={(event) => setDetailDraft((draft) => ({ ...draft, title: event.target.value }))}
                    placeholder='Task title'
                  />
                  <div className='grid grid-cols-2 gap-2'>
                    <Input
                      value={detailDraft.due}
                      onChange={(event) => setDetailDraft((draft) => ({ ...draft, due: event.target.value }))}
                      placeholder='Due date'
                    />
                    <Input
                      value={detailDraft.assignee}
                      onChange={(event) => setDetailDraft((draft) => ({ ...draft, assignee: event.target.value }))}
                      placeholder='Assignee'
                    />
                  </div>
                  <textarea
                    rows={8}
                    value={detailDraft.description}
                    onChange={(event) => setDetailDraft((draft) => ({ ...draft, description: event.target.value }))}
                    placeholder='Description'
                    className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                  />

                  <div className='flex items-center gap-2'>
                    <Button type='button' onClick={saveDetailTask}>Save Changes</Button>
                    <Button type='button' variant='outline' onClick={closeTaskDetails}>Close</Button>
                  </div>
                </div>

                <div className='flex min-h-0 flex-col border-l'>
                  <div className='border-b p-4'>
                    <div className='mb-2 inline-flex items-center gap-1 text-sm font-semibold'>
                      <MessageSquare className='h-4 w-4' />
                      Comments
                    </div>
                    <div className='flex items-start gap-2'>
                      <textarea
                        rows={2}
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        placeholder='Add a comment...'
                        className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                      />
                      <Button type='button' size='sm' onClick={addCommentToTask}>Add</Button>
                    </div>
                  </div>

                  <div className='min-h-0 flex-1 overflow-y-auto p-4'>
                    <div className='space-y-3'>
                      {activeTaskData.task.comments.length === 0 ? (
                        <p className='text-xs text-muted-foreground'>No comments yet.</p>
                      ) : (
                        activeTaskData.task.comments.map((comment) => (
                          <article key={comment.id} className='rounded-md border p-2.5'>
                            <div className='mb-1 flex items-center justify-between gap-2 text-xs'>
                              <span className='font-medium'>{comment.author}</span>
                              <span className='text-muted-foreground'>{comment.createdAt}</span>
                            </div>
                            <p className='text-sm text-foreground'>{comment.content}</p>
                          </article>
                        ))
                      )}
                    </div>

                    <div className='mt-5'>
                      <div className='mb-2 inline-flex items-center gap-1 text-sm font-semibold'>
                        <Activity className='h-4 w-4' />
                        Activity
                      </div>
                      <div className='space-y-2'>
                        {activeTaskData.task.activity.slice(0, 12).map((log) => (
                          <div key={log.id} className='rounded-md border bg-muted/20 p-2 text-xs'>
                            <p className='text-foreground'>{log.message}</p>
                            <p className='text-muted-foreground'>{log.createdAt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
