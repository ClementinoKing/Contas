import { ArrowUpRight, Layers3, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

type PortfolioProject = {
  id: string
  name: string
  progress: number
  owner: string
  health: string
  risk: string
}

export function PortfolioPage() {
  const [projects, setProjects] = useState<PortfolioProject[]>([])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      supabase.from('projects').select('id, name').order('name', { ascending: true }),
      supabase.from('tasks').select('project_id, status, assigned_to'),
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('task_assignees').select('task_id, assignee_id'),
      supabase.from('tasks').select('id, project_id'),
    ]).then(([projectsResult, tasksResult, profilesResult, taskAssigneesResult, tasksWithIdsResult]) => {
      if (cancelled) return

      const memberMap = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name ?? profile.email ?? 'Unassigned']),
      )
      const taskProjectMap = new Map((tasksWithIdsResult.data ?? []).map((task) => [task.id, task.project_id ?? '']))
      const assigneeNamesByProjectId = new Map<string, Set<string>>()

      for (const assignment of taskAssigneesResult.data ?? []) {
        const projectId = taskProjectMap.get(assignment.task_id)
        const assigneeName = memberMap.get(assignment.assignee_id)
        if (!projectId || !assigneeName) continue
        const current = assigneeNamesByProjectId.get(projectId) ?? new Set<string>()
        current.add(assigneeName)
        assigneeNamesByProjectId.set(projectId, current)
      }

      setProjects(
        (projectsResult.data ?? []).map((project) => {
          const projectTasks = (tasksResult.data ?? []).filter((task) => task.project_id === project.id)
          const blockedCount = projectTasks.filter((task) => task.status === 'blocked').length
          const activeCount = projectTasks.filter((task) => task.status === 'in_progress' || task.status === 'review').length
          const fallbackOwner = memberMap.get(projectTasks.find((task) => task.assigned_to)?.assigned_to ?? '') ?? 'Unassigned'
          const owners = Array.from(assigneeNamesByProjectId.get(project.id) ?? [])
          const owner = owners.length > 0 ? owners.join(', ') : fallbackOwner
          const totalTasks = projectTasks.length

          return {
            id: project.id,
            name: project.name ?? 'Untitled project',
            owner,
            progress: totalTasks === 0 ? 0 : Math.round((activeCount / totalTasks) * 100),
            health: blockedCount > 0 ? 'Attention' : totalTasks > 0 ? 'Good' : 'Idle',
            risk: blockedCount > 1 ? 'High' : blockedCount === 1 ? 'Medium' : 'Low',
          }
        }),
      )
    })

    return () => {
      cancelled = true
    }
  }, [])

  const healthyProjects = useMemo(() => projects.filter((project) => project.health === 'Good').length, [projects])
  const attentionProjects = useMemo(() => projects.filter((project) => project.health === 'Attention').length, [projects])

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-3'>
          <div>
            <p className='text-sm font-semibold text-foreground'>Portfolio Command Center</p>
            <p className='text-xs text-muted-foreground'>Track cross-project health, progress, and exposure.</p>
          </div>
          <Button size='sm' className='gap-1.5'>
            <Layers3 className='h-4 w-4' />
            Create Portfolio View
          </Button>
        </CardContent>
      </Card>

      <section className='grid gap-4 xl:grid-cols-[1.5fr_1fr]'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Project Portfolio</CardTitle>
            <CardDescription>Consolidated status across active initiatives</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {projects.length === 0 ? (
              <div className='rounded-md border bg-muted/10 p-6 text-sm text-muted-foreground'>No projects in the database yet.</div>
            ) : (
              projects.map((project) => (
                <article key={project.id} className='rounded-md border bg-muted/10 p-3'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='space-y-1'>
                      <p className='text-sm font-semibold text-foreground'>{project.name}</p>
                      <p className='text-xs text-muted-foreground'>Owner: {project.owner}</p>
                    </div>
                    <Badge variant='outline'>{project.health}</Badge>
                  </div>
                  <div className='mt-3 space-y-1.5'>
                    <div className='flex items-center justify-between text-xs'>
                      <span className='text-muted-foreground'>Progress</span>
                      <span className='font-medium text-foreground'>{project.progress}%</span>
                    </div>
                    <div className='h-2 rounded-full bg-muted'>
                      <div className='h-full rounded-full bg-primary' style={{ width: `${project.progress}%` }} />
                    </div>
                  </div>
                  <div className='mt-3 flex items-center justify-between text-xs'>
                    <span className='text-muted-foreground'>Risk: {project.risk}</span>
                    <Link to={`/dashboard/projects/${project.id}`} className='font-medium text-primary hover:underline'>
                      Open project
                    </Link>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Portfolio Signals</CardTitle>
            <CardDescription>Risk and confidence indicators</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-md border bg-muted/10 p-3'>
              <p className='inline-flex items-center gap-2 text-sm font-medium'>
                <ShieldCheck className='h-4 w-4 text-emerald-400' />
                {healthyProjects} projects in healthy range
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>Projects with no blocked tasks are treated as healthy.</p>
            </div>
            <div className='rounded-md border bg-muted/10 p-3'>
              <p className='inline-flex items-center gap-2 text-sm font-medium'>
                <TriangleAlert className='h-4 w-4 text-amber-400' />
                {attentionProjects} projects need attention
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>Attention is based on blocked work currently linked to each project.</p>
            </div>
            <Button variant='outline' className='w-full justify-start gap-2'>
              <ArrowUpRight className='h-4 w-4' />
              Share portfolio update
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
