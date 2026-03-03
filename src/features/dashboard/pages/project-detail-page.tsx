import { Link, Navigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { USER_PROJECTS } from '@/features/projects/projects-data'
import { TASK_ROWS } from '@/features/tasks/tasks-data'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const project = USER_PROJECTS.find((item) => item.id === projectId)

  if (!project) {
    return <Navigate to='/dashboard/projects' replace />
  }

  const linkedTasks = TASK_ROWS.filter((task) => task.projectId === project.id)

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center gap-2'>
          <span className={`h-2.5 w-2.5 rounded-full ${project.color}`} />
          <CardTitle className='text-base'>{project.name}</CardTitle>
          <Badge variant='outline'>{project.key}</Badge>
        </div>
        <CardDescription>Tasks linked to this project.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-2'>
        {linkedTasks.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No tasks linked yet.</p>
        ) : (
          linkedTasks.map((task) => (
            <article key={task.id} className='rounded-md border bg-muted/15 p-3'>
              <p className='font-medium text-foreground'>{task.title}</p>
              <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
                <span>{task.id}</span>
                <span>•</span>
                <span>{task.owner}</span>
                <span>•</span>
                <span>{task.due}</span>
                <span>•</span>
                <span>{task.status}</span>
              </div>
            </article>
          ))
        )}
        <Link to='/dashboard/my-tasks' className='inline-block pt-1 text-sm font-medium text-primary hover:underline'>
          Back to My Tasks
        </Link>
      </CardContent>
    </Card>
  )
}
