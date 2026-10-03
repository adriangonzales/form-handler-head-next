// The entries date filter works in whole UTC days (`YYYY-MM-DD`), which the calendar shows as
// local dates. These convert between the two without shifting the day.

/** A calendar date as `YYYY-MM-DD`, from its local year, month and day. */
export function toDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` as a local date for the calendar, or undefined when it isn't a real day. */
export function fromDay(day: string | undefined): Date | undefined {
  const match = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) return undefined

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))

  return toDay(date) === day ? date : undefined
}

/** "2 Oct 2026", for a `YYYY-MM-DD` day in UTC. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  )
}

/** The filter button's text for a range. */
export function rangeLabel(from?: string, to?: string): string {
  if (from && to) return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`
  if (from) return `From ${formatDay(from)}`
  if (to) return `Until ${formatDay(to)}`

  return 'Any date'
}
