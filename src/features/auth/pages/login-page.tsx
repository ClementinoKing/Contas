import { zodResolver } from '@hookform/resolvers/zod'
import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitting(true)
    try {
      await login(values)
      const savedPath = sessionStorage.getItem(LAST_DASHBOARD_PATH_KEY)
      const target =
        location.state?.from?.pathname ??
        (savedPath && savedPath.startsWith('/dashboard/') ? savedPath : '/dashboard/home')
      navigate(target, { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title='Welcome back' subtitle='Sign in to manage tasks and team progress.'>
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

      <p className='mt-6 text-sm text-muted-foreground'>
        New here?{' '}
        <Link className='font-medium text-primary hover:underline' to='/register'>
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
