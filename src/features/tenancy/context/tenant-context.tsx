import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import { STORAGE_KEYS } from '@/lib/storage'
import type { Tenant, Workspace } from '@/types/tenancy'

import { TENANTS, WORKSPACES } from './tenant-data'

export interface TenantContextValue {
  currentTenant: Tenant
  availableTenants: Tenant[]
  workspaces: Workspace[]
  switchTenant: (tenantId: string) => void
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined)

function getInitialTenant(): Tenant {
  const storedTenantId = localStorage.getItem(STORAGE_KEYS.tenantId)
  return TENANTS.find((tenant) => tenant.id === storedTenantId) ?? TENANTS[0]
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant>(getInitialTenant)

  const switchTenant = (tenantId: string) => {
    const target = TENANTS.find((tenant) => tenant.id === tenantId)
    if (!target) {
      return
    }
    localStorage.setItem(STORAGE_KEYS.tenantId, target.id)
    setCurrentTenant(target)
  }

  const value = useMemo<TenantContextValue>(
    () => ({
      currentTenant,
      availableTenants: TENANTS,
      workspaces: WORKSPACES.filter((workspace) => workspace.tenantId === currentTenant.id),
      switchTenant,
    }),
    [currentTenant],
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider')
  }
  return context
}
