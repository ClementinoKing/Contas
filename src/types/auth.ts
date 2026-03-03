export type OnboardingStep = 'name' | 'work' | 'tools' | 'invite'

export interface OnboardingState {
  completed: boolean
  currentStep: OnboardingStep
  fullName: string
  role: string
  workFunction: string
  useCase: string
  tools: string[]
  inviteEmails: string[]
}

export interface User {
  id: string
  email: string
  name: string
  tenantId: string
  avatarUrl?: string
  onboarding?: OnboardingState
}

export interface AuthSession {
  user: User
  token: string
  expiresAt: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}
