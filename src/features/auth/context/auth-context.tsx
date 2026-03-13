import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

import { STORAGE_KEYS } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { AuthSession, LoginPayload, OnboardingState, RegisterPayload, User } from '@/types/auth'

type AuthState = {
  session: AuthSession | null
  loading: boolean
  hasProfile: boolean
  profileLoading: boolean
}

type AuthAction =
  | { type: 'RESTORE_SESSION'; payload: AuthSession | null }
  | { type: 'SET_SESSION'; payload: AuthSession }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_PROFILE_STATUS'; payload: { hasProfile: boolean; loading: boolean } }

export interface AuthContextValue {
  session: AuthSession | null
  isAuthenticated: boolean
  currentUser: User | null
  loading: boolean
  hasProfile: boolean
  profileLoading: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  updateCurrentUser: (updates: Partial<User>) => void
  updateOnboarding: (updates: Partial<OnboardingState>) => void
  completeOnboarding: (updates?: Partial<OnboardingState>) => Promise<void>
  logout: () => Promise<void>
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESTORE_SESSION':
      return { ...state, session: action.payload, loading: false }
    case 'SET_SESSION':
      return { ...state, session: action.payload, loading: false }
    case 'CLEAR_SESSION':
      return { session: null, loading: false, hasProfile: false, profileLoading: false }
    case 'SET_PROFILE_STATUS':
      return { ...state, hasProfile: action.payload.hasProfile, profileLoading: action.payload.loading }
    default:
      return state
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type ProfileSnapshot = {
  id?: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  username: string | null
  job_title: string | null
}

type CachedProfileSnapshot = ProfileSnapshot & {
  id: string
}

function normalizeOnboardingStep(step?: string | null): OnboardingState['currentStep'] {
  if (step === 'work' || step === 'tools') return step
  return 'name'
}

function generateUsernameCandidate(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split('@')[0] || 'user'
  const base = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^_+|_+$/g, '')

  return base || 'user'
}

function isDirectAvatarUrl(value?: string | null) {
  if (!value) return false
  return value.startsWith('http://') || value.startsWith('https://')
}

function isDataAvatarUrl(value?: string | null) {
  if (!value) return false
  return value.startsWith('data:')
}

function sanitizeAvatarUrl(value?: string | null) {
  return isDirectAvatarUrl(value) ? value ?? undefined : undefined
}

function sanitizeAvatarPath(value?: string | null) {
  if (!value || isDirectAvatarUrl(value) || isDataAvatarUrl(value)) return undefined
  return value ?? undefined
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
    currentStep: completed ? 'tools' : 'name',
    fullName,
    role: '',
    workFunction: '',
    useCase: '',
    tools: [],
  }
}

function readCachedProfile(userId: string): CachedProfileSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.profileCache)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedProfileSnapshot
    return parsed.id === userId ? parsed : null
  } catch {
    return null
  }
}

function writeCachedProfile(profile: CachedProfileSnapshot) {
  localStorage.setItem(STORAGE_KEYS.profileCache, JSON.stringify(profile))
}

function clearCachedProfile() {
  localStorage.removeItem(STORAGE_KEYS.profileCache)
}

function cacheProfileFromUser(user: User) {
  writeCachedProfile({
    id: user.id,
    full_name: user.name,
    email: user.email,
    avatar_url: user.avatarUrl ?? user.avatarPath ?? null,
    username: user.username ?? null,
    job_title: user.jobTitle ?? null,
  })
}

function extractStoredSupabaseSession() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.supabaseAuthToken) ??
      localStorage.getItem(STORAGE_KEYS.supabaseAuthTokenLegacy)
    if (!raw) return null

    const parsed = JSON.parse(raw) as
      | Session
      | { currentSession?: Session | null }
      | { session?: Session | null }
      | null

    if (!parsed) return null
    if ('access_token' in parsed && 'user' in parsed) return parsed as Session
    if ('currentSession' in parsed && parsed.currentSession) return parsed.currentSession
    if ('session' in parsed && parsed.session) return parsed.session
    return null
  } catch {
    return null
  }
}

function mapSupabaseSession(session: Session): AuthSession {
  const metadata = session.user.user_metadata ?? {}
  const email = session.user.email ?? 'user@example.com'
  const cachedProfile = readCachedProfile(session.user.id)
  const name =
    cachedProfile?.full_name ??
    metadata.full_name ??
    metadata.name ??
    email.split('@')[0]?.replace(/\./g, ' ') ??
    'User'
  const avatarPath = sanitizeAvatarPath(cachedProfile?.avatar_url) ?? sanitizeAvatarPath(metadata.avatar_path)
  const avatarUrl = sanitizeAvatarUrl(cachedProfile?.avatar_url) ?? sanitizeAvatarUrl(metadata.avatar_url)
  const metadataOnboarding = metadata.onboarding as Partial<OnboardingState> | undefined
  const onboarding = metadataOnboarding
    ? {
        ...createInitialOnboarding({ fullName: name, completed: Boolean(metadataOnboarding.completed) }),
        ...metadataOnboarding,
        currentStep: normalizeOnboardingStep(metadataOnboarding.currentStep),
      }
    : createInitialOnboarding({ fullName: name, completed: false })
  const username = cachedProfile?.username ?? (metadata.username as string | undefined) ?? generateUsernameCandidate(name, email)
  const jobTitle = cachedProfile?.job_title ?? undefined

  return {
    user: {
      id: session.user.id,
      email: cachedProfile?.email ?? email,
      name,
      username,
      jobTitle,
      avatarUrl,
      avatarPath,
      onboarding,
    },
    token: session.access_token,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : new Date(Date.now() + 3600000).toISOString(),
  }
}

function createInitialAuthState(): AuthState {
  const storedSession = extractStoredSupabaseSession()
  if (!storedSession) {
    return {
      session: null,
      loading: true,
      hasProfile: false,
      profileLoading: true,
    }
  }

  const mappedSession = mapSupabaseSession(storedSession)
  const cachedProfile = readCachedProfile(mappedSession.user.id)

  return {
    session: mappedSession,
    loading: true,
    hasProfile: Boolean(cachedProfile),
    profileLoading: !cachedProfile,
  }
}

async function upsertProfileRecord(user: User) {
  const onboarding = user.onboarding ?? createInitialOnboarding({ fullName: user.name, completed: false })
  const avatarUrl = sanitizeAvatarUrl(user.avatarUrl)
  const avatarPath = sanitizeAvatarPath(user.avatarPath)

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    full_name: user.name,
    username: user.username ?? generateUsernameCandidate(user.name, user.email),
    job_title: user.jobTitle ?? null,
    email: user.email,
    avatar_url: avatarUrl ?? avatarPath ?? null,
    onboarding_completed: onboarding.completed,
    onboarding_step: onboarding.currentStep,
    onboarding_role: onboarding.role || null,
    onboarding_work_function: onboarding.workFunction || null,
    onboarding_use_case: onboarding.useCase || null,
    onboarding_tools: onboarding.tools,
  })

  if (error) throw error
}

function persistProfileRecord(user: User) {
  cacheProfileFromUser(user)
  void upsertProfileRecord(user).catch(() => {})
}

function shouldPersistProfile(hasProfile: boolean, user: User) {
  return hasProfile || user.onboarding?.completed === true
}

async function fetchProfileStatus(userId: string) {
  const { data, error } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (error) return false
  return Boolean(data)
}

async function fetchProfileSnapshot(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, username, job_title')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data as ProfileSnapshot
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, undefined, createInitialAuthState)

  const setSession = useCallback((session: AuthSession) => {
    cacheProfileFromUser(session.user)
    dispatch({ type: 'SET_SESSION', payload: session })
  }, [])

  useEffect(() => {
    let mounted = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error || !data.session) {
        clearCachedProfile()
        dispatch({ type: 'RESTORE_SESSION', payload: null })
        return
      }

      dispatch({ type: 'RESTORE_SESSION', payload: mapSupabaseSession(data.session) })
    })

    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession) => {
      if (!mounted) return

      if (!nextSession) {
        clearCachedProfile()
        dispatch({ type: 'CLEAR_SESSION' })
        return
      }

      setSession(mapSupabaseSession(nextSession))
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [setSession])

  useEffect(() => {
    if (!state.session?.user.id) {
      dispatch({ type: 'SET_PROFILE_STATUS', payload: { hasProfile: false, loading: false } })
      return
    }

    let cancelled = false
    dispatch({ type: 'SET_PROFILE_STATUS', payload: { hasProfile: state.hasProfile, loading: true } })

    void fetchProfileStatus(state.session.user.id).then((hasProfile) => {
      if (cancelled) return
      dispatch({ type: 'SET_PROFILE_STATUS', payload: { hasProfile, loading: false } })
    })

    return () => {
      cancelled = true
    }
  }, [state.hasProfile, state.session?.user.id])

  useEffect(() => {
    if (!state.session?.user.id || !state.hasProfile) return

    let cancelled = false

    void fetchProfileSnapshot(state.session.user.id).then((profile) => {
      if (cancelled || !profile || !state.session) return

      const avatarValue = profile.avatar_url ?? null
      writeCachedProfile({
        id: state.session.user.id,
        ...profile,
      })
      const nextSession: AuthSession = {
        ...state.session,
        user: {
          ...state.session.user,
          name: profile.full_name ?? state.session.user.name,
          email: profile.email ?? state.session.user.email,
          username: profile.username ?? state.session.user.username,
          jobTitle: profile.job_title ?? state.session.user.jobTitle,
          avatarUrl: sanitizeAvatarUrl(avatarValue) ?? state.session.user.avatarUrl,
          avatarPath: sanitizeAvatarPath(avatarValue) ?? state.session.user.avatarPath,
        },
      }

      dispatch({ type: 'SET_SESSION', payload: nextSession })
    })

    return () => {
      cancelled = true
    }
  }, [state.hasProfile, state.session])

  const login = useCallback(async ({ email, password }: LoginPayload) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new Error('Supabase login did not return a session.')

    setSession(mapSupabaseSession(data.session))
  }, [setSession])

  const register = useCallback(async ({ name, email, password }: RegisterPayload) => {
    const onboarding = createInitialOnboarding({ fullName: name, completed: false })
    const username = generateUsernameCandidate(name, email)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          username,
          onboarding,
        },
      },
    })

    if (error) throw error

    let activeSession = data.session

    if (!activeSession) {
      const signInResult = await supabase.auth.signInWithPassword({ email, password })
      if (signInResult.error) {
        throw new Error('Supabase did not create an active session. Confirm the email or disable email confirmation before onboarding.')
      }
      activeSession = signInResult.data.session
    }

    if (!activeSession) {
      throw new Error('Supabase did not return an active session after sign up.')
    }

    setSession(mapSupabaseSession(activeSession))
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
      cacheProfileFromUser(updatedSession.user)
      if (shouldPersistProfile(state.hasProfile, updatedSession.user)) {
        dispatch({ type: 'SET_PROFILE_STATUS', payload: { hasProfile: true, loading: false } })
        persistProfileRecord(updatedSession.user)
      }
    },
    [setSession, state.hasProfile, state.session],
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
      cacheProfileFromUser(updatedSession.user)
      if (shouldPersistProfile(state.hasProfile, updatedSession.user)) {
        dispatch({ type: 'SET_PROFILE_STATUS', payload: { hasProfile: true, loading: false } })
        persistProfileRecord(updatedSession.user)
      }
    },
    [setSession, state.hasProfile, state.session],
  )

  const completeOnboarding = useCallback(async (updates?: Partial<OnboardingState>) => {
    if (!state.session) return

    const currentOnboarding =
      state.session.user.onboarding ?? createInitialOnboarding({ fullName: state.session.user.name, completed: false })
    const nextOnboarding: OnboardingState = {
      ...currentOnboarding,
      ...updates,
      completed: true,
      currentStep: 'tools',
    }
    const updatedUser: User = {
      ...state.session.user,
      onboarding: nextOnboarding,
    }
    const updatedSession: AuthSession = {
      ...state.session,
      user: updatedUser,
    }

    setSession(updatedSession)
    cacheProfileFromUser(updatedUser)
    dispatch({ type: 'SET_PROFILE_STATUS', payload: { hasProfile: true, loading: false } })
    persistProfileRecord(updatedUser)
  }, [setSession, state.session])

  const logout = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEYS.supabaseAuthToken)
    localStorage.removeItem(STORAGE_KEYS.supabaseAuthTokenLegacy)
    clearCachedProfile()
    dispatch({ type: 'CLEAR_SESSION' })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session: state.session,
      isAuthenticated: Boolean(state.session),
      currentUser: state.session?.user ?? null,
      loading: state.loading,
      hasProfile: state.hasProfile,
      profileLoading: state.profileLoading,
      login,
      register,
      updateCurrentUser,
      updateOnboarding,
      completeOnboarding,
      logout,
    }),
    [completeOnboarding, login, logout, register, state.hasProfile, state.loading, state.profileLoading, state.session, updateCurrentUser, updateOnboarding],
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
