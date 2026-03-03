import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  className,
  fromYear = 1950,
  toYear = 2100,
}: {
  value?: Date
  onChange: (date?: Date) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  fromYear?: number
  toYear?: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          data-empty={!value}
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className='mr-2 h-4 w-4' aria-hidden='true' />
          {value ? format(value, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto overflow-hidden p-0' align='start'>
        <Calendar
          mode='single'
          selected={value}
          defaultMonth={value}
          captionLayout='dropdown'
          navLayout='around'
          fromYear={fromYear}
          toYear={toYear}
          onSelect={(date) => {
            onChange(date)
            setOpen(false)
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
