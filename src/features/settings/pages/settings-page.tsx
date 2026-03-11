import {
  Activity,
  Bell,
  BriefcaseBusiness,
  Building2,
  Camera,
  CircleUserRound,
  Flame,
  Mail,
  Medal,
  MonitorCog,
  SmartphoneNfc,
  Plug,
  Shield,
  Smartphone,
  Trophy,
  Trash2,
  UserCircle2,
  UserRoundCog,
} from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type ComponentType } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/context/auth-context'
import { useOrganization } from '@/features/organization/context/organization-context'
import { uploadAvatarToR2 } from '@/lib/r2'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type SettingsTabKey = 'profile' | 'organization' | 'notifications' | 'account' | 'display' | 'apps'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'border-primary bg-primary' : 'border-border bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-card transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className='mb-4 flex items-start gap-3'>
      <div className='mt-0.5 rounded-md border bg-muted/40 p-2'>
        <Icon className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
      </div>
      <div>
        <h3 className='text-base font-semibold text-foreground'>{title}</h3>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
    </div>
  )
}

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function isDirectAvatarUrl(value?: string | null) {
  if (!value) return false
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')
}

const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string }> = [
  { key: 'profile', label: 'Profile' },
  { key: 'organization', label: 'Organization' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'account', label: 'Account' },
  { key: 'display', label: 'Display' },
  { key: 'apps', label: 'Apps' },
]

const MONTHLY_PERFORMANCE = [
  { month: 'Sep', energy: 28, rank: 21 },
  { month: 'Oct', energy: 35, rank: 17 },
  { month: 'Nov', energy: 43, rank: 11 },
  { month: 'Dec', energy: 39, rank: 13 },
  { month: 'Jan', energy: 52, rank: 8 },
  { month: 'Feb', energy: 57, rank: 6 },
]

export function SettingsPage() {
  const { currentUser, updateCurrentUser } = useAuth()
  const { currentOrganization } = useOrganization()

  const [activeTab, setActiveTab] = useState<SettingsTabKey>('profile')

  const [emailUpdates, setEmailUpdates] = useState(true)
  const [pushAlerts, setPushAlerts] = useState(false)
  const [weeklyDigest, setWeeklyDigest] = useState(true)
  const [twoFactor, setTwoFactor] = useState(false)
  const [outOfOffice, setOutOfOffice] = useState(false)
  const [outOfOfficeStart, setOutOfOfficeStart] = useState<Date | undefined>()
  const [outOfOfficeEnd, setOutOfOfficeEnd] = useState<Date | undefined>()
  const [connectedCalendar, setConnectedCalendar] = useState(true)
  const [slackSync, setSlackSync] = useState(false)
  const [mobileAppSync, setMobileAppSync] = useState(true)
  const [gmailAddonSync, setGmailAddonSync] = useState(false)
  const [teamsSync, setTeamsSync] = useState(false)
  const [profileName, setProfileName] = useState(currentUser?.name ?? 'Organization User')
  const [profileEmail, setProfileEmail] = useState(currentUser?.email ?? 'user@example.com')
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | undefined>(currentUser?.avatarUrl)
  const [profileAvatarPath, setProfileAvatarPath] = useState<string | undefined>(currentUser?.avatarPath)
  const [profilePronouns, setProfilePronouns] = useState('She/Her')
  const [profileJobTitle, setProfileJobTitle] = useState('Product Manager')
  const [profileDepartment, setProfileDepartment] = useState('Product')
  const [profileRoleLabel, setProfileRoleLabel] = useState('Admin')
  const [profileAboutMe, setProfileAboutMe] = useState(
    'I lead roadmap planning, sprint coordination, and stakeholder communication across teams.',
  )
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const currentEnergy = MONTHLY_PERFORMANCE[MONTHLY_PERFORMANCE.length - 1]?.energy ?? 0
  const currentRank = MONTHLY_PERFORMANCE[MONTHLY_PERFORMANCE.length - 1]?.rank ?? 0
  const bestRank = Math.min(...MONTHLY_PERFORMANCE.map((entry) => entry.rank))
  const maxEnergy = Math.max(...MONTHLY_PERFORMANCE.map((entry) => entry.energy), 1)

  useEffect(() => {
    setProfileName(currentUser?.name ?? 'Organization User')
    setProfileEmail(currentUser?.email ?? 'user@example.com')
    setProfileAvatarUrl(currentUser?.avatarUrl)
    setProfileAvatarPath(currentUser?.avatarPath)
  }, [currentUser?.avatarPath, currentUser?.avatarUrl, currentUser?.email, currentUser?.name])

  useEffect(() => {
    if (!currentUser?.id) return

    let cancelled = false

    void supabase
      .from('profiles')
      .select(
        'full_name, email, avatar_url, pronouns, job_title, department, role_label, about_me, out_of_office, out_of_office_start, out_of_office_end',
      )
      .eq('id', currentUser.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return

        setProfileName(data.full_name ?? currentUser.name ?? 'Organization User')
        setProfileEmail(data.email ?? currentUser.email ?? 'user@example.com')
        setProfileAvatarUrl(isDirectAvatarUrl(data.avatar_url) ? (data.avatar_url ?? undefined) : currentUser.avatarUrl)
        setProfileAvatarPath(!isDirectAvatarUrl(data.avatar_url) ? (data.avatar_url ?? undefined) : currentUser.avatarPath)
        setProfilePronouns(data.pronouns ?? 'She/Her')
        setProfileJobTitle(data.job_title ?? 'Product Manager')
        setProfileDepartment(data.department ?? 'Product')
        setProfileRoleLabel(data.role_label ?? 'Admin')
        setProfileAboutMe(
          data.about_me ?? 'I lead roadmap planning, sprint coordination, and stakeholder communication across teams.',
        )
        setOutOfOffice(data.out_of_office ?? false)
        setOutOfOfficeStart(data.out_of_office_start ? new Date(data.out_of_office_start) : undefined)
        setOutOfOfficeEnd(data.out_of_office_end ? new Date(data.out_of_office_end) : undefined)
      })

    return () => {
      cancelled = true
    }
  }, [currentUser?.avatarPath, currentUser?.avatarUrl, currentUser?.email, currentUser?.id, currentUser?.name])

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    setUploadingAvatar(true)
    setAvatarError(null)
    try {
      const upload = await uploadAvatarToR2(file)
      setProfileAvatarUrl(upload.url)
      setProfileAvatarPath(upload.key)
      updateCurrentUser({ avatarUrl: upload.url, avatarPath: upload.key })
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Avatar upload failed.')
    } finally {
      setUploadingAvatar(false)
      event.target.value = ''
    }
  }

  const handleRemoveAvatar = () => {
    setProfileAvatarUrl(undefined)
    setProfileAvatarPath(undefined)
    setAvatarError(null)
    updateCurrentUser({ avatarUrl: undefined, avatarPath: undefined })
  }

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <>
            <CardHeader>
              <SectionHeader icon={UserCircle2} title='Profile' description='Update identity and contact details.' />
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <div className='rounded-lg border bg-muted/10 p-4 md:col-span-2'>
                <div className='flex flex-wrap items-center justify-between gap-4'>
                  <div className='flex items-center gap-3'>
                    <Avatar className='h-16 w-16 border'>
                      {profileAvatarUrl ? <AvatarImage src={profileAvatarUrl} alt={profileName} className='object-cover' /> : null}
                      <AvatarFallback className='text-sm font-semibold'>{initials(profileName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='font-medium text-foreground'>Profile photo</p>
                      <p className='text-sm text-muted-foreground'>JPG, PNG, or WEBP. Recommended square image.</p>
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <input
                      ref={avatarInputRef}
                      type='file'
                      accept='image/*'
                      onChange={(event) => void handleAvatarFileChange(event)}
                      className='hidden'
                    />
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      <Camera className='mr-2 h-4 w-4' aria-hidden='true' />
                      {uploadingAvatar ? 'Uploading...' : profileAvatarUrl ? 'Change photo' : 'Upload photo'}
                    </Button>
                    {profileAvatarUrl ? (
                      <Button type='button' variant='outline' onClick={handleRemoveAvatar}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                {avatarError ? <p className='mt-3 text-xs text-destructive'>{avatarError}</p> : null}
              </div>

              <div className='grid gap-4 md:col-span-2 lg:grid-cols-3'>
                <div className='rounded-lg border bg-muted/10 p-4 lg:col-span-1'>
                  <p className='mb-3 text-sm font-semibold text-foreground'>Overview</p>
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between rounded-md border px-3 py-2'>
                      <span className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
                        <Flame className='h-4 w-4 text-amber-500' />
                        Energy Points
                      </span>
                      <span className='font-semibold text-foreground'>{currentEnergy}</span>
                    </div>
                    <div className='flex items-center justify-between rounded-md border px-3 py-2'>
                      <span className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
                        <Trophy className='h-4 w-4 text-violet-500' />
                        Current Rank
                      </span>
                      <span className='font-semibold text-foreground'>#{currentRank}</span>
                    </div>
                    <div className='flex items-center justify-between rounded-md border px-3 py-2'>
                      <span className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
                        <Medal className='h-4 w-4 text-emerald-500' />
                        Best Rank
                      </span>
                      <span className='font-semibold text-foreground'>#{bestRank}</span>
                    </div>
                  </div>
                </div>

                <div className='rounded-lg border bg-muted/10 p-4 lg:col-span-2'>
                  <div className='mb-3 flex items-center justify-between'>
                    <p className='text-sm font-semibold text-foreground'>Energy Points</p>
                    <p className='text-xs text-muted-foreground'>Monthly</p>
                  </div>
                  <div className='grid h-32 grid-cols-6 items-end gap-2'>
                    {MONTHLY_PERFORMANCE.map((entry) => (
                      <div key={entry.month} className='flex h-full flex-col items-center justify-end gap-1.5'>
                        <div className='text-[11px] text-muted-foreground'>{entry.energy}</div>
                        <div className='flex h-[85%] w-full items-end rounded bg-muted/50 p-1'>
                          <div
                            className='w-full rounded-sm bg-primary/80'
                            style={{ height: `${(entry.energy / maxEnergy) * 100}%` }}
                          />
                        </div>
                        <div className='text-[11px] text-muted-foreground'>{entry.month}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='rounded-lg border bg-muted/10 p-4 lg:col-span-3'>
                  <div className='mb-3 flex items-center justify-between'>
                    <p className='inline-flex items-center gap-2 text-sm font-semibold text-foreground'>
                      <Activity className='h-4 w-4 text-blue-500' />
                      Rank by Month
                    </p>
                    <p className='text-xs text-muted-foreground'>Lower rank number means better position</p>
                  </div>
                  <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
                    {MONTHLY_PERFORMANCE.map((entry) => (
                      <div key={`rank-${entry.month}`} className='flex items-center justify-between rounded-md border px-3 py-2'>
                        <span className='text-sm text-muted-foreground'>{entry.month}</span>
                        <span className='text-sm font-semibold text-foreground'>#{entry.rank}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Full Name</label>
                <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Email</label>
                <Input type='email' value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Pronouns</label>
                <Input value={profilePronouns} onChange={(event) => setProfilePronouns(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Job Title</label>
                <Input value={profileJobTitle} onChange={(event) => setProfileJobTitle(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Department</label>
                <Input value={profileDepartment} onChange={(event) => setProfileDepartment(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Role</label>
                <Input value={profileRoleLabel} onChange={(event) => setProfileRoleLabel(event.target.value)} />
              </div>
              <div className='space-y-2 md:col-span-2'>
                <label className='text-sm font-medium text-foreground'>About Me</label>
                <textarea
                  value={profileAboutMe}
                  onChange={(event) => setProfileAboutMe(event.target.value)}
                  rows={4}
                  className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                />
              </div>
              <div className='space-y-3 rounded-lg border p-3 md:col-span-2'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='font-medium text-foreground'>Out of office</p>
                    <p className='text-sm text-muted-foreground'>
                      Team members will see you as unavailable during the selected time.
                    </p>
                  </div>
                  <Toggle checked={outOfOffice} onChange={setOutOfOffice} label='Toggle out of office status' />
                </div>
                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Start</label>
                    <DatePicker
                      value={outOfOfficeStart}
                      onChange={setOutOfOfficeStart}
                      disabled={!outOfOffice}
                      placeholder='Pick start date'
                    />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>End</label>
                    <DatePicker
                      value={outOfOfficeEnd}
                      onChange={setOutOfOfficeEnd}
                      disabled={!outOfOffice}
                      placeholder='Pick end date'
                    />
                  </div>
                </div>
              </div>
              <div className='flex justify-end md:col-span-2'>
                <Button
                  onClick={() =>
                    updateCurrentUser({
                      name: profileName.trim() || 'Organization User',
                      email: profileEmail.trim() || 'user@example.com',
                      jobTitle: profileJobTitle.trim() || 'Product Manager',
                      avatarUrl: profileAvatarUrl,
                      avatarPath: profileAvatarPath,
                    })
                  }
                >
                  Save profile
                </Button>
              </div>
            </CardContent>
          </>
        )

      case 'organization':
        return (
          <>
            <CardHeader>
              <SectionHeader icon={Building2} title='Organization' description='Manage your organization profile and operating details.' />
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Organization Name</label>
                  <Input defaultValue={currentOrganization.name} />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Plan</label>
                  <Input defaultValue={currentOrganization.plan} readOnly />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Legal Name</label>
                  <Input defaultValue={currentOrganization.legalName} />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Website</label>
                  <Input defaultValue={currentOrganization.website} />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Industry</label>
                  <Input defaultValue={currentOrganization.industry} />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Company Size</label>
                  <Input defaultValue={currentOrganization.size} />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Timezone</label>
                  <Input defaultValue={currentOrganization.timezone} />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Location</label>
                  <Input defaultValue={currentOrganization.location} />
                </div>
                <div className='space-y-2 md:col-span-2'>
                  <label className='text-sm font-medium text-foreground'>Organization Details</label>
                  <textarea
                    defaultValue={currentOrganization.description}
                    rows={4}
                    className='flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  />
                </div>
              </div>
              <div className='flex justify-end'>
                <Button variant='outline'>Update organization</Button>
              </div>
            </CardContent>
          </>
        )

      case 'notifications':
        return (
          <>
            <CardHeader>
              <SectionHeader icon={Bell} title='Notifications' description='Control when and how we notify you.' />
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div>
                  <p className='font-medium text-foreground'>Email task updates</p>
                  <p className='text-sm text-muted-foreground'>Receive task assignment and due date updates by email.</p>
                </div>
                <Toggle checked={emailUpdates} onChange={setEmailUpdates} label='Toggle email task updates' />
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div>
                  <p className='font-medium text-foreground'>Push alerts</p>
                  <p className='text-sm text-muted-foreground'>Show real-time desktop notifications for comments and mentions.</p>
                </div>
                <Toggle checked={pushAlerts} onChange={setPushAlerts} label='Toggle push alerts' />
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div>
                  <p className='font-medium text-foreground'>Weekly digest</p>
                  <p className='text-sm text-muted-foreground'>Get a weekly summary every Monday morning.</p>
                </div>
                <Toggle checked={weeklyDigest} onChange={setWeeklyDigest} label='Toggle weekly digest' />
              </div>
            </CardContent>
          </>
        )

      case 'account':
        return (
          <>
            <CardHeader>
              <SectionHeader icon={Shield} title='Account' description='Security and account access controls.' />
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='rounded-lg border p-3'>
                <div className='mb-3 flex items-center gap-2'>
                  <Mail className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                  <p className='font-medium text-foreground'>Email Addresses</p>
                </div>
                <div className='grid gap-3 md:grid-cols-3'>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Work Email</label>
                    <Input type='email' defaultValue={currentUser?.email ?? 'work@example.com'} />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Personal Email</label>
                    <Input type='email' defaultValue='personal@example.com' />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium text-foreground'>Other Email</label>
                    <Input type='email' defaultValue='other@example.com' />
                  </div>
                </div>
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div>
                  <p className='font-medium text-foreground'>Two-factor authentication</p>
                  <p className='text-sm text-muted-foreground'>Require a verification code during sign in.</p>
                </div>
                <Toggle checked={twoFactor} onChange={setTwoFactor} label='Toggle two-factor authentication' />
              </div>
              <div className='flex items-center justify-end gap-2'>
                <Button variant='outline'>Change password</Button>
                <Button variant='outline'>Manage sessions</Button>
                <Button variant='outline'>
                  <BriefcaseBusiness className='mr-2 h-4 w-4' aria-hidden='true' />
                  Manage work profile
                </Button>
              </div>
              <div className='rounded-lg border border-destructive/40 bg-destructive/5 p-3'>
                <div className='mb-3'>
                  <p className='font-medium text-foreground'>Danger Zone</p>
                  <p className='text-sm text-muted-foreground'>These actions affect account access and cannot be easily reversed.</p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button variant='outline'>
                    <UserRoundCog className='mr-2 h-4 w-4' aria-hidden='true' />
                    Deactivate account
                  </Button>
                  <Button variant='destructive'>
                    <Trash2 className='mr-2 h-4 w-4' aria-hidden='true' />
                    Delete account
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        )

      case 'display':
        return (
          <>
            <CardHeader>
              <SectionHeader icon={MonitorCog} title='Display' description='Personalize the interface and visual experience.' />
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>Language</label>
                  <select className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'>
                    <option>English (US)</option>
                    <option>English (UK)</option>
                    <option>French</option>
                    <option>Portuguese</option>
                  </select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-foreground'>First Day of the Week</label>
                  <select className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'>
                    <option>Monday</option>
                    <option>Sunday</option>
                    <option>Saturday</option>
                  </select>
                </div>
              </div>
              <div className='grid gap-3 md:grid-cols-3'>
                {['System', 'Light', 'Dark'].map((mode) => (
                  <button
                    key={mode}
                    type='button'
                    className='rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p className='text-sm text-muted-foreground'>Use the sidebar theme control for instant light/dark switching.</p>
              <div className='flex justify-end'>
                <Button variant='outline'>Save display preferences</Button>
              </div>
            </CardContent>
          </>
        )

      case 'apps':
        return (
          <>
            <CardHeader>
              <SectionHeader icon={Plug} title='Apps' description='Connect external apps and sync workflows.' />
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='rounded-lg border p-4'>
                <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
                  <div>
                    <p className='font-medium text-foreground'>Download Contas Mobile App</p>
                    <p className='text-sm text-muted-foreground'>
                      Scan the QR code to open the mobile app download page.
                    </p>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      <Badge variant='outline'>iOS</Badge>
                      <Badge variant='outline'>Android</Badge>
                    </div>
                  </div>
                  <div className='rounded-md border bg-card p-2'>
                    <img
                      src='https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https%3A%2F%2Fcontas.app%2Fdownload'
                      alt='QR code to download the Contas mobile app'
                      width={160}
                      height={160}
                      className='h-24 w-24 md:h-28 md:w-28'
                    />
                  </div>
                </div>
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div className='flex items-center gap-3'>
                  <SmartphoneNfc className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                  <div>
                    <p className='font-medium text-foreground'>Contas Mobile App</p>
                    <p className='text-sm text-muted-foreground'>Sync push alerts and mobile activity updates.</p>
                  </div>
                </div>
                <Toggle checked={mobileAppSync} onChange={setMobileAppSync} label='Toggle mobile app integration' />
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div className='flex items-center gap-3'>
                  <Mail className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                  <div>
                    <p className='font-medium text-foreground'>Gmail Add-on</p>
                    <p className='text-sm text-muted-foreground'>Turn emails into tasks directly from Gmail.</p>
                  </div>
                </div>
                <Toggle checked={gmailAddonSync} onChange={setGmailAddonSync} label='Toggle Gmail add-on integration' />
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div className='flex items-center gap-3'>
                  <CircleUserRound className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                  <div>
                    <p className='font-medium text-foreground'>Microsoft Teams</p>
                    <p className='text-sm text-muted-foreground'>Share task updates and reminders in team channels.</p>
                  </div>
                </div>
                <Toggle checked={teamsSync} onChange={setTeamsSync} label='Toggle Microsoft Teams integration' />
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div className='flex items-center gap-3'>
                  <Smartphone className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                  <div>
                    <p className='font-medium text-foreground'>Google Calendar</p>
                    <p className='text-sm text-muted-foreground'>Sync task deadlines with your calendar.</p>
                  </div>
                </div>
                <Toggle checked={connectedCalendar} onChange={setConnectedCalendar} label='Toggle calendar integration' />
              </div>
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <div className='flex items-center gap-3'>
                  <CircleUserRound className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                  <div>
                    <p className='font-medium text-foreground'>Slack</p>
                    <p className='text-sm text-muted-foreground'>Send project updates to your team channels.</p>
                  </div>
                </div>
                <Toggle checked={slackSync} onChange={setSlackSync} label='Toggle slack integration' />
              </div>
            </CardContent>
          </>
        )

      default:
        return null
    }
  }

  return (
    <div className='space-y-6'>
      <Card>
        <CardContent className='p-3'>
          <div className='overflow-x-auto'>
            <div className='inline-flex min-w-full gap-1 rounded-lg bg-muted/35 p-1'>
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type='button'
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeTab === tab.key
                      ? 'bg-card text-foreground border shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>{renderActiveSection()}</Card>
    </div>
  )
}
