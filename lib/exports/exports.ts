import type { ApiQuery } from '@/lib/backend/query'
import { entrySorts } from '@/lib/entries/entries'
import type { FormEntryExport } from '@/types/models'

/** The filters and sort an export is created with, as the export endpoint takes and returns them. */
export type ExportParameters = FormEntryExport['parameters']

export function isInProgress(entryExport: Pick<FormEntryExport, 'status'>) {
  return entryExport.status === 'pending' || entryExport.status === 'processing'
}

/** How long to wait before polling an export again: every 2 s, then every 10 s after 30 s. */
export function pollDelay(elapsedMs: number) {
  return elapsedMs < 30_000 ? 2_000 : 10_000
}

/** The filters and sort the entries table is showing, as the export endpoint takes them. */
export function exportParameters(apiQuery: ApiQuery): ExportParameters {
  const filter: Record<string, string> = {}

  for (const [key, value] of Object.entries(apiQuery)) {
    const name = /^filter\[(.+)\]$/.exec(key)?.[1]

    if (name) {
      filter[name] = String(value)
    }
  }

  return { filter, sort: apiQuery.sort === undefined ? undefined : String(apiQuery.sort) }
}

/** Whether two exports were asked for with the same filters and sort. */
export function sameParameters(a: ExportParameters, b: ExportParameters) {
  return canonical(a) === canonical(b)
}

function canonical({ filter, sort }: ExportParameters) {
  const entries = Object.entries(filter ?? {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => [name, normaliseBoolean(String(value))])
    .sort(([a], [b]) => String(a).localeCompare(String(b)))

  return JSON.stringify([entries, sort ?? 'created_at'])
}

function normaliseBoolean(value: string) {
  return value === '1' ? 'true' : value === '0' ? 'false' : value
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

function formatDay(day: string) {
  const time = Date.parse(`${day}T00:00:00Z`)

  return Number.isNaN(time) ? day : dateFormat.format(time)
}

/** A short description of an export's filters and sort: "Unread · newest first", "All entries". */
export function summariseParameters(parameters: ExportParameters | null | undefined): string {
  const filter = parameters?.filter ?? {}
  const flag = (name: 'read' | 'starred' | 'spam') =>
    filter[name] === undefined ? undefined : normaliseBoolean(filter[name]) === 'true'
  const parts: string[] = []

  const read = flag('read')
  const starred = flag('starred')
  const spam = flag('spam')
  const statuses: string[] = []

  if (filter.trashed === 'only') statuses.push('Trash')
  else if (filter.trashed === 'with') statuses.push('Including trash')

  if (read === false && spam === false) {
    statuses.push('Unread')
  } else {
    if (spam === false) statuses.push('Inbox')
    if (spam === true) statuses.push('Spam')
    if (read === false) statuses.push('Unread')
    if (read === true) statuses.push('Read')
  }

  if (starred === true) statuses.push('Starred')
  if (starred === false) statuses.push('Not starred')

  parts.push(statuses.length > 0 ? statuses.join(', ') : 'All entries')

  const from = filter.created_from
  const to = filter.created_to

  if (from && to) {
    parts.push(from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`)
  } else if (from) {
    parts.push(`from ${formatDay(from)}`)
  } else if (to) {
    parts.push(`until ${formatDay(to)}`)
  }

  // The API sorts oldest first when no sort was given.
  const sort = entrySorts.find((item) => item.value === (parameters?.sort ?? 'created_at'))

  if (sort) {
    parts.push(sort.label.toLowerCase())
  }

  return parts.join(' · ')
}

/** Whether an export can no longer be downloaded because it has passed `expires_at`. */
export function isExpired(entryExport: Pick<FormEntryExport, 'expires_at'>, now: number) {
  return Date.parse(entryExport.expires_at) <= now
}
