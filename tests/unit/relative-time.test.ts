import { describe, expect, it } from 'vitest'
import { formatRelative } from '../../components/shared/relative-time'

const now = Date.parse('2026-10-02T12:00:00Z')

describe('formatRelative', () => {
  it('says "just now" under a minute', () => {
    expect(formatRelative(new Date(now - 30_000), now)).toBe('just now')
  })

  it('uses the largest whole unit', () => {
    expect(formatRelative(new Date(now - 3 * 3600_000), now)).toMatch(/3 hours ago/)
    expect(formatRelative(new Date(now - 2 * 86_400_000), now)).toMatch(/2 days ago/)
    expect(formatRelative(new Date(now + 5 * 60_000), now)).toMatch(/in 5 minutes/)
  })
})
