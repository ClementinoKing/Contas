import { ArrowUpRight, Layers3, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { USER_PROJECTS } from '@/features/projects/projects-data'

const portfolioRows = [
  { id: 'project-atlas', health: 'Good', progress: 72, owner: 'Lina', risk: 'Low' },
  { id: 'project-orbit', health: 'Attention', progress: 58, owner: 'James', risk: 'Medium' },
  { id: 'project-nova', health: 'Good', progress: 64, owner: 'Maya', risk: 'Low' },
] as const

export function PortfolioPage() {
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
            {portfolioRows.map((row) => {
              const project = USER_PROJECTS.find((item) => item.id === row.id)
              return (
                <article key={row.id} className='rounded-md border bg-muted/10 p-3'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='space-y-1'>
                      <p className='text-sm font-semibold text-foreground'>{project?.name ?? row.id}</p>
                      <p className='text-xs text-muted-foreground'>Owner: {row.owner}</p>
                    </div>
                    <Badge variant='outline'>{row.health}</Badge>
                  </div>
                  <div className='mt-3 space-y-1.5'>
                    <div className='flex items-center justify-between text-xs'>
                      <span className='text-muted-foreground'>Progress</span>
                      <span className='font-medium text-foreground'>{row.progress}%</span>
                    </div>
                    <div className='h-2 rounded-full bg-muted'>
                      <div className='h-full rounded-full bg-primary' style={{ width: `${row.progress}%` }} />
                    </div>
                  </div>
                  <div className='mt-3 flex items-center justify-between text-xs'>
                    <span className='text-muted-foreground'>Risk: {row.risk}</span>
                    <Link to={`/dashboard/projects/${row.id}`} className='font-medium text-primary hover:underline'>
                      Open project
                    </Link>
                  </div>
                </article>
              )
            })}
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
                2 projects in healthy range
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>Milestones are on track with low blocker density.</p>
            </div>
            <div className='rounded-md border bg-muted/10 p-3'>
              <p className='inline-flex items-center gap-2 text-sm font-medium'>
                <TriangleAlert className='h-4 w-4 text-amber-400' />
                Orbit Launch needs attention
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>Dependency risk increased due to external API reviews.</p>
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
