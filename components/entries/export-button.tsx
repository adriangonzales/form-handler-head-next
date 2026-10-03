'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronDown, FileDown, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ExportList } from '@/components/exports/export-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useExportActions } from '@/hooks/use-export-actions'
import { onExportSettled } from '@/hooks/use-exports-watcher'
import type { ApiQuery } from '@/lib/backend/query'
import { entriesLabel } from '@/lib/entries/entries'
import {
  type ExportParameters,
  exportParameters,
  isInProgress,
  sameParameters,
} from '@/lib/exports/exports'
import { exportsListQuery, recentExportsQuery } from '@/lib/exports/queries'
import { toastError } from '@/lib/toast-error'
import type { FormEntryExport } from '@/types/models'

const noExports: FormEntryExport[] = []

/**
 * Export CSV for the entries table's current filters and sort, and an Exports popover with this
 * form's recent exports. The export index can't be filtered by form, so the popover keeps this
 * form's rows from the account's 100 most recent exports, which the dashboard's watcher polls.
 */
export function ExportButton({
  formId,
  apiQuery,
}: {
  formId: string
  /** The entries table's API query; its filters and sort are exported, never its page. */
  apiQuery: ApiQuery
}) {
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const recent = useQuery(exportsListQuery(recentExportsQuery))
  const all = recent.data?.data ?? noExports
  const formExports = useMemo(() => all.filter((row) => row.form_id === formId), [all, formId])
  const inProgress = formExports.filter(isInProgress).length
  const hasMore = (recent.data?.meta.last_page ?? 1) > 1
  const { busy, download, retry, start } = useExportActions()

  // The settled callback outlives this render, so it reads whether the popover is open from a ref.
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  function announce(entryExport: FormEntryExport) {
    if (openRef.current) return

    if (entryExport.status === 'completed') {
      toast.success('Export ready', {
        description: entriesLabel(entryExport.row_count ?? 0),
        action: { label: 'Download', onClick: () => void download(entryExport) },
      })
    } else {
      toast.error('Export failed', { description: entryExport.error ?? undefined })
    }
  }

  async function begin(parameters: ExportParameters) {
    setStarting(true)

    try {
      const started = await start({ form_id: formId, parameters })

      if (isInProgress(started)) onExportSettled(started.id, announce)
      setOpen(true)
    } catch (error) {
      toastError(error)
    } finally {
      setStarting(false)
    }
  }

  function exportCsv() {
    const parameters = exportParameters(apiQuery)
    const duplicate = formExports.some(
      (row) => isInProgress(row) && sameParameters(row.parameters, parameters),
    )

    if (!duplicate) return void begin(parameters)

    toast.warning('An export with these filters is already being prepared', {
      description: 'It will appear under Exports when it is ready.',
      action: { label: 'Export anyway', onClick: () => void begin(parameters) },
    })
    setOpen(true)
  }

  return (
    <div className="flex">
      <Button variant="outline" className="rounded-r-none" disabled={starting} onClick={exportCsv}>
        {starting ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <FileDown aria-hidden />
        )}
        Export CSV
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="-ml-px rounded-l-none"
            aria-label={inProgress > 0 ? `Exports, ${inProgress} in progress` : 'Exports'}
          >
            <span className="sr-only sm:not-sr-only">Exports</span>
            {inProgress > 0 && <Badge className="tabular-nums">{inProgress}</Badge>}
            <ChevronDown aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          role="dialog"
          aria-labelledby="recent-exports-title"
          className="w-[min(32rem,calc(100vw-2rem))] gap-3 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="recent-exports-title" className="font-semibold">
              Recent exports
            </h2>
            <Link href="/exports" className="text-sm text-primary hover:underline">
              All exports
            </Link>
          </div>

          {recent.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : recent.isError && !recent.data ? (
            <p className="py-4 text-sm text-destructive">
              Couldn&apos;t load your exports.{' '}
              <Button variant="link" className="h-auto p-0" onClick={() => void recent.refetch()}>
                Retry
              </Button>
            </p>
          ) : formExports.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No exports of this form in the last 24 hours. Export CSV exports the entries matching
              the current tab, dates and sort.
            </p>
          ) : (
            <ExportList
              exports={formExports}
              busy={busy}
              className="max-h-80 overflow-y-auto"
              onDownload={(row) => void download(row)}
              onRetry={(row) => void retry(row)}
            />
          )}

          {hasMore && (
            <p className="text-xs text-muted-foreground">
              Only your 100 most recent exports are checked here.{' '}
              <Link href="/exports" className="text-primary hover:underline">
                See all exports
              </Link>
              .
            </p>
          )}

          <Collapsible className="border-t pt-3 text-sm">
            <CollapsibleTrigger asChild>
              <Button variant="link" size="sm" className="group h-auto px-0">
                What&apos;s in the file?
                <ChevronDown
                  className="transition-transform group-data-[state=open]:rotate-180"
                  aria-hidden
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-xs text-muted-foreground">
                <li>
                  Entries that match the filters when the export runs, not when you asked for it.
                </li>
                <li>A column per field, then columns for older fields the form no longer has.</li>
                <li>
                  Received, read and spam check times (<code>spam_checked_at</code>), all in UTC.
                </li>
                <li>Exports are kept for 24 hours.</li>
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </PopoverContent>
      </Popover>
    </div>
  )
}
