import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'

import { STORAGE_KEYS } from '@/lib/storage'
import type { AuthSession, LoginPayload, OnboardingState, RegisterPayload, User } from '@/types/auth'

type AuthState = {
  session: AuthSession | null
  loading: boolean
}

type AuthAction =
  | { type: 'RESTORE_SESSION'; payload: AuthSession | null }
  | { type: 'SET_SESSION'; payload: AuthSession }
  | { type: 'CLEAR_SESSION' }

export interface AuthContextValue {
  session: AuthSession | null
  isAuthenticated: boolean
  currentUser: User | null
  loading: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  updateCurrentUser: (updates: Partial<User>) => void
  updateOnboarding: (updates: Partial<OnboardingState>) => void
  completeOnboarding: () => void
  logout: () => void
}

const initialState: AuthState = {
  session: null,
  loading: true,
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESTORE_SESSION':
      return { session: action.payload, loading: false }
    case 'SET_SESSION':
      return { session: action.payload, loading: false }
    case 'CLEAR_SESSION':
      return { session: null, loading: false }
    default:
      return state
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function buildMockSession({ email, name, tenantId }: { email: string; name: string; tenantId: string }): AuthSession {
  return {
    user: {
      id: crypto.randomUUID(),
      email,
      name,
      tenantId,
    },
    token: `mock_${crypto.randomUUID()}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

function createInitialOnboarding({
  fullName = '',
  completed,
}: {
  fullName?: string
  completed: boolean
}): OnboardingState {
  return {
    completed,
    currentStep: completed ? 'invite' : 'name',
    fullName,
    role: '',
    workFunction: '',
    useCase: '',
    tools: [],
    inviteEmails: [],
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.authSession)
    if (!raw) {
      dispatch({ type: 'RESTORE_SESSION', payload: null })
      return
    }

    try {
      const parsed = JSON.parse(raw) as AuthSession
      const isExpired = new Date(parsed.expiresAt).getTime() < Date.now()
      if (isExpired) {
        localStorage.removeItem(STORAGE_KEYS.authSession)
        dispatch({ type: 'RESTORE_SESSION', payload: null })
        return
      }
      dispatch({ type: 'RESTORE_SESSION', payload: parsed })
    } catch {
      localStorage.removeItem(STORAGE_KEYS.authSession)
      dispatch({ type: 'RESTORE_SESSION', payload: null })
    }
  }, [])

  const setSession = useCallback((session: AuthSession) => {
    localStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(session))
    dispatch({ type: 'SET_SESSION', payload: session })
  }, [])

  const login = useCallback(async ({ email }: LoginPayload) => {
    const tenantId = localStorage.getItem(STORAGE_KEYS.tenantId) ?? 'tenant-acme'
    const mockName = email.split('@')[0]?.replace(/\./g, ' ') ?? 'User'
    const session = buildMockSession({ email, name: mockName, tenantId })
    session.user.onboarding = createInitialOnboarding({ fullName: mockName, completed: true })
    setSession(session)
  }, [setSession])

  const register = useCallback(async ({ name, email }: RegisterPayload) => {
    const tenantId = localStorage.getItem(STORAGE_KEYS.tenantId) ?? 'tenant-acme'
    const session = buildMockSession({ email, name, tenantId })
    session.user.onboarding = createInitialOnboarding({ fullName: name, completed: false })
    setSession(session)
  }, [setSession])

  const updateCurrentUser = useCallback(
    (updates: Partial<User>) => {
      if (!state.session) return

      const updatedSession: AuthSession = {
        ...state.session,
        user: {
          ...state.session.user,
          ...updates,
        },
      }

      setSession(updatedSession)
    },
    [setSession, state.session],
  )

  const updateOnboarding = useCallback(
    (updates: Partial<OnboardingState>) => {
      if (!state.session) return

      const currentOnboarding =
        state.session.user.onboarding ?? createInitialOnboarding({ fullName: state.session.user.name, completed: false })

      const updatedSession: AuthSession = {
        ...state.session,
        user: {
          ...state.session.user,
          onboarding: {
            ...currentOnboarding,
            ...updates,
          },
        },
      }

      setSession(updatedSession)
    },
    [setSession, state.session],
  )

  const completeOnboarding = useCallback(() => {
    updateOnboarding({ completed: true, currentStep: 'invite' })
  }, [updateOnboarding])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.authSession)
    dispatch({ type: 'CLEAR_SESSION' })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session: state.session,
      isAuthenticated: Boolean(state.session),
      currentUser: state.session?.user ?? null,
      loading: state.loading,
      login,
      register,
      updateCurrentUser,
      updateOnboarding,
      completeOnboarding,
      logout,
    }),
    [completeOnboarding, login, logout, register, state.loading, state.session, updateCurrentUser, updateOnboarding],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
