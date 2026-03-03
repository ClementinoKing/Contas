import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { useTenant } from '@/features/tenancy/context/tenant-context'

import { useShell } from '../context/shell-context'
import { AppHeader } from './app-header'
import { DesktopSidebar, MobileSidebar } from './app-sidebar'

export function AppShellLayout() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { sidebarCollapsed, toggleSidebar } = useShell()
  const { currentTenant } = useTenant()

  if (location.pathname === '/dashboard') {
    return <Navigate to='/dashboard/home' replace />
  }

  return (
    <div className='min-h-screen bg-muted/35'>
      <AppHeader onDesktopToggle={toggleSidebar} onMobileToggle={() => setMobileOpen(true)} />
      <div className='flex min-h-[calc(100vh-4rem)]'>
        <DesktopSidebar collapsed={sidebarCollapsed} />
        <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

        <main className='min-w-0 flex-1 overflow-x-hidden p-4 md:p-6' aria-label='Dashboard content'>
          <div className='mb-5 flex items-center gap-3'>
            <h1 className='text-xl font-semibold text-foreground'>Project Workspace</h1>
            <Badge variant='secondary'>{currentTenant.name}</Badge>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
