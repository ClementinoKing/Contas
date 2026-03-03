import { CheckCircle2, Sparkles, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function InviteNudgeDialog({
  open,
  onSkip,
  onInvite,
}: {
  open: boolean
  onSkip: () => void
  onInvite: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onInvite() : undefined)}>
      <DialogContent className='max-w-[640px] overflow-hidden border-border/80 p-0'>
        <div className='border-b border-border/70 bg-gradient-to-br from-muted/40 via-background to-background px-8 pb-6 pt-8'>
          <DialogHeader className='space-y-4 text-left'>
            <div className='inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-sm'>
              <Sparkles className='h-6 w-6 text-primary' />
            </div>
            <DialogTitle className='text-3xl tracking-tight'>Before you continue...</DialogTitle>
            <DialogDescription className='max-w-[520px] text-lg leading-relaxed text-muted-foreground'>
              Invite a teammate so you can collaborate on tasks and projects together from day one.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className='space-y-5 px-8 pb-7 pt-6'>
          <div className='rounded-xl border border-border/70 bg-muted/20 p-4'>
            <p className='mb-3 text-sm font-medium text-foreground'>Why invite now?</p>
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <CheckCircle2 className='h-4 w-4 text-primary' />
                Share projects instantly and assign work in context.
              </div>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Users className='h-4 w-4 text-primary' />
                Build momentum with real collaboration from your first sprint.
              </div>
            </div>
          </div>

          <DialogFooter className='flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
            <Button variant='outline' className='h-11 px-6' onClick={onSkip}>
              Skip for now
            </Button>
            <Button className='h-11 min-w-44 px-6' onClick={onInvite}>
              Invite teammates
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
