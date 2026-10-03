import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { FormHeader } from '@/components/forms/form-header'
import { FormTabs } from '@/components/forms/form-tabs'
import { fetchForm, loadForm } from '@/lib/backend/forms'
import { makeQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

export async function generateMetadata({
  params,
}: LayoutProps<'/forms/[formId]'>): Promise<Metadata> {
  const form = await loadForm((await params).formId)

  // The layout shows the not-found or access-denied page; this only names it.
  if (form === 404) return { title: 'Not found' }
  if (form === 403) return { title: 'No access' }

  return { title: form.name }
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
