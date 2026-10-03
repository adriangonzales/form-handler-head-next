import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { RecipientList } from '@/components/notifications/recipient-list'
import { fetchNotificationsPage } from '@/lib/backend/notifications'
import { pageFrom } from '@/lib/notifications/notifications'
import { makeQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

/** A form's alert recipients. The page the URL asks for is fetched while rendering. */
export default async function NotificationsPage({
  params,
  searchParams,
}: PageProps<'/forms/[formId]/notifications'>) {
  const { formId } = await params
  const page = pageFrom((await searchParams).page)
  const queryClient = makeQueryClient()
  const recipients = await fetchNotificationsPage(formId, page)

  if (recipients) queryClient.setQueryData(queryKeys.notifications.list(formId, page), recipients)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RecipientList formId={formId} />
    </HydrationBoundary>
  )
}
