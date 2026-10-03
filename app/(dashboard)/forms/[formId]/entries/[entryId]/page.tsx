import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { EntryPage } from '@/components/entries/entry-page'
import { fetchEntry } from '@/lib/backend/entries'
import { makeQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { renderTime } from '@/lib/render-time'

/** An entry from a direct link or a reload, as a full page. */
export default async function EntryFullPage({
  params,
}: PageProps<'/forms/[formId]/entries/[entryId]'>) {
  const { formId, entryId } = await params
  const queryClient = makeQueryClient()
  const entry = await fetchEntry(entryId)

  if (entry) queryClient.setQueryData(queryKeys.entries.detail(formId, entryId), entry)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EntryPage formId={formId} entryId={entryId} renderedAt={renderTime()} />
    </HydrationBoundary>
  )
}
