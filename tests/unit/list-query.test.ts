import { describe, expect, it } from 'vitest'
import { toApiQuery, toSearch } from '../../lib/backend/query'
import { parseListQuery, toUrlQuery } from '../../lib/list-query'

const options = {
  sorts: ['-updated_at', 'name', '-name'],
  defaultSort: '-updated_at',
  filters: { active: ['true', 'false'] },
}

describe('parseListQuery', () => {
  it('uses defaults for an empty query', () => {
    expect(parseListQuery({}, options)).toEqual({
      page: 1,
      perPage: 15,
      sort: '-updated_at',
      filter: {},
    })
  })

  it('reads valid values and ignores invalid ones', () => {
    expect(
      parseListQuery({ page: '3', per_page: '50', sort: 'name', active: 'false' }, options),
    ).toEqual({ page: 3, perPage: 50, sort: 'name', filter: { active: 'false' } })

    expect(
      parseListQuery({ page: '-1', per_page: '7', sort: 'id', active: 'maybe' }, options),
    ).toEqual({ page: 1, perPage: 15, sort: '-updated_at', filter: {} })
  })

  it('takes the first of repeated parameters, and treats null as missing', () => {
    expect(parseListQuery({ page: ['2', '5'], sort: null }, options)).toMatchObject({
      page: 2,
      sort: '-updated_at',
    })
  })
})

describe('toUrlQuery', () => {
  it('clears defaults from the URL', () => {
    expect(toUrlQuery({ page: 1, perPage: 15, sort: '-updated_at', filter: {} }, options)).toEqual({
      active: null,
      sort: null,
      per_page: null,
      page: null,
    })
  })

  it('sets everything else', () => {
    expect(
      toUrlQuery({ page: 2, perPage: 25, sort: 'name', filter: { active: 'true' } }, options),
    ).toEqual({ active: 'true', sort: 'name', per_page: '25', page: '2' })
  })
})

describe('toApiQuery', () => {
  it('maps filters to the contract filter parameters', () => {
    expect(toApiQuery({ page: 2, perPage: 25, sort: 'name', filter: { active: 'true' } })).toEqual({
      page: 2,
      per_page: 25,
      sort: 'name',
      'filter[active]': 'true',
    })
  })

  it('builds a query string', () => {
    expect(toSearch({ page: 1, 'filter[active]': 'false' })).toBe(
      '?page=1&filter%5Bactive%5D=false',
    )
    expect(toSearch({})).toBe('')
  })
})

describe('filters checked by a function, and default filter values', () => {
  const withDefaults = {
    sorts: ['-created_at'],
    defaultSort: '-created_at',
    filters: {
      status: ['inbox', 'spam'],
      from: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value),
    },
    defaultFilter: { status: 'inbox' },
  }

  it('applies the default when the URL has none, and leaves it out of the URL', () => {
    const state = parseListQuery({}, withDefaults)

    expect(state.filter).toEqual({ status: 'inbox' })
    expect(toUrlQuery(state, withDefaults)).toMatchObject({ status: null, from: null })
    expect(toUrlQuery({ ...state, filter: { status: 'spam' } }, withDefaults)).toMatchObject({
      status: 'spam',
    })
  })

  it('accepts values that pass the check', () => {
    expect(parseListQuery({ from: '2026-10-01' }, withDefaults).filter.from).toBe('2026-10-01')
    expect(parseListQuery({ from: 'yesterday' }, withDefaults).filter.from).toBeUndefined()
  })
})
