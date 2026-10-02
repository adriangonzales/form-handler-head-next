import type { Metadata } from 'next'
import { NewForm } from '@/components/forms/new-form'
import { PageHeader } from '@/components/layout/page-header'

export const metadata: Metadata = { title: 'New form' }

export default function NewFormPage() {
  return (
    <>
      <PageHeader title="New form" />
      <NewForm />
    </>
  )
}
