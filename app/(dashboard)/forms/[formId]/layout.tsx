import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { FormHeader } from '@/components/forms/form-header'
import { FormTabs } from '@/components/forms/form-tabs'
import { fetchForm } from '@/lib/backend/forms'
import { makeQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

export async function generateMetadata({
  params,
}: LayoutProps<'/forms/[formId]'>): Promise<Metadata> {
  const { name } = await fetchForm((await params).formId)

  return { title: name }
}

/**
 * Every tab of one form. The form is fetched here, so a deleted or unknown form (404) and someone
 * else's (403) show their pages before any tab renders.
 */
export default async function FormLayout({ params, children }: LayoutProps<'/forms/[formId]'>) {
  const { formId } = await params
  const queryClient = makeQueryClient()

  queryClient.setQueryData(queryKeys.forms.detail(formId), await fetchForm(formId))

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex flex-col gap-4">
        <FormHeader formId={formId} />
        <FormTabs formId={formId} />
      </div>
      {children}
    </HydrationBoundary>
  )
}
