'use client'

import { CircleAlert, LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { entriesLabel } from '@/lib/entries/entries'
import { isInProgress } from '@/lib/exports/exports'
import type { FormEntryExport } from '@/types/models'

const inProgressLabels: Record<string, string> = {
  pending: 'Preparing export…',
  processing: 'Processing…',
}

/** An export's status: in progress, its row count once ready, or its error. */
export function ExportStatus({ entryExport }: { entryExport: FormEntryExport }) {
  if (isInProgress(entryExport)) {
    return (
      <Badge variant="secondary" className="font-normal">
        <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
        {inProgressLabels[entryExport.status]}
      </Badge>
    )
  }

  if (entryExport.status === 'completed') {
    return (
      <span className="whitespace-nowrap tabular-nums">
        {entriesLabel(entryExport.row_count ?? 0)}
      </span>
    )
  }

  if (entryExport.status === 'failed') {
    const badge = (
      <Badge variant="destructive" tabIndex={entryExport.error ? 0 : undefined}>
        <CircleAlert aria-hidden />
        Failed
      </Badge>
    )

    return entryExport.error ? (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{entryExport.error}</TooltipContent>
      </Tooltip>
    ) : (
      badge
    )
  }

  return <Badge variant="outline">{entryExport.status}</Badge>
}
