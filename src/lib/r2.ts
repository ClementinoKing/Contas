import { supabase } from '@/lib/supabase'

type UploadAvatarResult = {
  key: string
  url: string
}

function getFunctionsBaseUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-avatar`
}

async function getAuthHeaders() {
  let {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    const refreshResult = await supabase.auth.refreshSession()
    session = refreshResult.data.session
  }

  if (!session?.access_token) {
    throw new Error('You must be signed in with an active session to upload images.')
  }

  const userResult = await supabase.auth.getUser(session.access_token)
  if (userResult.error || !userResult.data.user) {
    const refreshResult = await supabase.auth.refreshSession()
    session = refreshResult.data.session
  }

  if (!session?.access_token) {
    throw new Error('Your session is no longer valid. Sign in again before uploading images.')
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

function networkErrorMessage(action: 'upload' | 'resolve') {
  if (action === 'upload') {
    return 'Avatar upload could not reach the Supabase function. Deploy the r2-avatar Edge Function and verify its R2 secrets.'
  }

  return 'Avatar URL could not be resolved because the Supabase function is unavailable.'
}

export async function uploadAvatarToR2(file: File): Promise<UploadAvatarResult> {
  const headers = await getAuthHeaders()
  let response: Response

  try {
    response = await fetch(getFunctionsBaseUrl(), {
      method: 'POST',
      headers: {
        ...headers,
        'x-file-name': encodeURIComponent(file.name),
        'x-content-type': file.type || 'application/octet-stream',
      },
      body: file,
    })
  } catch {
    throw new Error(networkErrorMessage('upload'))
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Avatar upload failed.')
  }

  return (await response.json()) as UploadAvatarResult
}

export async function resolveAvatarUrl(key: string): Promise<string> {
  if (!key || key.startsWith('data:') || key.startsWith('http://') || key.startsWith('https://')) {
    throw new Error('Invalid avatar key.')
  }

  const headers = await getAuthHeaders()
  let response: Response

  try {
    response = await fetch(`${getFunctionsBaseUrl()}?key=${encodeURIComponent(key)}`, {
      method: 'GET',
      headers,
    })
  } catch {
    throw new Error(networkErrorMessage('resolve'))
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Could not resolve avatar URL.')
  }

  const data = (await response.json()) as { url: string }
  return data.url
}
