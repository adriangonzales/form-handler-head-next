import 'server-only'
import { notFound, unstable_rethrow } from 'next/navigation'
import {
  type CountedStatus,
  countedStatuses,
  entryApiFilter,
  filterQuery,
} from '@/lib/entries/entries'
import type { FormEntry, Paginated } from '@/types/models'
import { type BackendCallOptions, backendClient } from './client'
import { backendErrorFrom } from './errors'
import type { ApiQuery } from './query'
import { renderCall } from './render'

function listCall(formId: string, query: ApiQuery) {
  return (options: BackendCallOptions) =>
    backendClient(options).GET('/v1/forms/{form}/entries', {
      // `page` isn't in the spec's parameters for this operation, though The Backend paginates.
      params: { path: { form: formId }, query: query as never },
    })
}

/**
 * One page of a form's entries and the tab counts, for a Server Component to prefetch. Resolves
 * `null` for anything that failed, so the page still renders and the browser retries.
 */
export async function fetchEntriesPage(
  formId: string,
  query: ApiQuery,
): Promise<{
  page: Paginated<FormEntry> | null
  counts: Record<CountedStatus, number> | null
}> {
  try {
    const [page, ...totals] = await Promise.all([
      renderCall(listCall(formId, query)),
      ...countedStatuses.map((status) =>
        renderCall(listCall(formId, { per_page: 1, ...filterQuery(entryApiFilter(status)) })),
      ),
    ])
    const counts = totals.every((total) => total.data)
      ? (Object.fromEntries(
          countedStatuses.map((status, i) => [status, totals[i]!.data!.meta.total]),
        ) as Record<CountedStatus, number>)
      : null

    return { page: (page.data as Paginated<FormEntry> | undefined) ?? null, counts }
  } catch (error) {
    unstable_rethrow(error)

    return { page: null, counts: null }
  }
}

/**
 * One entry for the full-page view, or `null` when The Backend doesn't return it: it doesn't exist,
 * or it's in Trash (the show endpoint skips deleted entries). Someone else's form is not found.
 */
export async function fetchEntry(id: string): Promise<FormEntry | null> {
  const { data, error, response } = await renderCall((options) =>
    backendClient(options).GET('/v1/entries/{entry}', { params: { path: { entry: id } } }),
  )

  if (response.status === 404) return null
  if (response.status === 403) notFound()
  if (!data) throw backendErrorFrom(response, error)

  return data.data
}
