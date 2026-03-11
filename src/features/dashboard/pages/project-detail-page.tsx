import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState<{ id: string; name: string; key: string | null; color: string | null } | null>(null)
  const [linkedTasks, setLinkedTasks] = useState<Array<{ id: string; title: string; status: string | null; due_at: string | null }>>([])
  const [loading, setLoading] = useState(Boolean(projectId))

  useEffect(() => {
    if (!projectId) return

    let cancelled = false

    void Promise.all([
      supabase.from('projects').select('id, name, key, color').eq('id', projectId).maybeSingle(),
      supabase.from('tasks').select('id, title, status, due_at').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]).then(([projectResult, tasksResult]) => {
        if (cancelled) return
        if (projectResult.error || !projectResult.data) {
          setProject(null)
          setLoading(false)
          return
        }

        setProject(projectResult.data)
        setLinkedTasks(tasksResult.data ?? [])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!projectId) {
    return <Navigate to='/dashboard/projects' replace />
  }

  if (loading) {
    return <Card><CardContent className='p-6 text-sm text-muted-foreground'>Loading project...</CardContent></Card>
  }

  if (!project) {
    return <Navigate to='/dashboard/projects' replace />
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center gap-2'>
          <span className={`h-2.5 w-2.5 rounded-full ${project.color ?? 'bg-blue-500'}`} />
          <CardTitle className='text-base'>{project.name}</CardTitle>
          <Badge variant='outline'>{project.key ?? 'PRJ'}</Badge>
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
                {task.due_at ? (
                  <>
                    <span>•</span>
                    <span>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(task.due_at))}</span>
                  </>
                ) : null}
                <span>•</span>
                <span>{task.status ?? 'planned'}</span>
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
