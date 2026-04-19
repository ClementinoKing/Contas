import { zodResolver } from '@hookform/resolvers/zod'
import { LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STORAGE_KEYS } from '@/lib/storage'
import { notify } from '@/lib/notify'

import { useAuth } from '../context/auth-context'
import { AuthInputGroup } from '../components/auth-input-group'
import { AuthLayout } from '../components/auth-layout'

const LAST_DASHBOARD_PATH_KEY = 'contas.last-dashboard-path'

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitting, setSubmitting] = useState(false)
  const [accessNotice, setAccessNotice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  useEffect(() => {
    const notice = sessionStorage.getItem(STORAGE_KEYS.accessNotice)
    if (!notice) return
    setAccessNotice(notice)
    sessionStorage.removeItem(STORAGE_KEYS.accessNotice)
  }, [])

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitting(true)
    try {
      await login(values)
      notify.success('Signed in successfully', {
        description: 'Welcome back. Redirecting to your dashboard...',
      })
      const savedPath = sessionStorage.getItem(LAST_DASHBOARD_PATH_KEY)
      const target =
        location.state?.from?.pathname ??
        (savedPath && savedPath.startsWith('/dashboard/') ? savedPath : '/dashboard/home')
      navigate(target, { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please check your email and password, then try again.'
      notify.error('Sign in failed', { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title='Welcome back' subtitle='Sign in to manage tasks and team progress.'>
      {accessNotice ? (
        <div className='mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-foreground'>
          <p className='font-medium text-amber-700 dark:text-amber-200'>Access restricted</p>
          <p className='mt-1 text-muted-foreground'>{accessNotice}</p>
        </div>
      ) : null}
      <form className='space-y-4' onSubmit={handleSubmit(onSubmit)}>
        <AuthInputGroup label='Email' htmlFor='email' error={errors.email?.message}>
          <Input id='email' type='email' autoComplete='email' placeholder='name@company.com' {...register('email')} />
        </AuthInputGroup>

        <AuthInputGroup label='Password' htmlFor='password' error={errors.password?.message}>
          <Input id='password' type='password' autoComplete='current-password' placeholder='Enter your password' {...register('password')} />
        </AuthInputGroup>

        <Button className='w-full' type='submit' disabled={submitting}>
          <LogIn className='h-4 w-4' aria-hidden='true' />
          {submitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className='mt-6 text-sm text-muted-foreground'>Need access? Contact your administrator for an invite.</p>
    </AuthLayout>
  )
}
