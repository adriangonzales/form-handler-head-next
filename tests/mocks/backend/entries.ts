import { ulid } from '../../../lib/ulid'
import type { Form, FormEntry } from '../../../types/models'

// Public submissions and entries in the mock backend. Entries are minimal until milestone 5:
// stored, listed (with `filter[trashed]`), and updated (`read_at`, `spam`, `starred`).

type Errors = Record<string, string[]>

const isBlank = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

/** Splits rules like the contract: arrays as they are, strings on commas. */
function rulesOf(field: NonNullable<Form['schema']>[number]): string[] {
  const rules = Array.isArray(field.rules)
    ? field.rules
    : typeof field.rules === 'string'
      ? field.rules.split(',')
      : []

  return rules.map((rule) => rule.trim()).filter(Boolean)
}

/**
 * Validates a submission against the schema with the subset of the contract's rule syntax the
 * dashboard's presets use, and the reference Backend's messages. Other rules are ignored. Returns
 * the validated input: only fields in the schema are kept.
 */
export function validateSubmission(
  schema: Form['schema'],
  body: Record<string, unknown>,
  errors: Errors,
): Record<string, unknown> {
  const input: Record<string, unknown> = {}

  for (const field of schema ?? []) {
    const name = field.name || field.id
    const attribute = name.replaceAll('_', ' ')
    const rules = rulesOf(field)
    const value = body[name]
    const numeric = rules.includes('numeric')
    const fail = (message: string) => (errors[name] ??= []).push(message)

    if (isBlank(value)) {
      if (rules.includes('required')) fail(`The ${attribute} field is required.`)
      continue
    }

    const text = String(value)
    const size = numeric ? Number(text) : text.length

    for (const rule of rules) {
      const [ruleName, parameter = ''] = rule.split(/:(.*)/s)

      if (ruleName === 'email' && !emailPattern.test(text)) {
        fail(`The ${attribute} field must be a valid email address.`)
      } else if (ruleName === 'url' && !urlPattern.test(text)) {
        fail(`The ${attribute} field must be a valid URL.`)
      } else if (ruleName === 'numeric' && !Number.isFinite(Number(text))) {
        fail(`The ${attribute} field must be a number.`)
      } else if (ruleName === 'max' && size > Number(parameter)) {
        fail(
          numeric
            ? `The ${attribute} field must not be greater than ${parameter}.`
            : `The ${attribute} field must not be greater than ${parameter} characters.`,
        )
      } else if (ruleName === 'min' && size < Number(parameter)) {
        fail(
          numeric
            ? `The ${attribute} field must be at least ${parameter}.`
            : `The ${attribute} field must be at least ${parameter} characters.`,
        )
      } else if (ruleName === 'in' && !parameter.split(',').includes(text)) {
        fail(`The selected ${attribute} is invalid.`)
      }
    }

    input[name] = value
  }

  return input
}

/** Whether a `Referer` may submit under the form's allowed domains (an empty list allows all). */
export function refererAllowed(referer: string | null, domains: readonly string[] | null) {
  if (!domains || domains.length === 0) return true

  let host: string

  try {
    host = new URL(referer ?? '').hostname.toLowerCase()
  } catch {
    return false
  }

  return domains.some((domain) => {
    const pattern = domain.toLowerCase()

    return pattern.startsWith('*.')
      ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
      : host === pattern
  })
}

export function newEntry(
  form: Form,
  input: Record<string, unknown>,
  request: Request,
  options: { at: string; honeypotTripped: boolean },
): FormEntry {
  return {
    id: ulid(),
    form_id: form.id,
    input,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1',
    ip_location_display: null,
    referer: request.headers.get('referer'),
    user_agent: request.headers.get('user-agent'),
    user_agent_display: null,
    // The mock has no spam check: entries are checked on arrival, as honeypot hits are.
    spam: options.honeypotTripped ? true : null,
    spam_score: 0,
    spam_reason: options.honeypotTripped ? 'Honeypot field was filled in.' : null,
    spam_checked_at: options.at,
    starred: false,
    read_at: null,
    created_at: options.at,
    updated_at: options.at,
    deleted_at: null,
  }
}

/** The list-only counts the forms index includes. */
export function entryCounts(entries: readonly FormEntry[]) {
  const live = entries.filter((entry) => entry.deleted_at === null)
  const notSpam = live.filter((entry) => entry.spam !== true)

  return {
    entries_count: notSpam.length,
    unread_entries_count: notSpam.filter((entry) => entry.read_at === null).length,
    spam_entries_count: live.filter((entry) => entry.spam === true).length,
  }
}

const booleans = ['true', 'false', '1', '0']
const truthy = (value: string) => value === 'true' || value === '1'
const dayPattern = /^\d{4}-\d{2}-\d{2}$/

export const entrySorts = ['created_at', 'spam_score'].flatMap((key) => [key, `-${key}`])

/**
 * Filters and sorts a form's entries from the list query, like the reference Backend. Returns the
 * entries, or the validation errors.
 */
export function queryEntries(
  entries: readonly FormEntry[],
  params: URLSearchParams,
): FormEntry[] | Errors {
  const errors: Errors = {}
  const sort = params.get('sort') ?? 'created_at'
  const filter = (name: string) => params.get(`filter[${name}]`)
  const read = filter('read')
  const starred = filter('starred')
  const spam = filter('spam')
  const from = filter('created_from')
  const to = filter('created_to')
  const trashed = filter('trashed')

  if (!entrySorts.includes(sort)) errors.sort = ['The selected sort is invalid.']

  for (const [name, value] of Object.entries({ read, starred, spam })) {
    if (value !== null && !booleans.includes(value)) {
      errors[`filter.${name}`] = [`The selected filter.${name} is invalid.`]
    }
  }

  for (const [name, value] of Object.entries({ created_from: from, created_to: to })) {
    if (value !== null && !dayPattern.test(value)) {
      errors[`filter.${name}`] = [`The filter.${name} field must match the format Y-m-d.`]
    }
  }

  if (from && to && dayPattern.test(from) && dayPattern.test(to) && to < from) {
    errors['filter.created_to'] = [
      'The filter.created to field must be a date after or equal to filter.created from.',
    ]
  }

  if (trashed !== null && !['with', 'only'].includes(trashed)) {
    errors['filter.trashed'] = ['The selected filter.trashed is invalid.']
  }

  if (Object.keys(errors).length > 0) return errors

  const descending = sort.startsWith('-')
  const key = sort.replace(/^-/, '') as 'created_at' | 'spam_score'

  return entries
    .filter((entry) =>
      trashed === 'with'
        ? true
        : trashed === 'only'
          ? entry.deleted_at !== null
          : !entry.deleted_at,
    )
    .filter((entry) => read === null || (entry.read_at !== null) === truthy(read))
    .filter((entry) => starred === null || entry.starred === truthy(starred))
    .filter((entry) => spam === null || (entry.spam === true) === truthy(spam))
    .filter((entry) => !from || (entry.created_at ?? '') >= `${from}T00:00:00`)
    .filter((entry) => !to || (entry.created_at ?? '') <= `${to}T23:59:59.999999Z`)
    .sort((a, b) => {
      const left = a[key] ?? ''
      const right = b[key] ?? ''
      const order = left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : 1

      return descending ? -order : order
    })
}

/** The fields an entry update may change; submission fields are read-only. */
export function validateEntryUpdate(body: Record<string, unknown>): Errors {
  const errors: Errors = {}

  for (const key of ['input', 'user_agent_display', 'spam_checked_at']) {
    if (key in body) errors[key] = [`The ${key.replaceAll('_', ' ')} field must be missing.`]
  }

  if ('spam' in body && body.spam !== null && typeof body.spam !== 'boolean') {
    errors.spam = ['The spam field must be true or false.']
  }

  if ('starred' in body && typeof body.starred !== 'boolean') {
    errors.starred = ['The starred field must be true or false.']
  }

  if (
    'spam_score' in body &&
    (typeof body.spam_score !== 'number' || body.spam_score < 0 || body.spam_score > 9.99)
  ) {
    errors.spam_score = ['The spam score field must be between 0 and 9.99.']
  }

  if (
    'read_at' in body &&
    body.read_at !== null &&
    Number.isNaN(Date.parse(String(body.read_at)))
  ) {
    errors.read_at = ['The read at field must be a valid date.']
  }

  return errors
}

export const bulkActions = {
  forEntries: [
    'mark_read',
    'mark_unread',
    'star',
    'unstar',
    'mark_spam',
    'mark_not_spam',
    'delete',
  ],
  forDeletedEntries: ['restore', 'force_delete'],
}

/**
 * Applies a bulk action to entries that are in the state it changes, and returns how many changed,
 * like the reference Backend. `remove` deletes an entry for good.
 */
export function applyBulkAction(
  entries: FormEntry[],
  action: string,
  at: string,
  remove: (entry: FormEntry) => void,
): number {
  const changes: Record<string, [(entry: FormEntry) => boolean, (entry: FormEntry) => void]> = {
    mark_read: [(e) => e.read_at === null, (e) => (e.read_at = at)],
    mark_unread: [(e) => e.read_at !== null, (e) => (e.read_at = null)],
    star: [(e) => !e.starred, (e) => (e.starred = true)],
    unstar: [(e) => e.starred, (e) => (e.starred = false)],
    mark_spam: [(e) => e.spam !== true, (e) => (e.spam = true)],
    mark_not_spam: [(e) => e.spam !== false, (e) => (e.spam = false)],
    delete: [(e) => e.deleted_at === null, (e) => (e.deleted_at = at)],
    restore: [(e) => e.deleted_at !== null, (e) => (e.deleted_at = null)],
    force_delete: [(e) => e.deleted_at !== null, remove],
  }
  const [applies, apply] = changes[action]!
  const changed = entries.filter(applies)

  for (const entry of changed) {
    apply(entry)
    if (action !== 'force_delete') entry.updated_at = at
  }

  return changed.length
}
