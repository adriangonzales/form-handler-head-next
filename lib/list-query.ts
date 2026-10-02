/** Page sizes offered by every list. The first is the default. */
export const pageSizes = [15, 25, 50, 100] as const

export interface ListQueryOptions<F extends string = string> {
  sorts: readonly string[]
  defaultSort: string
  /**
   * Allowed values per filter, keyed by the URL parameter name (`active` → `?active=true`): a list,
   * or a check for free-form values such as dates.
   */
  filters: Record<F, readonly string[] | ((value: string) => boolean)>
  /** Filter values left out of the URL because they're the default (`status=inbox`). */
  defaultFilter?: Partial<Record<F, string>>
  defaultPerPage?: number
}

export interface ListQueryState<F extends string = string> {
  page: number
  perPage: number
  sort: string
  filter: Partial<Record<F, string>>
}

/** URL search parameters as Next.js passes them to pages, or as nuqs reads them. */
export type RawQuery = Record<string, string | string[] | null | undefined>

/** Reads list state from the URL query, falling back to defaults for anything missing or invalid. */
export function parseListQuery<F extends string>(
  query: RawQuery,
  options: ListQueryOptions<F>,
): ListQueryState<F> {
  const page = Number(first(query.page))
  const perPage = Number(first(query.per_page))
  const sort = first(query.sort)
  const filter: Partial<Record<F, string>> = {}

  for (const [name, allowed] of Object.entries(options.filters) as [
    F,
    ListQueryOptions<F>['filters'][F],
  ][]) {
    const value = first(query[name]) ?? options.defaultFilter?.[name]

    if (
      value !== undefined &&
      (typeof allowed === 'function' ? allowed(value) : allowed.includes(value))
    ) {
      filter[name] = value
    }
  }

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    perPage: isPageSize(perPage) ? perPage : defaultPerPage(options),
    sort: sort !== undefined && options.sorts.includes(sort) ? sort : options.defaultSort,
    filter,
  }
}

/**
 * The URL query for a state. Defaults map to `null`, which removes the parameter, so URLs stay
 * short and every list parameter is always set or cleared.
 */
export function toUrlQuery<F extends string>(
  state: ListQueryState<F>,
  options: ListQueryOptions<F>,
): Record<string, string | null> {
  const query: Record<string, string | null> = {}

  for (const name of Object.keys(options.filters) as F[]) {
    const value = state.filter[name]

    query[name] = value !== undefined && value !== options.defaultFilter?.[name] ? value : null
  }

  query.sort = state.sort !== options.defaultSort ? state.sort : null
  query.per_page = state.perPage !== defaultPerPage(options) ? String(state.perPage) : null
  query.page = state.page > 1 ? String(state.page) : null

  return query
}

export function isPageSize(value: number): boolean {
  return (pageSizes as readonly number[]).includes(value)
}

export function defaultPerPage(options: Pick<ListQueryOptions, 'defaultPerPage'>): number {
  return options.defaultPerPage ?? pageSizes[0]
}

function first(value: RawQuery[string]): string | undefined {
  const item = Array.isArray(value) ? value[0] : value

  return typeof item === 'string' ? item : undefined
}
