export interface User {
  id: string
  email: string
  name: string
  tenantId: string
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
