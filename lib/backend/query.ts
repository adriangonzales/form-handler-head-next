import type { ListQueryState } from '@/lib/list-query'

/** A list request's query in the contract's syntax: `page`, `per_page`, `sort` and `filter[…]`. */
export type ApiQuery = Record<string, string | number>

/** The API query for a list state. */
export function toApiQuery<F extends string>(state: ListQueryState<F>): ApiQuery {
  const query: ApiQuery = { page: state.page, per_page: state.perPage, sort: state.sort }

  for (const [name, value] of Object.entries(state.filter) as [F, string | undefined][]) {
    if (value !== undefined) query[`filter[${name}]`] = value
  }

  return query
}

/** `?key=value&…` for an API query, or an empty string. */
export function toSearch(query: ApiQuery): string {
  const params = new URLSearchParams()

  for (const [name, value] of Object.entries(query)) params.set(name, String(value))

  const search = params.toString()

  return search ? `?${search}` : ''
}
