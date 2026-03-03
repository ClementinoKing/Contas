import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/context/auth-context'
import {
  canAccessOnboardingStep,
  getFirstIncompleteOnboardingStep,
  getOnboardingPath,
  getOnboardingStepFromPathname,
} from '@/features/onboarding/lib/onboarding-routes'

export function ProtectedRoute() {
  const { isAuthenticated, loading, currentUser } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className='flex min-h-screen items-center justify-center text-muted-foreground'>Loading workspace...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to='/login' state={{ from: location }} replace />
  }

  const onboarding = currentUser?.onboarding
  const onboardingIncomplete = onboarding?.completed === false
  const isOnboardingPath = location.pathname.startsWith('/onboarding')

  if (onboardingIncomplete && onboarding) {
    if (!isOnboardingPath) {
      const step = getFirstIncompleteOnboardingStep(onboarding)
      return <Navigate to={getOnboardingPath(step)} replace />
    }

    const currentStep = getOnboardingStepFromPathname(location.pathname)
    const firstIncomplete = getFirstIncompleteOnboardingStep(onboarding)
    if (!currentStep) {
      return <Navigate to={getOnboardingPath(firstIncomplete)} replace />
    }

    if (!canAccessOnboardingStep(currentStep, onboarding)) {
      return <Navigate to={getOnboardingPath(firstIncomplete)} replace />
    }
  }

  if (!onboardingIncomplete && isOnboardingPath) {
    return <Navigate to='/dashboard/home' replace />
  }

  return <Outlet />
}

export function AuthRedirectRoute() {
  const { isAuthenticated, loading, currentUser } = useAuth()

  if (loading) {
    return <div className='flex min-h-screen items-center justify-center text-muted-foreground'>Checking session...</div>
  }

  if (isAuthenticated) {
    const onboarding = currentUser?.onboarding
    if (onboarding?.completed === false) {
      return <Navigate to={getOnboardingPath(getFirstIncompleteOnboardingStep(onboarding))} replace />
    }
    return <Navigate to='/dashboard' replace />
  }

  return <Outlet />
}
