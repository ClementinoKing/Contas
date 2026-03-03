import { FolderKanban, Moon, Settings, Sun, UserPlus2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { USER_PROJECTS } from '@/features/projects/projects-data'
import { cn } from '@/lib/utils'

import { InvitePeopleDialog } from './invite-people-dialog'
import { SIDEBAR_SECTIONS } from './navigation-items'

const THEME_STORAGE_KEY = 'contas.ui.theme'
const THEME_TRANSITION_CLASS = 'theme-transition'

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
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

          <NavLink
            to='/dashboard/projects'
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-foreground/90 hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-0',
              )
            }
            title={collapsed ? 'Projects Hub' : undefined}
          >
            <FolderKanban className='h-4 w-4 shrink-0' aria-hidden='true' />
            <span className={cn('ml-3', collapsed && 'sr-only')}>Projects Hub</span>
          </NavLink>

          {USER_PROJECTS.map((project) => (
            <NavLink
              key={project.id}
              to={`/dashboard/projects/${project.id}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-foreground/90 hover:bg-accent hover:text-accent-foreground',
                  collapsed && 'justify-center px-0',
                )
              }
              title={collapsed ? project.name : undefined}
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', project.color)} aria-hidden='true' />
              <span className={cn('ml-3 truncate', collapsed && 'sr-only')}>{project.name}</span>
              <span className={cn('ml-auto text-[10px] text-muted-foreground', collapsed && 'sr-only')}>{project.key}</span>
              <span className={cn('text-[10px] font-semibold', !collapsed && 'hidden')}>{project.key}</span>
            </NavLink>
          ))}
        </section>
      </nav>

      <footer className='border-t bg-muted/40 p-3'>
        <div className={cn('rounded-lg border bg-card p-3', collapsed && 'p-2')}>
          <p className={cn('text-xs font-semibold uppercase tracking-wide text-muted-foreground', collapsed && 'sr-only')}>
            Sidebar Footer
          </p>
          <p className={cn('mt-1 text-sm font-medium text-foreground', collapsed && 'sr-only')}>Product Strategy</p>
          <div
            className={cn(
              'mt-3 flex items-center justify-between gap-2',
              collapsed && 'mt-0 flex-col items-center gap-1.5',
            )}
          >
            <button
              type='button'
              aria-label='Invite'
              onClick={() => setInviteOpen(true)}
              className={cn(
                'inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                collapsed && 'h-8 w-8 justify-center p-0',
              )}
            >
              <UserPlus2 className='h-3.5 w-3.5' aria-hidden='true' />
              <span className={cn('ml-1.5', collapsed && 'sr-only')}>Invite</span>
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
      <InvitePeopleDialog open={inviteOpen} onOpenChange={setInviteOpen} />
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
