import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; key: string | null; color: string | null }>>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      supabase.from('projects').select('id, name, key, color').order('name', { ascending: true }),
      supabase.from('tasks').select('id, project_id'),
    ]).then(([projectsResult, tasksResult]) => {
      if (cancelled) return
      if (!projectsResult.error && projectsResult.data) {
        setProjects(projectsResult.data)
      }
      if (!tasksResult.error && tasksResult.data) {
        const counts = tasksResult.data.reduce<Record<string, number>>((acc, task) => {
          if (!task.project_id) return acc
          acc[task.project_id] = (acc[task.project_id] ?? 0) + 1
          return acc
        }, {})
        setTaskCounts(counts)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Projects</CardTitle>
          <CardDescription>Projects you created and their linked tasks.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {projects.map((project, index) => {
            const linkedTasks = taskCounts[project.id] ?? 0
            return (
              <Link
                key={project.id}
                to={`/dashboard/projects/${project.id}`}
                className='rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40'
              >
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <span className={`h-2.5 w-2.5 rounded-full ${project.color ?? ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500'][index % 3]}`} />
                    <p className='font-medium text-foreground'>{project.name}</p>
                  </div>
                  <ArrowRight className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                </div>
                <div className='mt-2 flex items-center justify-between'>
                  <Badge variant='outline'>{project.key ?? 'PRJ'}</Badge>
                  <span className='text-xs text-muted-foreground'>{linkedTasks} tasks</span>
                </div>
              </Link>
            )
          })}
          {projects.length === 0 ? <p className='text-sm text-muted-foreground'>No projects found in the system.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
