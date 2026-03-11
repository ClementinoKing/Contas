import type { ReactNode } from 'react'

import { AuthProvider } from '@/features/auth/context/auth-context'
import { ShellProvider } from '@/features/layout/context/shell-context'
import { OrganizationProvider } from '@/features/organization/context/organization-context'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <ShellProvider>{children}</ShellProvider>
      </OrganizationProvider>
    </AuthProvider>
  )
}
