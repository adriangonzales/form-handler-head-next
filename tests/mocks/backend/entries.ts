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
