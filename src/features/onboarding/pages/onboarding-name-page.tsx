import { Camera } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/context/auth-context'

import { OnboardingShell } from '../components/onboarding-shell'

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function OnboardingNamePage() {
  const navigate = useNavigate()
  const { currentUser, updateCurrentUser, updateOnboarding } = useAuth()
  const [fullName, setFullName] = useState(currentUser?.onboarding?.fullName || currentUser?.name || '')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setFullName(currentUser?.onboarding?.fullName || currentUser?.name || '')
  }, [currentUser?.name, currentUser?.onboarding?.fullName])

  const canContinue = fullName.trim().length >= 2

  const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : undefined
      if (result) updateCurrentUser({ avatarUrl: result })
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <OnboardingShell
      title='Welcome to Contas Work'
      subtitle={`You're signing up as ${currentUser?.email ?? 'your account'}`}
    >
      <div className='space-y-6'>
        <div className='flex items-center gap-4'>
          <Avatar className='h-16 w-16 border'>
            {currentUser?.avatarUrl ? <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} /> : null}
            <AvatarFallback className='text-sm font-semibold'>
              {initials(fullName || currentUser?.name || 'User')}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={avatarInputRef}
              type='file'
              accept='image/*'
              onChange={handleAvatarFile}
              className='hidden'
            />
            <Button variant='outline' size='sm' onClick={() => avatarInputRef.current?.click()} className='gap-1.5'>
              <Camera className='h-4 w-4' />
              Add photo
            </Button>
          </div>
        </div>

        <div className='space-y-2'>
          <label htmlFor='onboarding-full-name' className='text-sm font-medium text-foreground'>
            What&apos;s your full name?
          </label>
          <Input
            id='onboarding-full-name'
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder='Enter your full name'
            autoFocus
          />
        </div>

        <Button
          className='w-full'
          disabled={!canContinue}
          onClick={() => {
            const nextName = fullName.trim()
            updateCurrentUser({ name: nextName })
            updateOnboarding({ fullName: nextName, currentStep: 'work' })
            navigate('/onboarding/work')
          }}
        >
          Continue
        </Button>

        <p className='text-xs text-muted-foreground'>Free trial includes all core features for your workspace setup.</p>
      </div>
    </OnboardingShell>
  )
}

