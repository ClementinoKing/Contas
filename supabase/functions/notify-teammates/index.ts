import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type NotificationEmailType = 'task_assigned' | 'mention'

type NotifyPayload = {
  type: NotificationEmailType
  recipientEmail?: string
  recipientId?: string
  taskId: string
  taskTitle: string
  actorName: string
  appUrl?: string
  notificationId: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? ''
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? ''
const FALLBACK_APP_BASE_URL = 'https://contas.cloudninetech.co.za'

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return atob(`${normalized}${padding}`)
}

function requesterIdFromBearerToken(token: string) {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payloadJson = decodeBase64Url(parts[1])
    const payload = JSON.parse(payloadJson) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
  } catch {
    return null
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function subjectForType(type: NotificationEmailType) {
  return type === 'mention' ? 'You were mentioned in a task' : 'You were assigned a task'
}

function bodyForType(type: NotificationEmailType, actorName: string, taskTitle: string, appUrl: string) {
  const intro =
    type === 'mention'
      ? `${actorName} mentioned you in <strong>${taskTitle}</strong>.`
      : `${actorName} assigned you to <strong>${taskTitle}</strong>.`

  return `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <p>${intro}</p>
      <p>
        <a href="${appUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;">
          Open task
        </a>
      </p>
      <p style="font-size: 13px; color: #475569;">Direct link: ${appUrl}</p>
    </div>
  `
}

async function sendResendEmail(input: {
  to: string
  type: NotificationEmailType
  actorName: string
  taskTitle: string
  appUrl: string
}) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error('Missing RESEND_API_KEY or RESEND_FROM_EMAIL.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [input.to],
      subject: subjectForType(input.type),
      html: bodyForType(input.type, input.actorName, input.taskTitle, input.appUrl),
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : `Resend failed with status ${response.status}`
    throw new Error(message)
  }

  return {
    id: typeof data?.id === 'string' ? data.id : null,
  }
}

function resolveBearerToken(req: Request) {
  const directAuthorization = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const forwardedAuthorization = req.headers.get('x-forwarded-authorization') ?? ''
  const candidate = directAuthorization || forwardedAuthorization
  if (!candidate) return ''
  const bearerMatch = candidate.match(/^Bearer\s+(.+)$/i)
  if (bearerMatch?.[1]) return bearerMatch[1].trim()
  return candidate.trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed.' }, 405)
  }

  const accessToken = resolveBearerToken(req)
  if (!accessToken) {
    return json({ ok: false, message: 'Missing bearer token.' }, 401)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, message: 'Missing Supabase environment variables.' }, 500)
  }

  let payload: NotifyPayload
  try {
    payload = (await req.json()) as NotifyPayload
  } catch {
    return json({ ok: false, message: 'Invalid JSON payload.' }, 400)
  }

  if (!payload.type || !payload.notificationId || !payload.taskId || !payload.taskTitle || !payload.actorName) {
    return json({ ok: false, message: 'Missing required notification payload fields.' }, 400)
  }

  if (payload.type !== 'mention' && payload.type !== 'task_assigned') {
    return json({ ok: false, message: 'Unsupported notification email type.' }, 400)
  }

  const requesterId =
    requesterIdFromBearerToken(accessToken) ??
    req.headers.get('x-supabase-auth-user-id') ??
    req.headers.get('x-supabase-auth-user') ??
    null
  if (!requesterId) {
    return json({ ok: false, message: 'Unauthorized.' }, 401)
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: notificationRow, error: notificationError } = await serviceClient
    .from('notifications')
    .select('id, actor_id, recipient_id, task_id')
    .eq('id', payload.notificationId)
    .maybeSingle()

  if (notificationError) {
    return json({ ok: false, message: notificationError.message }, 500)
  }

  if (!notificationRow) {
    return json({ ok: false, message: 'Notification not found.' }, 404)
  }

  if (notificationRow.actor_id !== requesterId) {
    return json({ ok: false, message: 'Only the actor can trigger this email.' }, 403)
  }

  if (notificationRow.task_id !== payload.taskId) {
    return json({ ok: false, message: 'Task mismatch for this notification.' }, 400)
  }

  const recipientId = payload.recipientId ?? notificationRow.recipient_id ?? undefined
  let recipientEmail = payload.recipientEmail?.trim().toLowerCase()

  if (!recipientEmail && recipientId) {
    const { data: profileRow } = await serviceClient
      .from('profiles')
      .select('email')
      .eq('id', recipientId)
      .maybeSingle()
    recipientEmail = profileRow?.email?.trim().toLowerCase()
  }

  if (!recipientEmail) {
    return json({ ok: false, message: 'Recipient email is missing.' }, 400)
  }

  const idempotencyType = payload.type

  const { data: existingDelivery } = await serviceClient
    .from('notification_email_deliveries')
    .select('id, status')
    .eq('notification_id', payload.notificationId)
    .eq('recipient_email', recipientEmail)
    .eq('type', idempotencyType)
    .maybeSingle()

  if (existingDelivery?.status === 'sent') {
    return json({ ok: true, status: 'already_sent', deliveryId: existingDelivery.id })
  }

  const appBaseUrl = (APP_BASE_URL || FALLBACK_APP_BASE_URL).replace(/\/+$/, '')
  const appUrl = `${appBaseUrl}/dashboard/notifications?openTaskId=${encodeURIComponent(payload.taskId)}`

  try {
    const sent = await sendResendEmail({
      to: recipientEmail,
      type: payload.type,
      actorName: payload.actorName,
      taskTitle: payload.taskTitle,
      appUrl,
    })

    if (existingDelivery?.id) {
      await serviceClient
        .from('notification_email_deliveries')
        .update({
          status: 'sent',
          provider: 'resend',
          provider_message_id: sent.id,
          error: null,
        })
        .eq('id', existingDelivery.id)
      return json({ ok: true, status: 'sent', deliveryId: existingDelivery.id })
    }

    const { data: createdDelivery, error: deliveryInsertError } = await serviceClient
      .from('notification_email_deliveries')
      .insert({
        notification_id: payload.notificationId,
        recipient_email: recipientEmail,
        type: idempotencyType,
        status: 'sent',
        provider: 'resend',
        provider_message_id: sent.id,
      })
      .select('id')
      .single()

    if (deliveryInsertError) {
      return json({ ok: false, message: deliveryInsertError.message }, 500)
    }

    return json({ ok: true, status: 'sent', deliveryId: createdDelivery.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send notification email.'
    console.error('notify-teammates provider error', {
      notificationId: payload.notificationId,
      recipientEmail,
      type: idempotencyType,
      message,
    })

    if (existingDelivery?.id) {
      await serviceClient
        .from('notification_email_deliveries')
        .update({
          status: 'failed',
          provider: 'resend',
          error: message,
        })
        .eq('id', existingDelivery.id)
      return json({ ok: true, status: 'provider_error_recorded', message, deliveryId: existingDelivery.id }, 200)
    }

    await serviceClient.from('notification_email_deliveries').insert({
      notification_id: payload.notificationId,
      recipient_email: recipientEmail,
      type: idempotencyType,
      status: 'failed',
      provider: 'resend',
      error: message,
    })

    return json({ ok: true, status: 'provider_error_recorded', message }, 200)
  }
})
