'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 hours ago", "in 2 days", or "just now" for under a minute. */
export function formatRelative(date: Date, now = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000)
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }

  return 'just now'
}

/** A relative time ("3 hours ago") with the full local date and time in a tooltip. */
export function RelativeTime({ datetime }: { datetime: string | null | undefined }) {
  if (!datetime) return <span className="text-muted-foreground">—</span>

  const date = new Date(datetime)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The server's clock and locale can differ from the browser's. */}
        <time dateTime={datetime} className="whitespace-nowrap" suppressHydrationWarning>
          {formatRelative(date)}
        </time>
      </TooltipTrigger>
      <TooltipContent>
        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
          date,
        )}
      </TooltipContent>
    </Tooltip>
  )
}
