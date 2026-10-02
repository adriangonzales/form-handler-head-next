import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { FormsList } from '@/components/forms/forms-list'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { fetchFormsPage } from '@/lib/backend/forms'
import { toApiQuery } from '@/lib/backend/query'
import { formListOptions } from '@/lib/forms/queries'
import { parseListQuery } from '@/lib/list-query'
import { makeQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

export const metadata: Metadata = { title: 'Forms' }

/** The forms list. The page the URL asks for is fetched while rendering, so it shows at once. */
export default async function FormsPage({ searchParams }: PageProps<'/forms'>) {
  const query = toApiQuery(parseListQuery(await searchParams, formListOptions))
  const queryClient = makeQueryClient()
  const page = await fetchFormsPage(query)

  if (page) queryClient.setQueryData(queryKeys.forms.list(query), page)

  return (
    <>
      <PageHeader title="Forms" description="Every form you own, and what's arrived in each.">
        <Button asChild>
          <Link href="/forms/new">
            <Plus aria-hidden />
            New form
          </Link>
        </Button>
      </PageHeader>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <FormsList />
      </HydrationBoundary>
    </>
  )
}
