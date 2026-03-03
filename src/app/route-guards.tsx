import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/context/auth-context'

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className='flex min-h-screen items-center justify-center text-muted-foreground'>Loading workspace...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to='/login' state={{ from: location }} replace />
  }

  return <Outlet />
}

export function AuthRedirectRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className='flex min-h-screen items-center justify-center text-muted-foreground'>Checking session...</div>
  }

  if (isAuthenticated) {
    return <Navigate to='/dashboard' replace />
  }

  return <Outlet />
}
