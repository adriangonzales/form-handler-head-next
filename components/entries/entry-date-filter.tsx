'use client'

import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fromDay, rangeLabel, toDay } from '@/lib/entries/dates'

/** The received-date range. Dates are whole UTC days, both inclusive, as The Backend reads them. */
export function EntryDateFilter({
  from,
  to,
  error,
  onChange,
}: {
  from?: string
  to?: string
  /** A 422 from The Backend about the range. */
  error?: string
  onChange: (range: { from?: string; to?: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const label = rangeLabel(from, to)
  const active = Boolean(from || to)

  function openChange(next: boolean) {
    // Start from the range in the URL each time.
    if (next) setDraft({ from: fromDay(from), to: fromDay(to) })
    setOpen(next)
  }

  function apply() {
    onChange({
      from: draft?.from ? toDay(draft.from) : undefined,
      to: draft?.to ? toDay(draft.to) : draft?.from ? toDay(draft.from) : undefined,
    })
    setOpen(false)
  }

  return (
    <div className="flex flex-col">
      <Popover open={open} onOpenChange={openChange}>
        <PopoverTrigger asChild>
          <Button
            variant={active ? 'secondary' : 'outline'}
            aria-label={`Received date: ${label} (UTC)`}
            aria-invalid={!!error}
            aria-describedby={error ? 'entry-date-error' : undefined}
          >
            <CalendarDays aria-hidden />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="end">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={setDraft}
            defaultMonth={draft?.from}
            numberOfMonths={1}
          />
          <div className="flex items-center justify-between gap-4 px-1 pt-2">
            <p className="text-xs text-muted-foreground">Dates are in UTC.</p>
            <div className="flex gap-1">
              {active && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange({})
                    setOpen(false)
                  }}
                >
                  Clear
                </Button>
              )}
              <Button size="sm" disabled={!draft?.from} onClick={apply}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {error && (
        <p id="entry-date-error" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
