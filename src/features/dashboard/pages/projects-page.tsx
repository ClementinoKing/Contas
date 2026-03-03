import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { USER_PROJECTS } from '@/features/projects/projects-data'
import { TASK_ROWS } from '@/features/tasks/tasks-data'

export function ProjectsPage() {
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Projects</CardTitle>
          <CardDescription>Projects you created and their linked tasks.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {USER_PROJECTS.map((project) => {
            const linkedTasks = TASK_ROWS.filter((task) => task.projectId === project.id).length
            return (
              <Link
                key={project.id}
                to={`/dashboard/projects/${project.id}`}
                className='rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40'
              >
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <span className={`h-2.5 w-2.5 rounded-full ${project.color}`} />
                    <p className='font-medium text-foreground'>{project.name}</p>
                  </div>
                  <ArrowRight className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                </div>
                <div className='mt-2 flex items-center justify-between'>
                  <Badge variant='outline'>{project.key}</Badge>
                  <span className='text-xs text-muted-foreground'>{linkedTasks} tasks</span>
                </div>
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
