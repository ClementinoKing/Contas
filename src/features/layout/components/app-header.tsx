import {
  AtSign,
  Bell,
  CirclePlus,
  Goal,
  HelpCircle,
  Layers,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Search,
  UserPlus2,
} from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { USER_PROJECTS } from '@/features/projects/projects-data'

import { AccountMenu } from './account-menu'
import { InvitePeopleDialog } from './invite-people-dialog'

const PROJECT_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from a clean setup and customize everything.',
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Milestones, marketing timeline, and release checklist.',
  },
  {
    id: 'sprint-planning',
    name: 'Sprint Planning',
    description: 'Backlog grooming, sprint goals, and review flow.',
  },
  {
    id: 'campaign',
    name: 'Campaign Ops',
    description: 'Content pipeline, approvals, and channel coordination.',
  },
] as const

type ProjectStep = 1 | 2 | 3

type ProjectTemplateId = (typeof PROJECT_TEMPLATES)[number]['id']

export function AppHeader({
  onDesktopToggle,
  onMobileToggle,
}: {
  onDesktopToggle: () => void
  onMobileToggle: () => void
}) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const [selectedAttachment, setSelectedAttachment] = useState('')
  const [descriptionDueDate, setDescriptionDueDate] = useState<Date | undefined>()

  const [projectStep, setProjectStep] = useState<ProjectStep>(1)
  const [projectTemplate, setProjectTemplate] = useState<ProjectTemplateId>('blank')
  const [projectName, setProjectName] = useState('')
  const [projectOwner, setProjectOwner] = useState('')
  const [projectStartDate, setProjectStartDate] = useState<Date | undefined>()
  const [projectEndDate, setProjectEndDate] = useState<Date | undefined>()
  const [projectDescription, setProjectDescription] = useState('')

  const resetProjectFlow = () => {
    setProjectStep(1)
    setProjectTemplate('blank')
    setProjectName('')
    setProjectOwner('')
    setProjectStartDate(undefined)
    setProjectEndDate(undefined)
    setProjectDescription('')
  }

  const openCreateProjectModal = () => {
    resetProjectFlow()
    setCreateProjectOpen(true)
  }

  const handleProjectModalChange = (open: boolean) => {
    if (!open) {
      resetProjectFlow()
    }
    setCreateProjectOpen(open)
  }

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateTaskOpen(false)
    navigate('/dashboard/my-tasks')
  }

  const handleCreateProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleProjectModalChange(false)
    navigate('/dashboard/projects')
  }

  const canMoveToStepThree = Boolean(projectName.trim() && projectOwner)
  const selectedTemplate = PROJECT_TEMPLATES.find((template) => template.id === projectTemplate) ?? PROJECT_TEMPLATES[0]

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
                <DropdownMenuItem onSelect={() => navigate('/dashboard/portfolio')}>
                  <Layers className='mr-2 h-4 w-4' aria-hidden='true' />
                  Create Portfolio
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
            <Button variant='ghost' size='icon' aria-label='Notifications'>
              <Bell className='h-5 w-5' aria-hidden='true' />
            </Button>
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

      <Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Add a task and link it to the right project and assignee.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTask} className='space-y-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Task Name</label>
              <Input required placeholder='Enter task title' />
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Assigned To</label>
                <select
                  required
                  className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  defaultValue=''
                >
                  <option value='' disabled>
                    Select teammate
                  </option>
                  <option>Lina</option>
                  <option>James</option>
                  <option>Maya</option>
                  <option>Noah</option>
                </select>
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Project</label>
                <select
                  required
                  className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  defaultValue=''
                >
                  <option value='' disabled>
                    Select project
                  </option>
                  {USER_PROJECTS.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <label className='text-sm font-medium text-foreground'>Description</label>
                <div className='flex items-center gap-1'>
                  <button
                    type='button'
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
                  <DatePicker
                    value={descriptionDueDate}
                    onChange={setDescriptionDueDate}
                    placeholder='Due date'
                    className='h-8 w-[170px] text-xs'
                  />
                </div>
              </div>
              <textarea
                rows={5}
                placeholder='Describe the task... use @ to mention teammates'
                className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              />
              <input
                ref={fileInputRef}
                type='file'
                className='hidden'
                onChange={(event) => setSelectedAttachment(event.target.files?.[0]?.name ?? '')}
              />
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span>{selectedAttachment ? `Attachment: ${selectedAttachment}` : 'No attachment selected'}</span>
                <span>{descriptionDueDate ? `Due: ${descriptionDueDate.toLocaleDateString()}` : 'No due date selected'}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setCreateTaskOpen(false)}>
                Cancel
              </Button>
              <Button type='submit'>Create Task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createProjectOpen} onOpenChange={handleProjectModalChange}>
        <DialogContent className='left-0 top-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 rounded-none p-0'>
          <div className='flex h-full flex-col'>
            <DialogHeader className='border-b px-6 py-4'>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Multi-step setup: template, details, and review.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateProject} className='flex min-h-0 flex-1 flex-col'>
              <div className='border-b px-6 py-4'>
                <div className='flex items-center gap-2 text-xs font-medium text-muted-foreground'>
                  {[1, 2, 3].map((step) => (
                    <div key={step} className='flex items-center gap-2'>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          projectStep >= step ? 'border-primary bg-primary/10 text-primary' : 'border-border'
                        }`}
                      >
                        {step}
                      </span>
                      {step < 3 ? <span className='w-8 border-t border-border' /> : null}
                    </div>
                  ))}
                </div>
                <p className='mt-2 text-sm text-muted-foreground'>
                  {projectStep === 1 && 'Step 1: Pick a project template'}
                  {projectStep === 2 && 'Step 2: Fill in project details'}
                  {projectStep === 3 && 'Step 3: Review and create project'}
                </p>
              </div>

              <section className='min-h-0 flex-1 overflow-y-auto p-5 md:p-6'>
                <div className='mx-auto flex min-h-full w-full max-w-4xl items-center'>
                {projectStep === 1 ? (
                  <div className='w-full space-y-3'>
                    <p className='text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground'>Templates</p>
                    <div className='grid gap-3 md:grid-cols-2'>
                      {PROJECT_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          type='button'
                          onClick={() => setProjectTemplate(template.id)}
                          className={`rounded-lg border p-4 text-left transition-colors ${
                            projectTemplate === template.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-card hover:bg-accent/50'
                          }`}
                        >
                          <p className='text-sm font-medium text-foreground'>{template.name}</p>
                          <p className='mt-1 text-xs text-muted-foreground'>{template.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {projectStep === 2 ? (
                  <div className='grid w-full gap-4 md:grid-cols-2'>
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
                        <option>Lina</option>
                        <option>James</option>
                        <option>Maya</option>
                        <option>Noah</option>
                      </select>
                    </div>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium text-foreground'>Start Date</label>
                      <DatePicker value={projectStartDate} onChange={setProjectStartDate} placeholder='Pick start date' />
                    </div>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium text-foreground'>Target End Date</label>
                      <DatePicker value={projectEndDate} onChange={setProjectEndDate} placeholder='Pick end date' />
                    </div>
                    <div className='space-y-2 md:col-span-2'>
                      <label className='text-sm font-medium text-foreground'>Project Description</label>
                      <textarea
                        rows={7}
                        value={projectDescription}
                        onChange={(event) => setProjectDescription(event.target.value)}
                        placeholder='Describe the project scope, goals, and outcomes.'
                        className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                      />
                    </div>
                  </div>
                ) : null}

                {projectStep === 3 ? (
                  <div className='w-full max-w-3xl space-y-4'>
                    <div className='rounded-lg border bg-card p-4'>
                      <p className='text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground'>Selected Template</p>
                      <p className='mt-2 text-sm font-medium text-foreground'>{selectedTemplate.name}</p>
                      <p className='mt-1 text-xs text-muted-foreground'>{selectedTemplate.description}</p>
                    </div>

                    <div className='rounded-lg border bg-card p-4'>
                      <p className='text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground'>Project Details</p>
                      <div className='mt-3 grid gap-2 text-sm md:grid-cols-2'>
                        <p><span className='text-muted-foreground'>Name:</span> {projectName || '-'}</p>
                        <p><span className='text-muted-foreground'>Owner:</span> {projectOwner || '-'}</p>
                        <p><span className='text-muted-foreground'>Start:</span> {projectStartDate ? projectStartDate.toLocaleDateString() : '-'}</p>
                        <p><span className='text-muted-foreground'>End:</span> {projectEndDate ? projectEndDate.toLocaleDateString() : '-'}</p>
                      </div>
                      <p className='mt-3 text-sm text-muted-foreground'>{projectDescription || 'No description added yet.'}</p>
                    </div>
                  </div>
                ) : null}
                </div>
              </section>

              <DialogFooter className='border-t px-6 py-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    if (projectStep === 1) {
                      handleProjectModalChange(false)
                      return
                    }
                    setProjectStep((step) => (step === 3 ? 2 : 1))
                  }}
                >
                  {projectStep === 1 ? 'Cancel' : 'Back'}
                </Button>
                {projectStep < 3 ? (
                  <Button
                    type='button'
                    onClick={() => setProjectStep((step) => (step === 1 ? 2 : 3))}
                    disabled={projectStep === 2 && !canMoveToStepThree}
                  >
                    Next
                  </Button>
                ) : (
                  <Button type='submit'>Create Project</Button>
                )}
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <InvitePeopleDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
}
