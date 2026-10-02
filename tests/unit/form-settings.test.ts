import { describe, expect, it } from 'vitest'
import {
  domainPattern,
  hostAllowed,
  settingsFormState,
  settingsPayload,
} from '../../lib/forms/settings'

describe('settingsPayload', () => {
  it('sends nothing for empty settings', () => {
    expect(settingsPayload(settingsFormState(null))).toEqual({})
  })

  it('sends only the keys that are set, trimmed and de-duplicated', () => {
    expect(
      settingsPayload({
        message: '  Thanks!  ',
        redirect: '',
        timezone: 'America/Chicago',
        domains: ['Example.com', 'example.com', ' *.example.org '],
        honeypot_enabled: false,
        honeypot_name: '',
      }),
    ).toEqual({
      message: 'Thanks!',
      timezone: 'America/Chicago',
      domains: ['example.com', '*.example.org'],
    })
  })

  it('keeps the honeypot name while the honeypot is off', () => {
    expect(
      settingsPayload({ ...settingsFormState(null), honeypot_name: 'website_k3x9qa' }),
    ).toEqual({ honeypot_name: 'website_k3x9qa' })
  })

  it('round-trips the settings the API returns', () => {
    const settings = {
      redirect: 'https://example.com/thanks',
      timezone: null,
      domains: ['example.com'],
      message: null,
      honeypot_enabled: true,
      honeypot_name: 'website_k3x9qa',
    }

    expect(settingsPayload(settingsFormState(settings))).toEqual({
      redirect: 'https://example.com/thanks',
      domains: ['example.com'],
      honeypot_enabled: true,
      honeypot_name: 'website_k3x9qa',
    })
  })
})

describe('domainPattern', () => {
  it.each(['example.com', '*.example.org', 'a-b.example.co.uk', 'localhost'])('accepts %s', (d) =>
    expect(domainPattern.test(d)).toBe(true),
  )

  it.each([
    'https://example.com',
    'example.com/path',
    'example.com:8080',
    '*example.com',
    '-a.com',
  ])('rejects %s', (d) => expect(domainPattern.test(d)).toBe(false))
})

describe('hostAllowed', () => {
  it('allows every host when no domains are set', () => {
    expect(hostAllowed('localhost', [])).toBe(true)
    expect(hostAllowed('localhost', null)).toBe(true)
  })

  it('matches exact hosts and wildcard subdomains like the API', () => {
    const domains = ['Example.com', '*.example.org']

    expect(hostAllowed('example.com', domains)).toBe(true)
    expect(hostAllowed('www.example.com', domains)).toBe(false)
    expect(hostAllowed('forms.example.org', domains)).toBe(true)
    expect(hostAllowed('a.b.example.org', domains)).toBe(true)
    expect(hostAllowed('example.org', domains)).toBe(false)
    expect(hostAllowed('badexample.org', domains)).toBe(false)
  })
})
