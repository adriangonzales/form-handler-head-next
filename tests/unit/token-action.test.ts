import { describe, expect, it } from 'vitest'
import { tokenAction } from '../../lib/session/token-action'

describe('tokenAction', () => {
  const day = 24 * 60 * 60 * 1000
  const tokens = { token: 't', expiresAt: 60 * 60 * 1000, refreshableUntil: 7 * day }
  const defaults = { now: 0, refreshAheadMs: 120_000, forceRefresh: false, wasRefreshed: false }

  it('uses a token that is valid for longer than the refresh margin', () => {
    expect(tokenAction(tokens, defaults)).toBe('use')
  })

  it('refreshes a token about to expire', () => {
    expect(tokenAction(tokens, { ...defaults, now: tokens.expiresAt - 60_000 })).toBe('refresh')
  })

  it('refreshes after a 401, or when the token was already refreshed', () => {
    expect(tokenAction(tokens, { ...defaults, forceRefresh: true })).toBe('refresh')
    expect(tokenAction(tokens, { ...defaults, wasRefreshed: true })).toBe('refresh')
  })

  it('ends the session once the refresh window has passed', () => {
    expect(tokenAction(tokens, { ...defaults, now: 7 * day })).toBe('expired')
    expect(tokenAction(tokens, { ...defaults, now: 7 * day, forceRefresh: true })).toBe('expired')
  })
})
