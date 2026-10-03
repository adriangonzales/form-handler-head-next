'use client'

import { Download, LoaderCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FormEntryExport } from '@/types/models'

/** Download for a ready export, Try again for a failed one, nothing while it's in progress. */
export function ExportActions({
  entryExport,
  busy = false,
  onDownload,
  onRetry,
}: {
  entryExport: FormEntryExport
  busy?: boolean
  onDownload: () => void
  onRetry: () => void
}) {
  const icon = (Icon: typeof Download) =>
    busy ? (
      <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
    ) : (
      <Icon aria-hidden />
    )

  if (entryExport.status === 'completed') {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        aria-label={`Download ${entryExport.filename}`}
        onClick={onDownload}
      >
        {icon(Download)}
        Download
      </Button>
    )
  }

  if (entryExport.status === 'failed') {
    return (
      <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>
        {icon(RotateCcw)}
        Try again
      </Button>
    )
  }

  return null
}
