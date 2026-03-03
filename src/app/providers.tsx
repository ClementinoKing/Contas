import type { ReactNode } from 'react'

import { AuthProvider } from '@/features/auth/context/auth-context'
import { ShellProvider } from '@/features/layout/context/shell-context'
import { TenantProvider } from '@/features/tenancy/context/tenant-context'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TenantProvider>
        <ShellProvider>{children}</ShellProvider>
      </TenantProvider>
    </AuthProvider>
  )
}
