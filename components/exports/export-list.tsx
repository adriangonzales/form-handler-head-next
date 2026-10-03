'use client'

import { RelativeTime } from '@/components/shared/relative-time'
import { summariseParameters } from '@/lib/exports/exports'
import { cn } from '@/lib/utils'
import type { FormEntryExport } from '@/types/models'
import { ExportActions } from './export-actions'
import { ExportStatus } from './export-status'

/** A compact list of exports, newest first, for the Exports popover on a form's Entries tab. */
export function ExportList({
  exports,
  busy,
  onDownload,
  onRetry,
  className,
}: {
  exports: readonly FormEntryExport[]
  /** The export whose action is running. */
  busy?: string
  onDownload: (entryExport: FormEntryExport) => void
  onRetry: (entryExport: FormEntryExport) => void
  className?: string
}) {
  return (
    <ul className={cn('divide-y', className)}>
      {exports.map((entryExport) => (
        <li
          key={entryExport.id}
          className="flex items-center gap-3 py-3"
          aria-label={`Export requested ${entryExport.created_at ?? ''}`}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate font-medium">{summariseParameters(entryExport.parameters)}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <RelativeTime datetime={entryExport.created_at} />
              <span aria-hidden>·</span>
              <span>
                Expires <RelativeTime datetime={entryExport.expires_at} />
              </span>
            </p>
            {entryExport.status === 'failed' && entryExport.error && (
              <p className="text-xs text-destructive">{entryExport.error}</p>
            )}
          </div>
          <div className="shrink-0">
            <ExportStatus entryExport={entryExport} />
          </div>
          <ExportActions
            entryExport={entryExport}
            busy={busy === entryExport.id}
            onDownload={() => onDownload(entryExport)}
            onRetry={() => onRetry(entryExport)}
          />
        </li>
      ))}
    </ul>
  )
}
