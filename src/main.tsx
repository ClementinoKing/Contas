import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { router } from '@/app/router'
import { AppProviders } from '@/app/providers'

import './index.css'

const THEME_STORAGE_KEY = 'contas.ui.theme'
const IMAGE_URL_LOG_PREFIX = 'Image URL being set:'
const NETWORK_CHECK_INTERVAL_MS = 15_000
const NETWORK_CHECK_TIMEOUT_MS = 4_000

function applyInitialTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const shouldUseDark = storedTheme ? storedTheme === 'dark' : prefersDark

  document.documentElement.classList.toggle('dark', shouldUseDark)
}

function suppressNoisyImageLogs() {
  const consoleWithFlag = console as typeof console & { __contasImageLogFilter?: boolean }

  if (consoleWithFlag.__contasImageLogFilter) {
    return
  }

  const originalLog = console.log.bind(console)

  console.log = (...args: unknown[]) => {
    const firstArg = args[0]
    if (typeof firstArg === 'string' && firstArg.startsWith(IMAGE_URL_LOG_PREFIX)) {
      return
    }

    originalLog(...args)
  }

  consoleWithFlag.__contasImageLogFilter = true
}

applyInitialTheme()

if (import.meta.env.DEV) {
  suppressNoisyImageLogs()
}

function OfflineConnectionPage() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-muted/35 p-6'>
      <section className='w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm'>
        <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Connection</p>
        <h1 className='mt-2 text-2xl font-semibold text-foreground'>No network connection</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          You are offline right now. Reconnect to the internet to continue using Contas CRM.
        </p>
        <button
          type='button'
          onClick={() => window.location.reload()}
          className='mt-5 inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent'
        >
          Try again
        </button>
      </section>
    </main>
  )
}

function RootWithNetworkGuard() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!navigator.onLine) {
      setIsOnline(false)
      return
    }

    let cancelled = false
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

    const checkNetworkReachability = async () => {
      if (!supabaseUrl || supabaseUrl.trim().length === 0 || !supabaseAnonKey || supabaseAnonKey.trim().length === 0) {
        setIsOnline(navigator.onLine)
        return
      }

      const healthUrl = new URL('/rest/v1/', supabaseUrl).toString()
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), NETWORK_CHECK_TIMEOUT_MS)
      try {
        const response = await fetch(healthUrl, {
          method: 'HEAD',
          cache: 'no-store',
          mode: 'cors',
          headers: {
            apikey: supabaseAnonKey,
          },
          signal: controller.signal,
        })
        if (!cancelled) setIsOnline(response.status < 500)
      } catch {
        if (!cancelled) setIsOnline(false)
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    void checkNetworkReachability()
    const intervalId = window.setInterval(() => {
      if (!navigator.onLine) {
        setIsOnline(false)
        return
      }
      void checkNetworkReachability()
    }, NETWORK_CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  if (!isOnline) return <OfflineConnectionPage />

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootWithNetworkGuard />
  </StrictMode>,
)
