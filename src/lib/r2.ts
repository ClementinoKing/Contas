import { supabase } from '@/lib/supabase'

type UploadAvatarResult = {
  key: string
  url: string
}
type UploadVoiceResult = {
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

  const verifyResult = await supabase.auth.getUser(session.access_token)
  if (verifyResult.error || !verifyResult.data.user) {
    throw new Error('Your session is no longer valid. Sign in again before uploading.')
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

function networkErrorMessage(action: 'upload' | 'resolve', kind: 'avatar' | 'voice' = 'avatar') {
  if (action === 'upload') {
    return kind === 'voice'
      ? 'Voice upload could not reach the Supabase function. Deploy the r2-avatar Edge Function and verify its R2 secrets.'
      : 'Avatar upload could not reach the Supabase function. Deploy the r2-avatar Edge Function and verify its R2 secrets.'
  }

  return kind === 'voice'
    ? 'Voice URL could not be resolved because the Supabase function is unavailable.'
    : 'Avatar URL could not be resolved because the Supabase function is unavailable.'
}

export async function uploadAvatarToR2(file: File): Promise<UploadAvatarResult> {
  const invokeUpload = () =>
    supabase.functions.invoke<UploadAvatarResult>('r2-avatar', {
      method: 'POST',
      headers: {
        'x-file-name': encodeURIComponent(file.name),
        'x-content-type': file.type || 'application/octet-stream',
        'x-upload-kind': 'avatar',
      },
      body: file,
    })

  let result = await invokeUpload()

  if (result.error) {
    const status = (result.error as unknown as { context?: { status?: number } })?.context?.status
    if (status === 401) {
      await supabase.auth.refreshSession()
      result = await invokeUpload()
    }
  }

  if (result.error || !result.data) {
    const message = result.error?.message
    throw new Error(message || 'Avatar upload failed.')
  }

  return result.data
}

export async function uploadVoiceToR2(file: File): Promise<UploadVoiceResult> {
  const invokeUpload = () =>
    supabase.functions.invoke<UploadVoiceResult>('r2-avatar', {
      method: 'POST',
      headers: {
        'x-file-name': encodeURIComponent(file.name),
        'x-content-type': file.type || 'audio/webm',
        'x-upload-kind': 'voice',
      },
      body: file,
    })

  let result = await invokeUpload()

  if (result.error) {
    const status = (result.error as unknown as { context?: { status?: number } })?.context?.status
    if (status === 401) {
      await supabase.auth.refreshSession()
      result = await invokeUpload()
    }
  }

  if (result.error || !result.data) {
    const message = result.error?.message
    throw new Error(message || 'Voice upload failed.')
  }

  return result.data
}

export async function resolveR2ObjectUrl(key: string): Promise<string> {
  if (!key || key.startsWith('data:') || key.startsWith('http://') || key.startsWith('https://')) {
    throw new Error('Invalid R2 key.')
  }

  const headers = await getAuthHeaders()
  let response: Response

  try {
    response = await fetch(`${getFunctionsBaseUrl()}?key=${encodeURIComponent(key)}`, {
      method: 'GET',
      headers,
    })
  } catch {
    throw new Error(networkErrorMessage('resolve', key.startsWith('voice-comments/') ? 'voice' : 'avatar'))
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Could not resolve file URL.')
  }

  const data = (await response.json()) as { url: string }
  return data.url
}

export async function resolveAvatarUrl(key: string): Promise<string> {
  return resolveR2ObjectUrl(key)
}
