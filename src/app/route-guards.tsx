import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/context/auth-context'
import { STORAGE_KEYS } from '@/lib/storage'
import {
  canAccessOnboardingStep,
  getFirstIncompleteOnboardingStep,
  getOnboardingPath,
  getOnboardingStepFromPathname,
} from '@/features/onboarding/lib/onboarding-routes'

const LAST_DASHBOARD_PATH_KEY = 'contas.last-dashboard-path'

function getLastDashboardPath() {
  const savedPath = sessionStorage.getItem(LAST_DASHBOARD_PATH_KEY)
  return savedPath && savedPath.startsWith('/dashboard/') ? savedPath : '/dashboard/home'
}

function hasPersistedSupabaseSession() {
  return Boolean(localStorage.getItem(STORAGE_KEYS.supabaseAuthToken))
}

export function ProtectedRoute() {
  const { isAuthenticated, loading, currentUser, hasProfile, profileLoading } = useAuth()
  const location = useLocation()
  const persistedSessionExists = hasPersistedSupabaseSession()

  if (loading || profileLoading) {
    return persistedSessionExists ? <Outlet /> : null
  }

  if (!isAuthenticated) {
    return <Navigate to='/login' state={{ from: location }} replace />
  }

  const onboarding = currentUser?.onboarding
  const onboardingIncomplete = !hasProfile && onboarding?.completed === false
  const isOnboardingPath = location.pathname.startsWith('/onboarding')
  const requiresProfileSetup = !onboarding?.fullName?.trim() || onboarding.fullName.trim().length < 2

  if (onboardingIncomplete && onboarding && isOnboardingPath) {
    const currentStep = getOnboardingStepFromPathname(location.pathname)
    const firstIncomplete = getFirstIncompleteOnboardingStep(onboarding)
    if (!currentStep) {
      return <Navigate to={getOnboardingPath(firstIncomplete)} replace />
    }

    if (requiresProfileSetup && currentStep !== 'name') {
      return <Navigate to='/onboarding/name' replace />
    }

    if (!canAccessOnboardingStep(currentStep, onboarding)) {
      return <Navigate to={getOnboardingPath(firstIncomplete)} replace />
    }
  }

  if (onboardingIncomplete && onboarding && !isOnboardingPath && !persistedSessionExists) {
    if (!isOnboardingPath) {
      const step = getFirstIncompleteOnboardingStep(onboarding)
      return <Navigate to={getOnboardingPath(step)} replace />
    }
  }

  if ((!onboardingIncomplete || hasProfile) && isOnboardingPath) {
    return <Navigate to={getLastDashboardPath()} replace />
  }

  return <Outlet />
}

export function AuthRedirectRoute() {
  const { isAuthenticated, loading, currentUser, hasProfile, profileLoading } = useAuth()

  if (loading || profileLoading) {
    return hasPersistedSupabaseSession() ? null : <Outlet />
  }

  if (isAuthenticated) {
    const onboarding = currentUser?.onboarding
    if (!hasProfile && onboarding?.completed === false) {
      return <Navigate to={getOnboardingPath(getFirstIncompleteOnboardingStep(onboarding))} replace />
    }
    return <Navigate to={getLastDashboardPath()} replace />
  }

  return <Outlet />
}
