import { Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/context/auth-context'

import { InviteNudgeDialog } from '../components/invite-nudge-dialog'
import { OnboardingShell } from '../components/onboarding-shell'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function OnboardingInvitePage() {
  const navigate = useNavigate()
  const { currentUser, updateOnboarding, completeOnboarding } = useAuth()
  const [showNudge, setShowNudge] = useState(false)
  const [emails, setEmails] = useState<string[]>(
    currentUser?.onboarding?.inviteEmails?.length ? currentUser.onboarding.inviteEmails : ['', '', ''],
  )

  const trimmedEmails = useMemo(() => emails.map((email) => email.trim()), [emails])
  const invalidIndexes = useMemo(
    () =>
      trimmedEmails
        .map((email, index) => (email !== '' && !isValidEmail(email) ? index : -1))
        .filter((index) => index >= 0),
    [trimmedEmails],
  )
  const validEmails = useMemo(() => trimmedEmails.filter((email) => email && isValidEmail(email)), [trimmedEmails])

  const setEmail = (index: number, value: string) => {
    setEmails((current) => current.map((item, idx) => (idx === index ? value : item)))
  }

  const addRow = () => setEmails((current) => [...current, ''])
  const removeRow = (index: number) =>
    setEmails((current) => (current.length <= 1 ? current : current.filter((_, idx) => idx !== index)))

  const finishOnboarding = (emailsToSave: string[]) => {
    updateOnboarding({ inviteEmails: emailsToSave, currentStep: 'invite' })
    completeOnboarding()
    navigate('/dashboard/home', { replace: true })
  }

  const handleContinue = () => {
    if (invalidIndexes.length > 0) return
    if (validEmails.length === 0) {
      setShowNudge(true)
      return
    }
    finishOnboarding(validEmails)
  }

  return (
    <>
      <OnboardingShell
        title='Invite teammates to try Contas together'
        subtitle='Start small with a few collaborators and scale your workspace over time.'
        backTo='/onboarding/tools'
      >
        <div className='space-y-4'>
          {emails.map((email, index) => (
            <div key={`invite-${index}`} className='space-y-1'>
              <div className='flex items-center gap-2'>
                <Input
                  type='email'
                  value={email}
                  onChange={(event) => setEmail(index, event.target.value)}
                  placeholder={`Teammate email ${index + 1}`}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  onClick={() => removeRow(index)}
                  aria-label={`Remove email row ${index + 1}`}
                >
                  <Minus className='h-4 w-4' />
                </Button>
              </div>
              {invalidIndexes.includes(index) ? (
                <p className='text-xs text-destructive'>Please enter a valid email address.</p>
              ) : null}
            </div>
          ))}

          <Button type='button' variant='outline' className='w-full gap-1.5' onClick={addRow}>
            <Plus className='h-4 w-4' />
            Add another email
          </Button>

          <Button className='w-full' onClick={handleContinue}>
            Continue to Contas
          </Button>
        </div>
      </OnboardingShell>

      <InviteNudgeDialog
        open={showNudge}
        onInvite={() => setShowNudge(false)}
        onSkip={() => {
          setShowNudge(false)
          finishOnboarding([])
        }}
      />
    </>
  )
}

