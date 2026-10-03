import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import type { FormEntryExport, Paginated } from '@/types/models'
import { backendClient } from './client'
import type { ApiQuery } from './query'
import { renderCall } from './render'

/**
 * One page of the user's exports, for a Server Component to prefetch. Resolves `null` when The
 * Backend fails, so the page still renders and the browser retries with an error state.
 */
export async function fetchExportsPage(
  query: ApiQuery,
): Promise<Paginated<FormEntryExport> | null> {
  try {
    const { data } = await renderCall((options) =>
      // `page` isn't in the spec's parameters for this operation, though The Backend paginates.
      backendClient(options).GET('/v1/entry-exports', { params: { query: query as never } }),
    )

    return (data as Paginated<FormEntryExport> | undefined) ?? null
  } catch (error) {
    unstable_rethrow(error)

    return null
  }
}
