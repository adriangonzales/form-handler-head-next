'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** A searchable list of IANA timezones. An empty value means none is set (The Backend uses UTC). */
export function TimezoneSelect({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (timezone: string) => void
  invalid?: boolean
  describedBy?: string
}) {
  const [open, setOpen] = useState(false)
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone'), [])

  function choose(timezone: string) {
    onChange(timezone)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value || 'UTC (not set)'}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezones" aria-label="Search timezones" />
          <CommandList>
            <CommandEmpty>No timezone matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="UTC (not set)" onSelect={() => choose('')}>
                <Check className={cn(value ? 'opacity-0' : 'opacity-100')} aria-hidden />
                UTC (not set)
              </CommandItem>
              {timezones.map((timezone) => (
                <CommandItem key={timezone} value={timezone} onSelect={() => choose(timezone)}>
                  <Check
                    className={cn(value === timezone ? 'opacity-100' : 'opacity-0')}
                    aria-hidden
                  />
                  {timezone}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
