import type { Tenant, Workspace } from '@/types/tenancy'

export const TENANTS: Tenant[] = [
  { id: 'tenant-acme', name: 'Acme Operations', slug: 'acme', plan: 'Enterprise' },
  { id: 'tenant-beacon', name: 'Beacon Growth', slug: 'beacon', plan: 'Pro' },
  { id: 'tenant-lumen', name: 'Lumen Labs', slug: 'lumen', plan: 'Starter' },
]

export const WORKSPACES: Workspace[] = [
  { id: 'ws-acme-product', tenantId: 'tenant-acme', name: 'Product Strategy' },
  { id: 'ws-acme-ops', tenantId: 'tenant-acme', name: 'Ops Delivery' },
  { id: 'ws-beacon-marketing', tenantId: 'tenant-beacon', name: 'Marketing Hub' },
  { id: 'ws-lumen-core', tenantId: 'tenant-lumen', name: 'Core Platform' },
]
