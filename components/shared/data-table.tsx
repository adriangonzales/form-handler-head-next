'use client'

import {
  type ColumnDef,
  createColumnHelper,
  type RowData,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** The table features every DataTable has. Lists are sorted and paginated by The Backend. */
export const dataTableFeatures = tableFeatures({})

export type DataTableFeatures = typeof dataTableFeatures

/** A column helper for DataTable rows of type `T`. */
export function dataTableColumns<T extends RowData>() {
  return createColumnHelper<DataTableFeatures, T>()
}

/**
 * A table of server-paginated rows, rendered with shadcn's table. Columns come from
 * `dataTableColumns<T>()`; `getRowId` keeps rows stable across refetches.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  emptyMessage = 'Nothing to show.',
  loading = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<DataTableFeatures, T, any>[]
  data: T[]
  getRowId: (row: T) => string
  /** Describes the table to screen readers. */
  caption: string
  emptyMessage?: string
  /** Dims the rows while a new page loads. */
  loading?: boolean
}) {
  const table = useTable({ features: dataTableFeatures, columns, data, getRowId })

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table aria-busy={loading} className={cn(loading && 'opacity-60 transition-opacity')}>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
