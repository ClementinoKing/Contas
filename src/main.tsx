import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { router } from '@/app/router'
import { AppProviders } from '@/app/providers'

import './index.css'

const THEME_STORAGE_KEY = 'contas.ui.theme'
const IMAGE_URL_LOG_PREFIX = 'Image URL being set:'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
