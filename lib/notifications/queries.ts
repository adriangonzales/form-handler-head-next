import { keepPreviousData, type QueryClient, queryOptions } from '@tanstack/react-query'
import { backendRequest } from '@/lib/api-client'
import { toSearch } from '@/lib/backend/query'
import { queryKeys } from '@/lib/query-keys'
import type {
  FormNotification,
  FormNotificationStoreBody,
  FormNotificationUpdateBody,
  Paginated,
} from '@/types/models'

// Browser-side calls to The Backend's notification endpoints, through the authenticated proxy.

const notificationPath = (id: string) => `/notifications/${encodeURIComponent(id)}` as const

/** One page of a form's recipients, 15 per page: the contract's fixed page size. */
export function notificationsListQuery(formId: string, page: number) {
  return queryOptions({
    queryKey: queryKeys.notifications.list(formId, page),
    queryFn: () =>
      backendRequest<Paginated<FormNotification>>(
        `/forms/${encodeURIComponent(formId)}/notifications${toSearch(page > 1 ? { page } : {})}`,
      ),
    placeholderData: keepPreviousData,
  })
}

export async function createNotification(
  formId: string,
  body: FormNotificationStoreBody,
): Promise<FormNotification> {
  const { data } = await backendRequest<{ data: FormNotification }>(
    `/forms/${encodeURIComponent(formId)}/notifications`,
    { method: 'POST', body: JSON.stringify(body) },
  )

  return data
}

/** Updates a recipient. The Backend requires `type`, `value` and `enabled`, even to change one. */
export async function updateNotification(
  id: string,
  body: FormNotificationUpdateBody,
): Promise<FormNotification> {
  const { data } = await backendRequest<{ data: FormNotification }>(notificationPath(id), {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  return data
}

export async function deleteNotification(id: string): Promise<void> {
  await backendRequest(notificationPath(id), { method: 'DELETE' })
}

export async function restoreNotification(id: string): Promise<FormNotification> {
  const { data } = await backendRequest<{ data: FormNotification }>(
    `${notificationPath(id)}/restore`,
    { method: 'POST' },
  )

  return data
}

/** Replaces a recipient wherever a page of its form's recipients has it. */
export function patchCachedNotification(queryClient: QueryClient, notification: FormNotification) {
  queryClient.setQueriesData<Paginated<FormNotification>>(
    { queryKey: queryKeys.notifications.lists(notification.form_id) },
    (page) =>
      page?.data.some((row) => row.id === notification.id)
        ? {
            ...page,
            data: page.data.map((row) => (row.id === notification.id ? notification : row)),
          }
        : page,
  )
}
