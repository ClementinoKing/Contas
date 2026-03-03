export type TaskRow = {
  id: string
  title: string
  owner: string
  due: string
  status: 'In Progress' | 'Review' | 'Planned' | 'Blocked'
  projectId: string
  projectName: string
  startDate: string
  endDate: string
}

export const TASK_ROWS: TaskRow[] = [
  {
    id: 'T-104',
    title: 'Finalize sprint priorities',
    owner: 'Lina',
    due: 'Today',
    status: 'In Progress',
    projectId: 'project-atlas',
    projectName: 'Atlas Revamp',
    startDate: '2026-03-03',
    endDate: '2026-03-06',
  },
  {
    id: 'T-093',
    title: 'Review API contract updates',
    owner: 'James',
    due: 'Mar 4',
    status: 'Review',
    projectId: 'project-orbit',
    projectName: 'Orbit Launch',
    startDate: '2026-03-04',
    endDate: '2026-03-05',
  },
  {
    id: 'T-081',
    title: 'Update onboarding checklist',
    owner: 'Maya',
    due: 'Mar 5',
    status: 'Planned',
    projectId: 'project-nova',
    projectName: 'Nova CRM',
    startDate: '2026-03-05',
    endDate: '2026-03-09',
  },
  {
    id: 'T-079',
    title: 'Refine release notes draft',
    owner: 'Noah',
    due: 'Mar 6',
    status: 'Blocked',
    projectId: 'project-atlas',
    projectName: 'Atlas Revamp',
    startDate: '2026-03-06',
    endDate: '2026-03-07',
  },
]
