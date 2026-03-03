import { Check, ChevronDown, LogOut, Settings, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/context/auth-context'
import { useTenant } from '@/features/tenancy/context/tenant-context'

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function AccountMenu() {
  const { currentUser, logout } = useAuth()
  const { currentTenant, availableTenants, switchTenant } = useTenant()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          aria-label='Open account menu'
        >
          <Avatar className='h-8 w-8 border'>
            {currentUser?.avatarUrl ? <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} /> : null}
            <AvatarFallback className='bg-muted text-xs font-semibold text-foreground'>
              {initials(currentUser?.name ?? 'User')}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>
          <div className='space-y-1'>
            <p className='text-sm font-medium leading-none'>{currentUser?.name ?? 'Workspace User'}</p>
            <p className='text-xs text-muted-foreground'>{currentUser?.email ?? 'user@example.com'}</p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className='text-xs text-muted-foreground'>Switch tenant</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={currentTenant.id} onValueChange={switchTenant}>
          {availableTenants.map((tenant) => (
            <DropdownMenuRadioItem key={tenant.id} value={tenant.id} className='flex items-center justify-between'>
              <span>{tenant.name}</span>
              {tenant.id === currentTenant.id && <Check className='h-3.5 w-3.5' />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Users className='mr-2 h-4 w-4' aria-hidden='true' />
          Team members
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/dashboard/settings')}>
          <Settings className='mr-2 h-4 w-4' aria-hidden='true' />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className='mr-2 h-4 w-4' aria-hidden='true' />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
