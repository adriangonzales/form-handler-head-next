import { describe, expect, it } from 'vitest'
import {
  adjacentEntries,
  bulkActionsFor,
  bulkResultMessage,
  entryApiQuery,
  entryFields,
  entryListOptions,
  formatEntryValue,
  isStaleSelectionError,
  otherFieldKeys,
  spamCheckState,
  spamLikelihood,
} from '../../lib/entries/entries'
import { parseListQuery, toUrlQuery } from '../../lib/list-query'

/** The URL parameters a state sets: `toUrlQuery` maps defaults to null, which clears them. */
const toRouteQuery = (...args: Parameters<typeof toUrlQuery>) =>
  Object.fromEntries(Object.entries(toUrlQuery(...args)).filter(([, value]) => value !== null))

describe('entry list query', () => {
  it('defaults to the Inbox, newest first, and leaves defaults out of the URL', () => {
    const state = parseListQuery({}, entryListOptions)

    expect(state).toEqual({
      page: 1,
      perPage: 15,
      sort: '-created_at',
      filter: { status: 'inbox' },
    })
    expect(toRouteQuery(state, entryListOptions)).toEqual({})
    expect(entryApiQuery(state)).toEqual({
      page: 1,
      per_page: 15,
      sort: '-created_at',
      'filter[spam]': 'false',
    })
  })

  it('maps each tab to its API filters', () => {
    const query = (status: string) => entryApiQuery(parseListQuery({ status }, entryListOptions))

    expect(query('unread')).toMatchObject({ 'filter[read]': 'false', 'filter[spam]': 'false' })
    expect(query('starred')).toMatchObject({ 'filter[starred]': 'true' })
    expect(query('starred')).not.toHaveProperty('filter[spam]')
    expect(query('spam')).toMatchObject({ 'filter[spam]': 'true' })
    expect(query('trash')).toMatchObject({ 'filter[trashed]': 'only' })
    expect(query('nonsense')).toMatchObject({ 'filter[spam]': 'false' })
  })

  it('reads the date range, and ignores dates that are not YYYY-MM-DD', () => {
    const state = parseListQuery(
      { status: 'unread', from: '2026-09-01', to: '30/09/2026', sort: 'spam_score' },
      entryListOptions,
    )

    expect(state.filter).toEqual({ status: 'unread', from: '2026-09-01' })
    expect(entryApiQuery(state)).toMatchObject({
      sort: 'spam_score',
      'filter[created_from]': '2026-09-01',
    })
    expect(toRouteQuery(state, entryListOptions)).toEqual({
      status: 'unread',
      from: '2026-09-01',
      sort: 'spam_score',
    })
  })
})

describe('entryFields', () => {
  it('keys fields by input name, falling back to the ID, sorted by `order`', () => {
    expect(
      entryFields([
        { id: '01K6C', order: 3, name: 'message' },
        { id: '01K6A', order: 1, label: 'Email', name: 'email' },
        { id: '01K6B', order: 2, rules: ['required'] },
      ]),
    ).toEqual([
      { key: 'email', label: 'Email' },
      { key: '01K6B', label: '01K6B' },
      { key: 'message', label: 'message' },
    ])
    expect(entryFields([])).toEqual([])
    expect(entryFields(null)).toEqual([])
  })

  it('finds input keys that are not in the schema', () => {
    const fields = [{ key: 'email', label: 'Email' }]

    expect(otherFieldKeys({ old_name: 'x', email: 'a@b.c', extra: 1 }, fields)).toEqual([
      'old_name',
      'extra',
    ])
    expect(otherFieldKeys(null, fields)).toEqual([])
  })
})

describe('formatEntryValue', () => {
  it('formats values as plain text', () => {
    expect(formatEntryValue('Hello')).toBe('Hello')
    expect(formatEntryValue(3)).toBe('3')
    expect(formatEntryValue(false)).toBe('false')
    expect(formatEntryValue(['a', 'b'])).toBe('a, b')
    expect(formatEntryValue({ a: 1 })).toBe('{"a":1}')
    expect(formatEntryValue([{ a: 1 }, 2])).toBe('{"a":1}, 2')
    expect(formatEntryValue(null)).toBe('')
    expect(formatEntryValue(undefined)).toBe('')
    expect(formatEntryValue('')).toBe('')
  })

  it('does not interpret markup', () => {
    expect(formatEntryValue('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('spam check', () => {
  const window = 120_000
  const created = '2026-10-01T12:00:00Z'
  const at = (seconds: number) => Date.parse(created) + seconds * 1000

  it('is checking while unchecked and young, then not checked', () => {
    const entry = { created_at: created, spam_checked_at: null }

    expect(spamCheckState(entry, at(10), window)).toBe('checking')
    expect(spamCheckState(entry, at(119), window)).toBe('checking')
    expect(spamCheckState(entry, at(120), window)).toBe('unchecked')
    expect(spamCheckState({ ...entry, created_at: null }, at(10), window)).toBe('unchecked')
  })

  it('is checked once spam_checked_at is set', () => {
    expect(spamCheckState({ created_at: created, spam_checked_at: created }, at(10), window)).toBe(
      'checked',
    )
  })

  it('gives the likelihood as a percentage, only when the classifier scored the entry', () => {
    const scored = { created_at: created, spam_checked_at: '2026-10-01T12:00:05Z' }

    expect(spamLikelihood({ ...scored, spam: true, spam_score: 0.95 })).toBe(95)
    expect(spamLikelihood({ ...scored, spam: false, spam_score: 0.04 })).toBe(4)
    expect(spamLikelihood({ ...scored, spam: false, spam_score: 0 })).toBe(0)
    // Not checked yet.
    expect(
      spamLikelihood({
        created_at: created,
        spam_checked_at: null,
        spam: false,
        spam_score: 0,
      }),
    ).toBeNull()
    // Marked checked on arrival: a honeypot hit, or an entry added through the API.
    const onArrival = { created_at: created, spam_checked_at: created }
    expect(spamLikelihood({ ...onArrival, spam: true, spam_score: 0 })).toBeNull()
    expect(spamLikelihood({ ...onArrival, spam: false, spam_score: 0 })).toBeNull()
  })
})

describe('adjacentEntries', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('finds the neighbours of an entry on the page', () => {
    expect(adjacentEntries(rows, 'b')).toEqual({
      previous: { id: 'a' },
      next: { id: 'c' },
      index: 1,
    })
    expect(adjacentEntries(rows, 'a')).toEqual({ previous: undefined, next: { id: 'b' }, index: 0 })
    expect(adjacentEntries(rows, 'c')).toEqual({ previous: { id: 'b' }, next: undefined, index: 2 })
  })

  it('uses where the entry was when it has left the list', () => {
    // "b" was at index 1 and was marked as spam, so "c" moved up into its place.
    const after = [{ id: 'a' }, { id: 'c' }]

    expect(adjacentEntries(after, 'b', 1)).toEqual({
      previous: { id: 'a' },
      next: { id: 'c' },
      index: -1,
    })
    expect(adjacentEntries(after, 'b')).toEqual({ index: -1 })
  })
})

describe('bulk actions', () => {
  it('offers triage actions outside Trash, and restore or erase in Trash', () => {
    expect(bulkActionsFor('inbox').map((item) => item.action)).toEqual([
      'mark_read',
      'mark_unread',
      'star',
      'unstar',
      'mark_spam',
      'mark_not_spam',
      'delete',
    ])
    expect(bulkActionsFor('trash').map((item) => item.action)).toEqual(['restore', 'force_delete'])
  })

  it('reports how many entries changed', () => {
    const star = bulkActionsFor('inbox').find((item) => item.action === 'star')!

    expect(bulkResultMessage(star, 2, 3)).toBe('2 entries starred')
    expect(bulkResultMessage(star, 1, 1)).toBe('1 entry starred')
    expect(bulkResultMessage(star, 0, 3)).toBe('No changes: the entries were already starred.')
  })

  it('recognises a selection that went stale', () => {
    expect(isStaleSelectionError({ 'ids.3': ['The selected ids.3 is invalid.'] })).toBe(true)
    expect(isStaleSelectionError({ action: ['Invalid.'] })).toBe(false)
  })
})
