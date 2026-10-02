import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'

export const metadata: Metadata = { title: 'Exports' }

// Placeholder: the exports list arrives in milestone 6.
export default function ExportsPage() {
  return (
    <PageHeader
      title="Exports"
      description="CSV exports of your entries will be listed here. They're kept for 24 hours."
    />
  )
}
