export type TaskRow = {
  id: string
  title: string
  description?: string
  createdById?: string
  owner: string
  assigneeIds: string[]
  due: string
  completed?: boolean
  status: 'In Progress' | 'Review' | 'Planned' | 'Blocked' | 'Done'
  priority: 'Low' | 'Medium' | 'High' | 'Urgent'
  boardColumn?: string
  projectId: string
  projectName: string
  startDate: string
  endDate: string
}
