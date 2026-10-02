'use client'

import { parseAsString, useQueryStates } from 'nuqs'
import { useCallback, useEffect, useMemo } from 'react'
import { toApiQuery } from '@/lib/backend/query'
import {
  isPageSize,
  type ListQueryOptions,
  type ListQueryState,
  parseListQuery,
  toUrlQuery,
} from '@/lib/list-query'

/**
 * List state (page, page size, sort, filters) kept in the URL, so views can be shared, bookmarked
 * and restored with back/forward. The page size chosen last is remembered per list in
 * localStorage and applied when the URL doesn't set one. `options` must be a stable object.
 */
export function useListQuery<F extends string>(key: string, options: ListQueryOptions<F>) {
  const storageKey = `fh:per-page:${key}`
  const parsers = useMemo(
    () =>
      Object.fromEntries(
        ['page', 'per_page', 'sort', ...Object.keys(options.filters)].map((name) => [
          name,
          parseAsString,
        ]),
      ),
    [options],
  )
  const [raw, setRaw] = useQueryStates(parsers, { history: 'push' })
  const state = useMemo(() => parseListQuery(raw, options), [raw, options])
  const apiQuery = useMemo(() => toApiQuery(state), [state])

  const update = useCallback(
    (patch: Partial<ListQueryState<F>>) => {
      // Changing anything other than the page starts again from page 1.
      const next = { ...state, page: 1, ...patch }

      if (patch.perPage !== undefined) {
        try {
          localStorage.setItem(storageKey, String(patch.perPage))
        } catch {
          // Storage unavailable: the URL still carries the choice.
        }
      }

      return setRaw(toUrlQuery(next, options))
    },
    [state, options, setRaw, storageKey],
  )

  const urlPerPage = raw.per_page

  useEffect(() => {
    if (urlPerPage !== null) return

    let stored: number

    try {
      stored = Number(localStorage.getItem(storageKey))
    } catch {
      return
    }

    if (isPageSize(stored) && stored !== state.perPage) {
      void setRaw(toUrlQuery({ ...state, perPage: stored }, options), { history: 'replace' })
    }
    // Only when the page opens, or the URL loses its page size.
  }, [urlPerPage]) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, apiQuery, update }
}
