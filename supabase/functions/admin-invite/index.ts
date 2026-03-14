import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type InviteRole = 'owner' | 'admin' | 'member' | 'viewer'
type InviteAction = 'invite' | 'list' | 'resend' | 'revoke'

type InvitePayload = {
  action: InviteAction
  invitationId?: string
  email?: string
  fullName?: string
  jobTitle?: string
  department?: string
  role?: InviteRole
  projectIds?: string[]
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? ''
const TEMP_PASSWORD = '12345678'
const FALLBACK_APP_BASE_URL = 'https://contas.cloudninetech.co.za'

function getAppBaseUrl() {
  return (Deno.env.get('APP_BASE_URL') ?? FALLBACK_APP_BASE_URL).replace(/\/+$/, '')
}

function loginUrl() {
  return `${getAppBaseUrl()}/`
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isAlreadyExistsError(message: string) {
  return /already been registered|already exists|already invited|user already exists|duplicate/i.test(message)
}

async function sendResendInviteEmail(input: {
  to: string
  invitedByName: string
  fullName: string
  role: InviteRole
}) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error('Missing RESEND_API_KEY or RESEND_FROM_EMAIL.')
  }

  const appUrl = loginUrl()
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 12px;">You are invited to Organization Hub</h2>
      <p>${input.invitedByName} invited <strong>${input.fullName}</strong> as <strong>${input.role}</strong>.</p>
      <p>Your temporary login password is: <strong>${TEMP_PASSWORD}</strong></p>
      <p>You will be required to reset this password immediately after first login.</p>
      <p>Use the button below to continue to your workspace:</p>
      <p>
        <a href="${appUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;">
          Open Organization Hub
        </a>
      </p>
      <p style="font-size: 13px; color: #475569;">If the button does not work, open: ${appUrl}</p>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [input.to],
      subject: 'You have been invited to Organization Hub',
      html,
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

async function requireAdmin(req: Request) {
  const authorization = req.headers.get('Authorization') ?? ''
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)
  const accessToken = tokenMatch?.[1]?.trim() ?? ''
  if (!accessToken) {
    return { error: json({ ok: false, status: 'error', message: 'Missing bearer token.' }, 401) }
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: json({ ok: false, status: 'error', message: 'Missing Supabase environment variables.' }, 500) }
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !authData.user) {
    return { error: json({ ok: false, status: 'error', message: authError?.message ?? 'Unauthorized.' }, 401) }
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, full_name, email, role_label')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError) {
    return { error: json({ ok: false, status: 'error', message: profileError.message }, 500) }
  }

  if ((profile?.role_label ?? '').toLowerCase() !== 'admin') {
    return { error: json({ ok: false, status: 'error', message: 'Admin access required.' }, 403) }
  }

  return {
    serviceClient,
    user: {
      id: authData.user.id,
      fullName: profile?.full_name ?? authData.user.email ?? 'Admin',
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, status: 'error', message: 'Method not allowed.' }, 405)
  }

  const adminCheck = await requireAdmin(req)
  if ('error' in adminCheck) return adminCheck.error

  const { serviceClient, user } = adminCheck

  let payload: InvitePayload
  try {
    payload = (await req.json()) as InvitePayload
  } catch {
    return json({ ok: false, status: 'error', message: 'Invalid JSON payload.' }, 400)
  }

  const action = payload.action
  if (!action) {
    return json({ ok: false, status: 'error', message: 'Missing action.' }, 400)
  }

  if (action === 'list') {
    const { data, error } = await serviceClient
      .from('organization_invitations')
      .select('id, email, role, status, created_at, expires_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return json({ ok: false, status: 'error', message: error.message }, 500)

    return json({
      ok: true,
      status: 'invited',
      invitations: (data ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })),
    })
  }

  if (action === 'revoke') {
    if (!payload.invitationId) return json({ ok: false, status: 'error', message: 'Missing invitationId.' }, 400)
    const { data, error } = await serviceClient
      .from('organization_invitations')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', payload.invitationId)
      .select('id')
      .maybeSingle()

    if (error) return json({ ok: false, status: 'error', message: error.message }, 500)
    if (!data) return json({ ok: false, status: 'error', message: 'Invitation not found.' }, 404)
    return json({ ok: true, status: 'invited', invitationId: data.id, message: 'Invitation revoked.' })
  }

  if (action === 'resend') {
    if (!payload.invitationId) return json({ ok: false, status: 'error', message: 'Missing invitationId.' }, 400)
    const { data: invitation, error: invitationError } = await serviceClient
      .from('organization_invitations')
      .select('id, email, role, status, metadata')
      .eq('id', payload.invitationId)
      .maybeSingle()

    if (invitationError) return json({ ok: false, status: 'error', message: invitationError.message }, 500)
    if (!invitation) return json({ ok: false, status: 'error', message: 'Invitation not found.' }, 404)

    const fullName = (invitation.metadata as { full_name?: string } | null)?.full_name?.trim()
    if (!fullName) {
      return json({ ok: false, status: 'error', message: 'Invitation record missing full_name.' }, 400)
    }

    try {
      const sent = await sendResendInviteEmail({
        to: invitation.email,
        invitedByName: user.fullName,
        fullName,
        role: invitation.role as InviteRole,
      })

      await serviceClient
        .from('organization_invitations')
        .update({
          status: invitation.status === 'revoked' ? 'pending' : invitation.status,
          delivery_status: 'sent',
          delivery_error: null,
          resend_message_id: sent.id,
          last_sent_at: new Date().toISOString(),
          invited_by: user.id,
        })
        .eq('id', invitation.id)

      return json({ ok: true, status: 'invited', invitationId: invitation.id, message: 'Invite resent.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invite email.'
      await serviceClient
        .from('organization_invitations')
        .update({ delivery_status: 'failed', delivery_error: message })
        .eq('id', invitation.id)
      return json({ ok: false, status: 'error', invitationId: invitation.id, message }, 502)
    }
  }

  const email = payload.email ? normalizeEmail(payload.email) : ''
  const role = payload.role ?? 'member'
  const projectIds = Array.isArray(payload.projectIds) ? payload.projectIds.filter(Boolean) : []
  const fullName = payload.fullName?.trim() ?? ''
  const jobTitle = payload.jobTitle?.trim() ?? ''
  const department = payload.department?.trim() ?? ''

  if (!email || !isEmail(email)) {
    return json({ ok: false, status: 'error', message: 'A valid email is required.' }, 400)
  }
  if (!fullName) {
    return json({ ok: false, status: 'error', message: 'Full name is required.' }, 400)
  }
  if (!jobTitle) {
    return json({ ok: false, status: 'error', message: 'Job title is required.' }, 400)
  }
  if (!department) {
    return json({ ok: false, status: 'error', message: 'Department is required.' }, 400)
  }

  const { data: existingPending } = await serviceClient
    .from('organization_invitations')
    .select('id')
    .eq('email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingPending?.id) {
    return json({ ok: true, status: 'already_invited', invitationId: existingPending.id, message: 'User already invited.' })
  }

  const { data: existingProfile } = await serviceClient.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existingProfile?.id) {
    return json({ ok: true, status: 'already_invited', message: 'User already exists.' })
  }

  const createUserResult = await serviceClient.auth.admin.createUser({
    email,
    password: TEMP_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role_label: role,
      job_title: jobTitle,
      department,
      project_ids: projectIds,
      must_reset_password: true,
    },
  })

  if (createUserResult.error || !createUserResult.data.user) {
    if (createUserResult.error && isAlreadyExistsError(createUserResult.error.message)) {
      return json({ ok: true, status: 'already_invited', message: 'User already exists.' })
    }
    return json({ ok: false, status: 'error', message: createUserResult.error?.message ?? 'Failed to create user.' }, 400)
  }

  const invitedUser = createUserResult.data.user

  const { error: profileUpsertError } = await serviceClient.from('profiles').upsert({
    id: invitedUser.id,
    full_name: fullName,
    username: fullName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9._-]/g, ''),
    email,
    role_label: role,
    job_title: jobTitle,
    department,
    must_reset_password: true,
  })

  if (profileUpsertError) {
    return json({ ok: false, status: 'error', message: profileUpsertError.message }, 500)
  }

  const invitationPayload = {
    email,
    role,
    invited_by: user.id,
    invited_user_id: invitedUser.id,
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      full_name: fullName,
      job_title: jobTitle,
      department,
      project_ids: projectIds,
      invited_via: 'admin-invite',
      app_base_url: getAppBaseUrl(),
    },
  }

  const { data: invitation, error: invitationError } = await serviceClient
    .from('organization_invitations')
    .insert(invitationPayload)
    .select('id')
    .single()

  if (invitationError || !invitation) {
    return json({ ok: false, status: 'error', message: invitationError?.message ?? 'Failed to create invitation record.' }, 500)
  }

  try {
    const sent = await sendResendInviteEmail({
      to: email,
      invitedByName: user.fullName,
      fullName,
      role,
    })

    await serviceClient
      .from('organization_invitations')
      .update({
        delivery_status: 'sent',
        delivery_error: null,
        resend_message_id: sent.id,
        last_sent_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)

    return json({ ok: true, status: 'invited', invitationId: invitation.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invite email failed.'
    await serviceClient
      .from('organization_invitations')
      .update({ delivery_status: 'failed', delivery_error: message })
      .eq('id', invitation.id)

    return json({ ok: true, status: 'invited', invitationId: invitation.id, message: 'Invitation created but email delivery failed.' })
  }
})
