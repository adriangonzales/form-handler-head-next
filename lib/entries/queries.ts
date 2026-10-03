import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { backendRequest } from '@/lib/api-client'
import { type ApiQuery, toSearch } from '@/lib/backend/query'
import { queryKeys } from '@/lib/query-keys'
import type { FormEntry, FormEntryBulkAction, FormEntryUpdateBody, Paginated } from '@/types/models'
import { type CountedStatus, countedStatuses, entryApiFilter, filterQuery } from './entries'

// Browser-side calls to The Backend's entry endpoints, through the authenticated proxy.

export type EntryCounts = Record<CountedStatus, number>

const entryPath = (id: string) => `/entries/${encodeURIComponent(id)}` as const
const formEntriesPath = (formId: string) => `/forms/${encodeURIComponent(formId)}/entries` as const

export function fetchEntries(formId: string, query: ApiQuery) {
  return backendRequest<Paginated<FormEntry>>(`${formEntriesPath(formId)}${toSearch(query)}`)
}

export function entriesListQuery(formId: string, query: ApiQuery) {
  return queryOptions({
    queryKey: queryKeys.entries.list(formId, query),
    queryFn: () => fetchEntries(formId, query),
    placeholderData: keepPreviousData,
  })
}

/** Each counted tab's total, from a `per_page=1` request for that tab. */
export async function fetchEntryCounts(formId: string): Promise<EntryCounts> {
  const totals = await Promise.all(
    countedStatuses.map((status) =>
      fetchEntries(formId, { per_page: 1, ...filterQuery(entryApiFilter(status)) }).then(
        (page) => page.meta.total,
      ),
    ),
  )

  return Object.fromEntries(countedStatuses.map((status, i) => [status, totals[i]])) as EntryCounts
}

export function entryCountsQuery(formId: string) {
  return queryOptions({
    queryKey: queryKeys.entries.counts(formId),
    queryFn: () => fetchEntryCounts(formId),
  })
}

export function entryQuery(formId: string, id: string) {
  return queryOptions({
    queryKey: queryKeys.entries.detail(formId, id),
    queryFn: () => backendRequest<{ data: FormEntry }>(entryPath(id)).then(({ data }) => data),
  })
}

/** Updates an entry. Send only the fields being changed: submission fields are read-only. */
export async function updateEntry(id: string, body: FormEntryUpdateBody): Promise<FormEntry> {
  const { data } = await backendRequest<{ data: FormEntry }>(entryPath(id), {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  return data
}

export async function deleteEntry(id: string): Promise<void> {
  await backendRequest(entryPath(id), { method: 'DELETE' })
}

export async function restoreEntry(id: string): Promise<FormEntry> {
  const { data } = await backendRequest<{ data: FormEntry }>(`${entryPath(id)}/restore`, {
    method: 'POST',
  })

  return data
}

export async function forceDeleteEntry(id: string): Promise<void> {
  await backendRequest(`${entryPath(id)}/force`, { method: 'DELETE' })
}

/** Runs a bulk action, resolving how many entries it changed. */
export async function bulkEntries(
  formId: string,
  action: FormEntryBulkAction,
  ids: string[],
): Promise<number> {
  const { data } = await backendRequest<{ data: { action: string; affected: number } }>(
    `${formEntriesPath(formId)}/bulk`,
    { method: 'POST', body: JSON.stringify({ action, ids }) },
  )

  return data.affected
}
