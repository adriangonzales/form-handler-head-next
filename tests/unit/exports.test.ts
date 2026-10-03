import { describe, expect, it } from 'vitest'
import { entryApiQuery, entryListOptions } from '../../lib/entries/entries'
import {
  exportParameters,
  isExpired,
  isInProgress,
  pollDelay,
  sameParameters,
  summariseParameters,
} from '../../lib/exports/exports'
import { parseListQuery } from '../../lib/list-query'

describe('exportParameters', () => {
  it("takes the table's filters and sort, but not its page or page size", () => {
    const state = parseListQuery(
      { status: 'unread', from: '2026-09-01', page: '3', per_page: '50' },
      entryListOptions,
    )

    expect(exportParameters(entryApiQuery(state))).toEqual({
      filter: { read: 'false', spam: 'false', created_from: '2026-09-01' },
      sort: '-created_at',
    })
  })
})

describe('sameParameters', () => {
  it('ignores filter order and boolean spelling', () => {
    expect(
      sameParameters(
        { filter: { spam: 'false', read: 'false' }, sort: '-created_at' },
        { filter: { read: '0', spam: 'false' }, sort: '-created_at' },
      ),
    ).toBe(true)
    expect(sameParameters({ filter: {} }, { filter: {}, sort: 'created_at' })).toBe(true)
  })

  it('tells different filters or sorts apart', () => {
    expect(sameParameters({ filter: { spam: 'false' } }, { filter: { spam: 'true' } })).toBe(false)
    expect(
      sameParameters({ filter: {}, sort: '-created_at' }, { filter: {}, sort: 'created_at' }),
    ).toBe(false)
  })
})

describe('summariseParameters', () => {
  it('names the tab and the sort', () => {
    expect(summariseParameters({ filter: { spam: 'false' }, sort: '-created_at' })).toBe(
      'Inbox · newest first',
    )
    expect(
      summariseParameters({ filter: { read: 'false', spam: 'false' }, sort: '-created_at' }),
    ).toBe('Unread · newest first')
    expect(summariseParameters({ filter: { starred: 'true' }, sort: '-spam_score' })).toBe(
      'Starred · most likely spam',
    )
    expect(summariseParameters({ filter: { trashed: 'only' } })).toBe('Trash · oldest first')
  })

  it('says "All entries" without filters, and copes with an empty object', () => {
    expect(summariseParameters({})).toBe('All entries · oldest first')
    expect(summariseParameters(null)).toBe('All entries · oldest first')
  })

  it('includes the date range', () => {
    const summary = summariseParameters({
      filter: { spam: 'true', created_from: '2026-09-01', created_to: '2026-09-30' },
      sort: 'created_at',
    })

    expect(summary).toMatch(/^Spam · .+2026 – .+2026 · oldest first$/)
    expect(summariseParameters({ filter: { created_to: '2026-09-30' } })).toMatch(/· until /)
  })
})

describe('polling', () => {
  it('polls every 2 s, then every 10 s after 30 s', () => {
    expect(pollDelay(0)).toBe(2_000)
    expect(pollDelay(29_999)).toBe(2_000)
    expect(pollDelay(30_000)).toBe(10_000)
  })

  it('knows which exports are still in progress or expired', () => {
    expect(isInProgress({ status: 'pending' })).toBe(true)
    expect(isInProgress({ status: 'processing' })).toBe(true)
    expect(isInProgress({ status: 'completed' })).toBe(false)
    expect(isInProgress({ status: 'failed' })).toBe(false)

    const expiresAt = '2026-10-02T12:00:00Z'
    expect(isExpired({ expires_at: expiresAt }, Date.parse(expiresAt) - 1)).toBe(false)
    expect(isExpired({ expires_at: expiresAt }, Date.parse(expiresAt))).toBe(true)
  })
})
