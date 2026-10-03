import { keepPreviousData, type QueryClient, queryOptions } from '@tanstack/react-query'
import { backendRequest } from '@/lib/api-client'
import { type ApiQuery, toSearch } from '@/lib/backend/query'
import type { ListQueryOptions, ListQueryState } from '@/lib/list-query'
import { queryKeys } from '@/lib/query-keys'
import type { FormEntryExport, FormListItem, Paginated } from '@/types/models'
import type { ExportParameters } from './exports'

// Browser-side calls to The Backend's export endpoints, and the cache helpers that keep every list
// of exports on screen in step with polling and actions.

/**
 * The account's most recent exports. The index can't be filtered by form, so the Entries tab
 * keeps one form's rows from these, and the watcher polls the in-progress ones.
 */
export const recentExportsQuery = { per_page: 100 } satisfies ApiQuery

export function exportsListQuery(query: ApiQuery) {
  return queryOptions({
    queryKey: queryKeys.exports.list(query),
    queryFn: () => backendRequest<Paginated<FormEntryExport>>(`/entry-exports${toSearch(query)}`),
    placeholderData: keepPreviousData,
  })
}

export async function fetchExport(id: string): Promise<FormEntryExport> {
  const { data } = await backendRequest<{ data: FormEntryExport }>(
    `/entry-exports/${encodeURIComponent(id)}`,
  )

  return data
}

export async function createExport(
  formId: string,
  parameters: ExportParameters,
): Promise<FormEntryExport> {
  const { data } = await backendRequest<{ data: FormEntryExport }>(
    `/forms/${encodeURIComponent(formId)}/entries/exports`,
    { method: 'POST', body: JSON.stringify(parameters) },
  )

  return data
}

type ExportsPage = Paginated<FormEntryExport>

/** Replaces an export wherever a list of exports has it. */
export function patchCachedExport(queryClient: QueryClient, entryExport: FormEntryExport) {
  queryClient.setQueriesData<ExportsPage>({ queryKey: queryKeys.exports.lists() }, (page) =>
    page?.data.some((row) => row.id === entryExport.id)
      ? { ...page, data: page.data.map((row) => (row.id === entryExport.id ? entryExport : row)) }
      : page,
  )
}

/** Drops an export that has expired from every list. */
export function removeCachedExport(queryClient: QueryClient, id: string) {
  queryClient.setQueriesData<ExportsPage>({ queryKey: queryKeys.exports.lists() }, (page) =>
    page?.data.some((row) => row.id === id)
      ? {
          ...page,
          data: page.data.filter((row) => row.id !== id),
          meta: { ...page.meta, total: Math.max(0, page.meta.total - 1) },
        }
      : page,
  )
}

/** Puts a new export at the top of every first page, where the newest-first index would show it. */
export function addCachedExport(queryClient: QueryClient, entryExport: FormEntryExport) {
  queryClient.setQueriesData<ExportsPage>({ queryKey: queryKeys.exports.lists() }, (page) =>
    page && page.meta.current_page === 1
      ? {
          ...page,
          data: [entryExport, ...page.data.filter((row) => row.id !== entryExport.id)],
          meta: { ...page.meta, total: page.meta.total + 1 },
        }
      : page,
  )
}

/** Every form's name by ID, from the forms list (up to 1000 forms). */
export function formNamesQuery() {
  return queryOptions({
    queryKey: queryKeys.forms.names(),
    queryFn: async () => {
      const names: Record<string, string> = {}
      let page = 1
      let lastPage = 1

      do {
        const result = await backendRequest<Paginated<FormListItem>>(
          `/forms${toSearch({ page, per_page: 100, sort: 'name' })}`,
        )

        for (const form of result.data) names[form.id] = form.name

        lastPage = result.meta.last_page
        page += 1
      } while (page <= Math.min(lastPage, 10))

      return names
    },
    staleTime: Infinity,
  })
}

/** The Exports page's list options: newest first always, so only the page and page size vary. */
export const exportListOptions = {
  sorts: ['-created_at'],
  defaultSort: '-created_at',
  filters: {},
} satisfies ListQueryOptions<never>

/** The index takes no sort or filters. */
export function exportApiQuery(state: ListQueryState): ApiQuery {
  return { page: state.page, per_page: state.perPage }
}
