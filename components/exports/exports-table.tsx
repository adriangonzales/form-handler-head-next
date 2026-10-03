'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { DataTable, dataTableColumns } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ListPagination } from '@/components/shared/list-pagination'
import { RelativeTime } from '@/components/shared/relative-time'
import { Button } from '@/components/ui/button'
import { useExportActions } from '@/hooks/use-export-actions'
import { useListQuery } from '@/hooks/use-list-query'
import { summariseParameters } from '@/lib/exports/exports'
import {
  exportApiQuery,
  exportListOptions,
  exportsListQuery,
  formNamesQuery,
} from '@/lib/exports/queries'
import { queryKeys } from '@/lib/query-keys'
import type { FormEntryExport } from '@/types/models'
import { ExportActions } from './export-actions'
import { ExportStatus } from './export-status'

const noExports: FormEntryExport[] = []

/**
 * Every recent export across the user's forms, newest first, with pagination in the URL. Exports
 * only carry `form_id`, so form names come from the forms list, loaded once and again when an
 * export of an unknown form shows up. The dashboard's watcher polls rows that are in progress.
 */
export function ExportsTable() {
  const queryClient = useQueryClient()
  const { state, update } = useListQuery('exports', exportListOptions)
  const apiQuery = useMemo(() => exportApiQuery(state), [state])
  const list = useQuery(exportsListQuery(apiQuery))
  const names = useQuery(formNamesQuery())
  const { busy, download, retry } = useExportActions()
  const rows = list.data?.data ?? noExports
  const total = list.data?.meta.total ?? 0

  const unknownForm =
    names.data !== undefined && rows.some((row) => names.data[row.form_id] === undefined)

  useEffect(() => {
    if (unknownForm && !names.isFetching) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.forms.names(), exact: true })
    }
    // Once per newly unknown form, not on every fetch.
  }, [unknownForm]) // eslint-disable-line react-hooks/exhaustive-deps

  const column = dataTableColumns<FormEntryExport>()
  const columns = column.columns([
    column.display({
      id: 'form',
      header: 'Form',
      cell: ({ row }) => {
        const name = names.data?.[row.original.form_id]

        return name ? (
          <Link
            href={`/forms/${row.original.form_id}/entries` as Route}
            className="font-medium hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="font-mono text-xs">{row.original.filename}</span>
        )
      },
    }),
    column.display({
      id: 'filters',
      header: 'Filters',
      cell: ({ row }) => summariseParameters(row.original.parameters),
    }),
    column.display({
      id: 'requested',
      header: 'Requested',
      cell: ({ row }) => <RelativeTime datetime={row.original.created_at} />,
    }),
    column.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <ExportStatus entryExport={row.original} />,
    }),
    column.display({
      id: 'expires',
      header: 'Expires',
      cell: ({ row }) => <RelativeTime datetime={row.original.expires_at} />,
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ExportActions
            entryExport={row.original}
            busy={busy === row.original.id}
            onDownload={() => void download(row.original)}
            onRetry={() => void retry(row.original)}
          />
        </div>
      ),
    }),
  ])

  if (list.isError && !list.data) {
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  }

  if (list.data && total === 0 && state.page === 1) {
    return (
      <EmptyState
        icon={FileDown}
        title="No recent exports"
        description="Export a form's entries as CSV from its Entries tab. Exports are kept for 24 hours."
      >
        <Button variant="outline" asChild>
          <Link href="/forms">Go to forms</Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        caption="Recent exports"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        loading={list.isPending || list.isPlaceholderData}
        emptyMessage={list.isPending ? 'Loading…' : 'No exports on this page.'}
      />
      {list.data && total > 0 && (
        <ListPagination
          meta={list.data.meta}
          perPage={state.perPage}
          onPageChange={(page) => void update({ page })}
          onPerPageChange={(perPage) => void update({ perPage })}
        />
      )}
    </div>
  )
}
