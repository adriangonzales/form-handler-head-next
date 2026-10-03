import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { EntriesView } from '@/components/entries/entries-view'
import { fetchEntriesPage } from '@/lib/backend/entries'
import { entryApiQuery, entryListOptions } from '@/lib/entries/entries'
import { parseListQuery } from '@/lib/list-query'
import { makeQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { renderTime } from '@/lib/render-time'

/** The entries list. The page the URL asks for, and the tab counts, are fetched while rendering. */
export default async function EntriesPage({
  params,
  searchParams,
}: PageProps<'/forms/[formId]/entries'>) {
  const { formId } = await params
  const query = entryApiQuery(parseListQuery(await searchParams, entryListOptions))
  const queryClient = makeQueryClient()
  const { page, counts } = await fetchEntriesPage(formId, query)

  if (page) queryClient.setQueryData(queryKeys.entries.list(formId, query), page)
  if (counts) queryClient.setQueryData(queryKeys.entries.counts(formId), counts)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EntriesView formId={formId} renderedAt={renderTime()} />
    </HydrationBoundary>
  )
}
