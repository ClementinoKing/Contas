import { FolderKanban, LogOut, Moon, Settings, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import {
  Dialog,
  DialogContent,
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
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { SIDEBAR_SECTIONS } from './navigation-items'

const THEME_STORAGE_KEY = 'contas.ui.theme'
const THEME_TRANSITION_CLASS = 'theme-transition'
const SIDEBAR_PROJECTS_CACHE_KEY_PREFIX = 'contas.sidebar.projects.cache.v1'

type SidebarProject = { id: string; name: string; key: string; color: string | null }

function mapSidebarProjects(data: Array<{ id: string; name: string | null; key: string | null; color: string | null }>) {
  return data.map((project, index) => ({
    id: project.id,
    name: project.name ?? `Project ${index + 1}`,
    key: project.key ?? `P${index + 1}`,
    color: project.color ?? 'bg-blue-500',
  }))
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const { unreadCount } = useUnreadNotifications()
  const projectsCacheKey = `${SIDEBAR_PROJECTS_CACHE_KEY_PREFIX}:${currentUser?.id ?? 'anon'}`
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    if (storedTheme) {
      return storedTheme === 'dark'
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [isDarkMode])

  useEffect(() => {
    let cancelled = false

    try {
      const cached = localStorage.getItem(projectsCacheKey)
      if (cached) {
        const parsed = JSON.parse(cached) as SidebarProject[]
        if (Array.isArray(parsed)) {
          setProjects(parsed)
        }
      }
    } catch {
      // Ignore cache parsing errors and continue with live fetch.
    }

    const loadProjects = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, key, color')
        .order('name', { ascending: true })
      if (cancelled || error || !data) return

      const mapped = mapSidebarProjects(data)
      setProjects(mapped)
      localStorage.setItem(projectsCacheKey, JSON.stringify(mapped))
    }

    void loadProjects()

    const onRealtimeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail
      if (detail?.table !== 'projects') return
      void loadProjects()
    }
    const onProjectCreated = () => {
      void loadProjects()
    }
    window.addEventListener('contas:realtime-change', onRealtimeChange as EventListener)
    window.addEventListener('contas:project-created', onProjectCreated as EventListener)

    return () => {
      cancelled = true
      window.removeEventListener('contas:realtime-change', onRealtimeChange as EventListener)
      window.removeEventListener('contas:project-created', onProjectCreated as EventListener)
    }
  }, [projectsCacheKey])

  const toggleTheme = () => {
    const nextIsDark = !isDarkMode
    document.documentElement.classList.add(THEME_TRANSITION_CLASS)
    document.documentElement.classList.toggle('dark', nextIsDark)
    localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? 'dark' : 'light')
    setIsDarkMode(nextIsDark)
    window.setTimeout(() => {
      document.documentElement.classList.remove(THEME_TRANSITION_CLASS)
    }, 300)
  }

  const openSettings = () => {
    onNavigate?.()
    navigate('/dashboard/settings')
  }

  const handleLogout = async () => {
    onNavigate?.()
    await logout()
    navigate('/login')
  }

  return (
    <>
      <div className='flex h-full flex-col'>
      <div className='px-3 py-4'>
        <p className={cn('px-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground', collapsed && 'sr-only')}>
          Workspace
        </p>
      </div>

      <nav className='flex-1 space-y-4 overflow-y-auto px-2 pb-3'>
        {SIDEBAR_SECTIONS.map((section) => (
          <section key={section.title} className='space-y-1'>
            <p className={cn('px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground', collapsed && 'sr-only')}>
              {section.title}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                    collapsed && 'justify-center px-0',
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon className='h-4 w-4 shrink-0' aria-hidden='true' />
                <span className={cn('ml-3', collapsed && 'sr-only')}>{item.label}</span>
                {item.path === '/dashboard/notifications' && unreadCount > 0 ? (
                  <span
                    className={cn(
                      'ml-auto inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white',
                      collapsed && 'absolute right-2 top-1.5',
                    )}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </section>
        ))}

        <section className='space-y-1'>
          <div className={cn('flex items-center justify-between px-2 pb-1', collapsed && 'justify-center')}>
            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground', collapsed && 'sr-only')}>
              Projects
            </p>
            <button
              type='button'
              onClick={() => navigate('/dashboard/projects')}
              className={cn('text-xs font-medium text-muted-foreground transition-colors hover:text-foreground', collapsed && 'hidden')}
            >
              View all
            </button>
          </div>

          {collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type='button'
                  className='group flex h-9 w-full items-center justify-center rounded-md px-0 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  aria-label='Projects Hub'
                  title='Projects Hub'
                >
                  <FolderKanban className='h-4 w-4 shrink-0' aria-hidden='true' />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side='right' align='start' className='w-72'>
                <div className='flex items-center justify-between px-1 pb-1'>
                  <DropdownMenuLabel className='p-0 text-xs uppercase tracking-[0.14em] text-muted-foreground'>Projects</DropdownMenuLabel>
                  <button
                    type='button'
                    onClick={() => {
                      onNavigate?.()
                      navigate('/dashboard/projects')
                    }}
                    className='text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'
                  >
                    View all
                  </button>
                </div>
                <DropdownMenuSeparator />
                <div className='max-h-72 space-y-1 overflow-auto pr-1'>
                  {projects.length === 0 ? (
                    <p className='px-2 py-2 text-xs text-muted-foreground'>No projects in the system.</p>
                  ) : (
                    projects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onSelect={() => {
                          onNavigate?.()
                          navigate(`/dashboard/projects/${project.id}`)
                        }}
                        className='h-9 px-2.5'
                      >
                        <span className={cn('h-2.5 w-2.5 rounded-full', project.color)} aria-hidden='true' />
                        <span className='ml-2.5 truncate'>{project.name}</span>
                        <span className='ml-auto text-[10px] text-muted-foreground'>{project.key}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <NavLink
              to='/dashboard/projects'
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-foreground/90 hover:bg-accent hover:text-accent-foreground',
                )
              }
              title='Projects Hub'
            >
              <FolderKanban className='h-4 w-4 shrink-0' aria-hidden='true' />
              <span className='ml-3'>Projects Hub</span>
            </NavLink>
          )}

          {!collapsed
            ? projects.map((project) => (
                <NavLink
                  key={project.id}
                  to={`/dashboard/projects/${project.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : 'text-foreground/90 hover:bg-accent hover:text-accent-foreground',
                    )
                  }
                  title={project.name}
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', project.color)} aria-hidden='true' />
                  <span className='ml-3 truncate'>{project.name}</span>
                  <span className='ml-auto text-[10px] text-muted-foreground'>{project.key}</span>
                </NavLink>
              ))
            : null}
          {projects.length === 0 && !collapsed ? <p className='px-3 py-1 text-xs text-muted-foreground'>No projects in the system.</p> : null}
        </section>
      </nav>

      <footer className='border-t bg-muted/40 p-3'>
        <div className={cn('rounded-lg border bg-card p-3', collapsed && 'p-2')}>
          <div className={cn('min-w-0', collapsed && 'sr-only')}>
            <p className='truncate text-sm font-medium text-foreground'>{currentUser?.name ?? 'Organization User'}</p>
            <p className='truncate text-xs text-muted-foreground'>{currentUser?.jobTitle ?? 'Team Member'}</p>
          </div>
          <div
            className={cn(
              'mt-3 flex items-center justify-between gap-2',
              collapsed && 'mt-0 flex-col items-center gap-1.5',
            )}
          >
            <button
              type='button'
              aria-label='Logout'
              onClick={() => void handleLogout()}
              className={cn(
                'inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                collapsed && 'h-8 w-8 justify-center p-0',
              )}
            >
              <LogOut className='h-3.5 w-3.5' aria-hidden='true' />
              <span className={cn('ml-1.5', collapsed && 'sr-only')}>Logout</span>
            </button>
            <div className={cn('flex items-center gap-2', collapsed && 'contents')}>
              <button
                type='button'
                aria-label='Settings'
                onClick={openSettings}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-md border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  collapsed && 'h-8 w-8',
                )}
              >
                <Settings className='h-3.5 w-3.5' aria-hidden='true' />
              </button>
              <button
                type='button'
                aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
                onClick={toggleTheme}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-md border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  collapsed && 'h-8 w-8',
                )}
              >
                <span className='relative h-3.5 w-3.5'>
                  <Sun
                    className={cn(
                      'absolute inset-0 h-3.5 w-3.5 transition-all duration-300',
                      isDarkMode ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
                    )}
                    aria-hidden='true'
                  />
                  <Moon
                    className={cn(
                      'absolute inset-0 h-3.5 w-3.5 transition-all duration-300',
                      isDarkMode ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
                    )}
                    aria-hidden='true'
                  />
                </span>
              </button>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </>
  )
}

export function DesktopSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        'hidden h-[calc(100vh-4rem)] shrink-0 self-start border-r bg-card transition-[width] duration-200 md:sticky md:top-16 md:block',
        collapsed ? 'w-[76px]' : 'w-[224px]',
      )}
      aria-label='Sidebar navigation'
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  )
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='left-0 top-0 h-full w-[86vw] max-w-[320px] translate-x-0 translate-y-0 rounded-none border-r p-0' showClose={false}>
        <DialogTitle className='sr-only'>Sidebar menu</DialogTitle>
        <SidebarContent collapsed={false} onNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
