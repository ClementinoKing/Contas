import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTenant } from '@/features/tenancy/context/tenant-context'

export function DashboardSectionPage({ title }: { title: string }) {
  const { currentTenant } = useTenant()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{currentTenant.name} module coming next</CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-sm text-muted-foreground'>
          This section is scaffolded and ready for detailed workflows in the next phase.
        </p>
      </CardContent>
    </Card>
  )
}
