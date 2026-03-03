export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'Starter' | 'Pro' | 'Enterprise'
}

export interface Workspace {
  id: string
  tenantId: string
  name: string
}
