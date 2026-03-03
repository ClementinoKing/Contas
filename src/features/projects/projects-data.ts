export type UserProject = {
  id: string
  name: string
  key: string
  color: string
}

export const USER_PROJECTS: UserProject[] = [
  { id: 'project-atlas', name: 'Atlas Revamp', key: 'ATL', color: 'bg-blue-500' },
  { id: 'project-orbit', name: 'Orbit Launch', key: 'ORB', color: 'bg-emerald-500' },
  { id: 'project-nova', name: 'Nova CRM', key: 'NOV', color: 'bg-amber-500' },
]
