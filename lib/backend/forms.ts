import 'server-only'
import { forbidden, notFound, unstable_rethrow } from 'next/navigation'
import { cache } from 'react'
import type { Form, FormListItem, Paginated } from '@/types/models'
import { backendClient } from './client'
import { backendErrorFrom } from './errors'
import type { ApiQuery } from './query'
import { renderCall } from './render'

/**
 * One page of the user's forms, for a Server Component to prefetch. Resolves `null` when The
 * Backend fails, so the page still renders and the browser retries with an error state.
 */
export async function fetchFormsPage(query: ApiQuery): Promise<Paginated<FormListItem> | null> {
  try {
    const { data } = await renderCall((options) =>
      // `page` isn't in the spec's parameters for this operation, though The Backend paginates.
      backendClient(options).GET('/v1/forms', { params: { query: query as never } }),
    )

    return (data as Paginated<FormListItem> | undefined) ?? null
  } catch (error) {
    unstable_rethrow(error)

    return null
  }
}

/**
 * Every form's name by ID (up to 1000 forms), for lists of exports, which only carry `form_id`.
 * Resolves `null` when The Backend fails; the browser then loads the names itself.
 */
export async function fetchFormNames(): Promise<Record<string, string> | null> {
  const names: Record<string, string> = {}
  let page = 1
  let lastPage = 1

  do {
    const result = await fetchFormsPage({ page, per_page: 100, sort: 'name' })

    if (!result) return null

    for (const form of result.data) names[form.id] = form.name

    lastPage = result.meta.last_page
    page += 1
  } while (page <= Math.min(lastPage, 10))

  return names
}

/**
 * One form, or the not-found (404) or access-denied (403) page. Cached for the request, so a layout
 * and its metadata share one call.
 */
export const fetchForm = cache(async (id: string): Promise<Form> => {
  const { data, error, response } = await renderCall((options) =>
    backendClient(options).GET('/v1/forms/{form}', { params: { path: { form: id } } }),
  )

  if (response.status === 404) notFound()
  if (response.status === 403) forbidden()
  if (!data) throw backendErrorFrom(response, error)

  return data.data
})
