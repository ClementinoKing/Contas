import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AuthRedirectRoute, ProtectedRoute } from './route-guards'
import { DashboardHomePage } from '@/features/dashboard/pages/dashboard-home-page'
import { MyTasksPage } from '@/features/dashboard/pages/my-tasks-page'
import { ProjectDetailPage } from '@/features/dashboard/pages/project-detail-page'
import { ProjectsPage } from '@/features/dashboard/pages/projects-page'
import { DashboardSectionPage } from '@/features/dashboard/pages/dashboard-section-page'
import { LoginPage } from '@/features/auth/pages/login-page'
import { RegisterPage } from '@/features/auth/pages/register-page'
import { AppShellLayout } from '@/features/layout/components/app-shell-layout'
import { SettingsPage } from '@/features/settings/pages/settings-page'

function NotFoundPage() {
  return (
    <main className='flex min-h-screen items-center justify-center p-6'>
      <div className='space-y-2 text-center'>
        <p className='text-sm font-semibold uppercase tracking-wide text-muted-foreground'>404</p>
        <h1 className='text-2xl font-semibold'>Page not found</h1>
      </div>
    </main>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to='/dashboard' replace />,
  },
  {
    element: <AuthRedirectRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/dashboard',
        element: <AppShellLayout />,
        children: [
          { index: true, element: <Navigate to='home' replace /> },
          { path: 'home', element: <DashboardHomePage /> },
          { path: 'my-tasks', element: <MyTasksPage /> },
          { path: 'notifications', element: <DashboardSectionPage title='Notifications' /> },
          { path: 'reporting', element: <DashboardSectionPage title='Reporting' /> },
          { path: 'portfolio', element: <DashboardSectionPage title='Portfolio' /> },
          { path: 'goals', element: <DashboardSectionPage title='Goals' /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:projectId', element: <ProjectDetailPage /> },
          { path: 'workspace', element: <DashboardSectionPage title='Workspace' /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
