import type { Route } from 'next'
import { redirect } from 'next/navigation'

export default async function FormPage({ params }: PageProps<'/forms/[formId]'>) {
  redirect(`/forms/${(await params).formId}/entries` as Route)
}
