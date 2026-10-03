import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { ExportsTable } from '@/components/exports/exports-table'
import { PageHeader } from '@/components/layout/page-header'
import { fetchExportsPage } from '@/lib/backend/exports'
import { fetchFormNames } from '@/lib/backend/forms'
import { exportApiQuery, exportListOptions } from '@/lib/exports/queries'
import { parseListQuery } from '@/lib/list-query'
import { makeQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

export const metadata: Metadata = { title: 'Exports' }

/** Every recent export. The page the URL asks for and the form names are fetched while rendering. */
export default async function ExportsPage({ searchParams }: PageProps<'/exports'>) {
  const query = exportApiQuery(parseListQuery(await searchParams, exportListOptions))
  const queryClient = makeQueryClient()
  const [page, names] = await Promise.all([fetchExportsPage(query), fetchFormNames()])

  if (page) queryClient.setQueryData(queryKeys.exports.list(query), page)
  if (names) queryClient.setQueryData(queryKeys.forms.names(), names)

  return (
    <>
      <PageHeader
        title="Exports"
        description="CSV exports from the last 24 hours, across all your forms. Dates in the files are in UTC."
      />
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ExportsTable />
      </HydrationBoundary>
    </>
  )
}
