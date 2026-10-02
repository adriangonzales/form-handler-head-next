import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'

export const metadata: Metadata = { title: 'Forms' }

// Placeholder: the forms list arrives in milestone 3.
export default function FormsPage() {
  return (
    <PageHeader
      title="Forms"
      description="Your forms will be listed here. Creating and managing forms arrives in the next milestone."
    />
  )
}
