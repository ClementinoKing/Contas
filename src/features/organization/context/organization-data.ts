import type { Organization, Workspace } from '@/types/organization'

export const ORGANIZATION: Organization = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Contas Workpace',
  slug: 'contas-work',
  plan: 'Enterprise',
  legalName: 'Contas Workpace Ltd.',
  website: 'https://contas.work',
  industry: 'Software & Services',
  size: '51-200 employees',
  timezone: 'Africa/Blantyre (CAT)',
  location: 'Lilongwe, Malawi',
  description: 'Contas Workpace helps organizations run projects, goals, reporting, and delivery operations from one system.',
}

export const WORKSPACES: Workspace[] = [
  { id: 'ws-product-strategy', name: 'Product Strategy' },
  { id: 'ws-ops-delivery', name: 'Ops Delivery' },
]
