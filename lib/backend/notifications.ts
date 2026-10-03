import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import type { FormNotification, Paginated } from '@/types/models'
import { backendClient } from './client'
import { renderCall } from './render'

/**
 * One page of a form's recipients, for a Server Component to prefetch. Resolves `null` when The
 * Backend fails, so the page still renders and the browser retries with an error state.
 */
export async function fetchNotificationsPage(
  formId: string,
  page: number,
): Promise<Paginated<FormNotification> | null> {
  try {
    const { data } = await renderCall((options) =>
      backendClient(options).GET('/v1/forms/{form}/notifications', {
        // `page` isn't in the spec's parameters for this operation, though The Backend paginates.
        params: { path: { form: formId }, query: (page > 1 ? { page } : {}) as never },
      }),
    )

    return (data as Paginated<FormNotification> | undefined) ?? null
  } catch (error) {
    unstable_rethrow(error)

    return null
  }
}
