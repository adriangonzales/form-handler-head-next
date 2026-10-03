import type { ApiQuery } from '@/lib/backend/query'
import type { ListQueryOptions, ListQueryState } from '@/lib/list-query'
import { orderedFields } from '@/lib/schema/builder'
import type { FormEntry, FormEntryBulkAction, FormEntryQuery, FormSchema } from '@/types/models'

export const entryStatuses = ['inbox', 'unread', 'starred', 'spam', 'trash'] as const
export type EntryStatus = (typeof entryStatuses)[number]

export const entryStatusLabels: Record<EntryStatus, string> = {
  inbox: 'Inbox',
  unread: 'Unread',
  starred: 'Starred',
  spam: 'Spam',
  trash: 'Trash',
}

/** The tabs that show a count badge. */
export const countedStatuses = ['inbox', 'unread', 'spam'] as const
export type CountedStatus = (typeof countedStatuses)[number]

export const entrySorts = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: '-spam_score', label: 'Most likely spam' },
  { value: 'spam_score', label: 'Least likely spam' },
] as const

const datePattern = /^\d{4}-\d{2}-\d{2}$/

export type EntryFilter = 'status' | 'from' | 'to'

export const entryListOptions: ListQueryOptions<EntryFilter> = {
  sorts: entrySorts.map((sort) => sort.value),
  // The API's default is oldest first, so the dashboard always sends a sort.
  defaultSort: '-created_at',
  filters: {
    status: entryStatuses,
    from: (value) => datePattern.test(value),
    to: (value) => datePattern.test(value),
  },
  defaultFilter: { status: 'inbox' },
}

type ApiFilter = NonNullable<FormEntryQuery['filter']>

const statusFilters: Record<EntryStatus, ApiFilter> = {
  inbox: { spam: 'false' },
  unread: { read: 'false', spam: 'false' },
  starred: { starred: 'true' },
  spam: { spam: 'true' },
  trash: { trashed: 'only' },
}

export function entryStatus(state: ListQueryState<EntryFilter>): EntryStatus {
  return (state.filter.status as EntryStatus | undefined) ?? 'inbox'
}

/** `filter[…]` query parameters for a filter object. */
export function filterQuery(filter: ApiFilter): ApiQuery {
  return Object.fromEntries(
    Object.entries(filter).map(([name, value]) => [`filter[${name}]`, value as string]),
  )
}

/** The API's `filter[…]` for a tab and date range. Dates are whole UTC days, both inclusive. */
export function entryApiFilter(status: EntryStatus, from?: string, to?: string): ApiFilter {
  return {
    ...statusFilters[status],
    ...(from ? { created_from: from } : {}),
    ...(to ? { created_to: to } : {}),
  }
}

/** The API query for the entries list: page, size, sort and the contract's `filter[…]`. */
export function entryApiQuery(state: ListQueryState<EntryFilter>): ApiQuery {
  const query: ApiQuery = {
    page: state.page,
    per_page: state.perPage,
    sort: state.sort,
  }

  for (const [name, value] of Object.entries(
    entryApiFilter(entryStatus(state), state.filter.from, state.filter.to),
  )) {
    query[`filter[${name}]`] = value
  }

  return query
}

export interface EntryField {
  /** The key the submitted value is stored under: the field's input name, or its ID. */
  key: string
  label: string
}

/** The schema's fields sorted by `order`, keyed the way entries store their input. */
export function entryFields(schema: FormSchema | null | undefined): EntryField[] {
  return orderedFields(schema).map((field) => {
    const key = field.name || field.id

    return { key, label: field.label || key }
  })
}

/** Input keys that aren't in the schema (removed or renamed fields), in submission order. */
export function otherFieldKeys(input: FormEntry['input'], fields: readonly EntryField[]): string[] {
  const known = new Set(fields.map((field) => field.key))

  return Object.keys(input ?? {}).filter((key) => !known.has(key))
}

/** A submitted value as text: lists joined with `, `, other structures as compact JSON. */
export function formatEntryValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item),
      )
      .join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export type SpamCheckState = 'checked' | 'checking' | 'unchecked'

/**
 * Whether the background spam check has run. The API doesn't say whether a check is still queued,
 * so an unchecked entry younger than `windowMs` is assumed to be waiting for one.
 */
export function spamCheckState(
  entry: Pick<FormEntry, 'spam_checked_at' | 'created_at'>,
  now: number,
  windowMs: number,
): SpamCheckState {
  if (entry.spam_checked_at) {
    return 'checked'
  }

  const created = entry.created_at ? Date.parse(entry.created_at) : Number.NaN

  return now - created < windowMs ? 'checking' : 'unchecked'
}

/**
 * The classifier's spam likelihood as a whole percentage, or null when there isn't one: before the
 * check, and for entries that were never classified. Those are marked checked when they arrive
 * (honeypot hits, entries added through the API) with a score of 0.
 */
export function spamLikelihood(
  entry: Pick<FormEntry, 'spam' | 'spam_score' | 'spam_checked_at' | 'created_at'>,
): number | null {
  const score = entry.spam_score

  if (!entry.spam_checked_at || !Number.isFinite(score)) {
    return null
  }

  const checkedOnArrival =
    entry.created_at !== null &&
    Math.abs(Date.parse(entry.spam_checked_at) - Date.parse(entry.created_at)) < 1000

  if (score === 0 && (entry.spam || checkedOnArrival)) {
    return null
  }

  return Math.round(Math.min(Math.max(score, 0), 1) * 100)
}

/** The entries before and after `id`, from the rows on the current page. */
export function adjacentEntries<T extends { id: string }>(
  rows: readonly T[],
  id: string,
  /** Where the entry was last seen, for when it has since left the list (moved to Spam, read in Unread). */
  lastIndex?: number,
): { previous?: T; next?: T; index: number } {
  const index = rows.findIndex((row) => row.id === id)

  if (index !== -1) {
    return { previous: rows[index - 1], next: rows[index + 1], index }
  }

  if (lastIndex === undefined) {
    return { index: -1 }
  }

  // The entry left the list, so the one after it moved up into its place.
  return { previous: rows[lastIndex - 1], next: rows[lastIndex], index: -1 }
}

export interface BulkActionItem {
  action: FormEntryBulkAction
  label: string
  /** Past tense for the result toast: "3 entries starred". */
  done: string
  destructive?: boolean
}

const liveActions: BulkActionItem[] = [
  { action: 'mark_read', label: 'Mark read', done: 'marked read' },
  { action: 'mark_unread', label: 'Mark unread', done: 'marked unread' },
  { action: 'star', label: 'Star', done: 'starred' },
  { action: 'unstar', label: 'Unstar', done: 'unstarred' },
  {
    action: 'mark_spam',
    label: 'Mark spam',
    done: 'marked as spam',
  },
  {
    action: 'mark_not_spam',
    label: 'Not spam',
    done: 'marked as not spam',
  },
  {
    action: 'delete',
    label: 'Delete',
    done: 'deleted',
    destructive: true,
  },
]

const trashActions: BulkActionItem[] = [
  { action: 'restore', label: 'Restore', done: 'restored' },
  {
    action: 'force_delete',
    label: 'Delete permanently',
    done: 'permanently deleted',
    destructive: true,
  },
]

export function bulkActionsFor(status: EntryStatus): BulkActionItem[] {
  return status === 'trash' ? trashActions : liveActions
}

export function entriesLabel(count: number) {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`
}

/** The toast after a bulk action, from the API's `affected` count. */
export function bulkResultMessage(item: BulkActionItem, affected: number, selected: number) {
  if (affected === 0) {
    return `No changes: the ${selected === 1 ? 'entry was' : 'entries were'} already ${item.done}.`
  }

  return `${entriesLabel(affected)} ${item.done}`
}

/** A 422 on `ids.N` means an entry changed state (deleted, restored) since the list loaded. */
export function isStaleSelectionError(errors: Record<string, string[]>) {
  return Object.keys(errors).some((key) => key === 'ids' || key.startsWith('ids.'))
}
