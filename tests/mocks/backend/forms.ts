import { isUlid, ulid } from '../../../lib/ulid'
import type { Form, FormListItem, FormSettings } from '../../../types/models'

// Forms in the mock backend: storage, and validation following docs/backend-contract.md.

/** A stored form: the resource without the list-only entry counts. */
export type MockForm = Omit<Form, 'entries_count' | 'unread_entries_count' | 'spam_entries_count'>

type Errors = Record<string, string[]>

const settingKeys = [
  'redirect',
  'timezone',
  'domains',
  'message',
  'honeypot_enabled',
  'honeypot_name',
] as const
const fieldKeys = ['id', 'order', 'label', 'name', 'rules']
const domainPattern =
  /^(?=.{1,253}$)(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i
const honeypotNamePattern = /^[A-Za-z0-9_-]+$/
const timezones = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])

export const formSorts = ['name', 'created_at', 'updated_at'].flatMap((key) => [key, `-${key}`])

export function defaultSettings(): FormSettings {
  return {
    redirect: null,
    timezone: null,
    domains: [],
    message: null,
    honeypot_enabled: false,
    honeypot_name: null,
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function add(errors: Errors, key: string, message: string) {
  ;(errors[key] ??= []).push(message)
}

/** Validates a `schema` value, returning it sorted by `order` with rules as arrays. */
export function validateSchema(value: unknown, errors: Errors): Form['schema'] {
  if (value === null || value === undefined) return null

  if (!Array.isArray(value)) {
    add(errors, 'schema', 'The schema field must be a list.')

    return null
  }

  const ids = new Set<string>()

  value.forEach((field: unknown, index) => {
    const at = `schema.${index}`

    if (!isObject(field)) return add(errors, at, 'Each field must be an object.')

    for (const key of Object.keys(field)) {
      if (!fieldKeys.includes(key)) add(errors, at, `The ${at} field contains an invalid key.`)
    }

    if (typeof field.id !== 'string' || !isUlid(field.id)) {
      add(errors, `${at}.id`, `The ${at}.id field must be a valid ULID.`)
    } else if (ids.has(field.id.toLowerCase())) {
      add(errors, `${at}.id`, `The ${at}.id field has a duplicate value.`)
    } else {
      ids.add(field.id.toLowerCase())
    }

    if (!Number.isInteger(field.order)) {
      add(errors, `${at}.order`, `The ${at}.order field must be an integer.`)
    }
  })

  return [...(value as NonNullable<Form['schema']>)]
    .map((field) => ({
      ...field,
      ...(typeof field.rules === 'string' ? { rules: field.rules.split(',') } : {}),
    }))
    .sort((a, b) => a.order - b.order)
}

/**
 * Validates a `settings` value, returning every key with defaults for the ones left out, or `null`
 * when none were sent.
 */
export function validateSettings(value: unknown, errors: Errors): FormSettings | null {
  if (value === null || value === undefined) return null

  const settings = defaultSettings()

  if (!isObject(value)) {
    add(errors, 'settings', 'The settings field must be an object.')

    return settings
  }

  for (const key of Object.keys(value)) {
    if (!(settingKeys as readonly string[]).includes(key)) {
      add(errors, 'settings', 'The settings field contains an invalid key.')
    }
  }

  const { redirect, timezone, domains, message, honeypot_enabled, honeypot_name } = value

  if (redirect !== undefined && redirect !== null) {
    if (typeof redirect !== 'string' || !/^https?:\/\/[^\s]+$/i.test(redirect)) {
      add(errors, 'settings.redirect', 'The settings.redirect field must be a valid URL.')
    } else if (redirect.length > 2048) {
      add(
        errors,
        'settings.redirect',
        'The settings.redirect field must not be greater than 2048 characters.',
      )
    } else {
      settings.redirect = redirect
    }
  }

  if (timezone !== undefined && timezone !== null) {
    if (typeof timezone !== 'string' || !timezones.has(timezone)) {
      add(errors, 'settings.timezone', 'The settings.timezone field must be a valid timezone.')
    } else {
      settings.timezone = timezone
    }
  }

  if (domains !== undefined && domains !== null) {
    if (!Array.isArray(domains)) {
      add(errors, 'settings.domains', 'The settings.domains field must be a list.')
    } else {
      domains.forEach((domain: unknown, index) => {
        if (typeof domain !== 'string' || !domainPattern.test(domain)) {
          add(
            errors,
            `settings.domains.${index}`,
            `The settings.domains.${index} field format is invalid.`,
          )
        }
      })
      settings.domains = domains as string[]
    }
  }

  if (message !== undefined && message !== null) {
    if (typeof message !== 'string' || message.length > 2000) {
      add(
        errors,
        'settings.message',
        'The settings.message field must not be greater than 2000 characters.',
      )
    } else {
      settings.message = message
    }
  }

  if (honeypot_enabled !== undefined) {
    if (typeof honeypot_enabled !== 'boolean') {
      add(
        errors,
        'settings.honeypot_enabled',
        'The settings.honeypot_enabled field must be true or false.',
      )
    } else {
      settings.honeypot_enabled = honeypot_enabled
    }
  }

  if (honeypot_name !== undefined && honeypot_name !== null && honeypot_name !== '') {
    if (
      typeof honeypot_name !== 'string' ||
      honeypot_name.length > 255 ||
      !honeypotNamePattern.test(honeypot_name)
    ) {
      add(errors, 'settings.honeypot_name', 'The settings.honeypot_name field format is invalid.')
    } else {
      settings.honeypot_name = honeypot_name
    }
  }

  return settings
}

/** The input names a schema accepts: each field's `name`, falling back to its ID. */
export function inputNames(schema: Form['schema']): string[] {
  return (schema ?? []).map((field) => field.name || field.id)
}

/**
 * Fills in a honeypot name when the honeypot is on without one (keeping the stored name when it's
 * still free), and reports a name that clashes with a field.
 */
export function checkHoneypot(
  settings: FormSettings | null,
  schema: Form['schema'],
  stored: FormSettings | null,
  settingsSent: boolean,
  errors: Errors,
) {
  if (!settings) return

  const taken = inputNames(schema)

  if (settings.honeypot_enabled && !settings.honeypot_name) {
    const storedName = stored?.honeypot_name

    settings.honeypot_name =
      storedName && !taken.includes(storedName) ? storedName : generateHoneypotName(taken)
  }

  if (settings.honeypot_name && taken.includes(settings.honeypot_name)) {
    if (settingsSent) {
      add(errors, 'settings.honeypot_name', 'The honeypot name must not match a schema field.')
    } else {
      add(errors, 'schema', 'The schema must not contain a field named after the honeypot.')
    }
  }
}

function generateHoneypotName(taken: string[]): string {
  const prefixes = ['website', 'homepage', 'url', 'company']

  for (;;) {
    const suffix = Array.from({ length: 6 }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)),
    ).join('')
    const name = `${prefixes[Math.floor(Math.random() * prefixes.length)]}_${suffix}`

    if (!taken.includes(name)) return name
  }
}

export function newFormId(): string {
  return ulid()
}

/** A form as the API returns it from a single-form endpoint. */
export function formResource(form: MockForm): Form {
  return { ...form }
}

export function formListItem(form: MockForm): FormListItem {
  // The mock has no entries yet.
  return { ...formResource(form), entries_count: 0, unread_entries_count: 0, spam_entries_count: 0 }
}

/** Sorts by a contract sort (`name`, `-created_at`, …), with the ID as a tie-breaker. */
export function sortForms(forms: MockForm[], sort: string): MockForm[] {
  const descending = sort.startsWith('-')
  const key = (descending ? sort.slice(1) : sort) as 'name' | 'created_at' | 'updated_at'
  const value = (form: MockForm) => (key === 'name' ? form.name.toLowerCase() : (form[key] ?? ''))

  return [...forms].sort((a, b) => {
    const order = value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : a.id < b.id ? -1 : 1

    return descending ? -order : order
  })
}
