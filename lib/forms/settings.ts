import type { FormSettings, FormUpdateBody } from '@/types/models'

/** Editable settings, with empty strings and lists standing in for "not set". */
export interface SettingsFormState {
  message: string
  redirect: string
  timezone: string
  domains: string[]
  honeypot_enabled: boolean
  honeypot_name: string
}

export type SettingsBody = NonNullable<FormUpdateBody['settings']>

export function settingsFormState(settings: FormSettings | null | undefined): SettingsFormState {
  return {
    message: settings?.message ?? '',
    redirect: settings?.redirect ?? '',
    timezone: settings?.timezone ?? '',
    domains: [...(settings?.domains ?? [])],
    honeypot_enabled: settings?.honeypot_enabled ?? false,
    honeypot_name: settings?.honeypot_name ?? '',
  }
}

/**
 * The `settings` to send: only keys that are set, since The Backend applies defaults to omitted
 * keys and rejects unknown ones. The honeypot name is kept while the honeypot is off, so turning it
 * back on reuses the name the site's hidden input already has.
 */
export function settingsPayload(state: SettingsFormState): SettingsBody {
  const settings: SettingsBody = {}
  const message = state.message.trim()
  const redirect = state.redirect.trim()
  const honeypotName = state.honeypot_name.trim()
  const domains = [...new Set(state.domains.map((domain) => domain.trim().toLowerCase()))].filter(
    Boolean,
  )

  if (message) settings.message = message
  if (redirect) settings.redirect = redirect
  if (state.timezone) settings.timezone = state.timezone
  if (domains.length > 0) settings.domains = domains
  if (state.honeypot_enabled) settings.honeypot_enabled = true
  if (honeypotName) settings.honeypot_name = honeypotName

  return settings
}

/** Bare hostnames, optionally with a leading `*.` wildcard, as The Backend accepts them. */
export const domainPattern =
  /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i

/** Letters, digits, `_` and `-`, as The Backend accepts for the honeypot input's name. */
export const honeypotNamePattern = /^[A-Za-z0-9_-]+$/

/**
 * Whether `host` may submit under a form's allowed domains, matching The Backend: exact hostnames,
 * case-insensitively, and `*.example.com` for subdomains (not `example.com` itself). An empty list
 * allows every host.
 */
export function hostAllowed(host: string, domains: readonly string[] | null | undefined): boolean {
  if (!domains || domains.length === 0) return true

  const target = host.toLowerCase()

  return domains.some((domain) => {
    const pattern = domain.toLowerCase()

    return pattern.startsWith('*.')
      ? target.endsWith(pattern.slice(1)) && target.length > pattern.length - 1
      : target === pattern
  })
}
