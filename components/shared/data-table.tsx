'use client'

import {
  type ColumnDef,
  createColumnHelper,
  type RowData,
  type RowSelectionState,
  rowSelectionFeature,
  tableFeatures,
  type Updater,
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

/**
 * The table features every DataTable has. Lists are sorted and paginated by The Backend; row
 * selection is used only by tables that pass `rowSelection`.
 */
export const dataTableFeatures = tableFeatures({ rowSelectionFeature })

export type DataTableFeatures = typeof dataTableFeatures

/** A column helper for DataTable rows of type `T`. */
export function dataTableColumns<T extends RowData>() {
  return createColumnHelper<DataTableFeatures, T>()
}

const noSelection: RowSelectionState = {}

/**
 * Renders a column's header or cell. TanStack's `FlexRender` passes a function to
 * `createElement`, so columns built during a render (as the Entries and Exports tables build
 * theirs) would give every cell a new component type, remounting it and dropping keyboard focus.
 * Calling the function here keeps the element type stable.
 */
function Template<TProps extends object>({
  template,
  props,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: string | ((props: TProps) => any) | undefined
  props: TProps
}): React.ReactNode {
  return typeof template === 'function' ? template(props) : template
}

/** Elements inside a row that handle their own clicks, so the row's click doesn't also fire. */
const interactive =
  'a, button, input, select, textarea, label, [role="checkbox"], [role="menuitem"]'

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
  rowSelection,
  onRowSelectionChange,
  rowClassName,
  onRowClick,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<DataTableFeatures, T, any>[]
  data: T[]
  getRowId: (row: T) => string
  /** Describes the table to screen readers. */
  caption: string
  emptyMessage?: React.ReactNode
  /** Dims the rows while a new page loads. */
  loading?: boolean
  /** Selected row IDs. Selection is enabled when this is passed. */
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  rowClassName?: (row: T) => string | undefined
  /**
   * Runs when a row is clicked outside its links and controls. A mouse shortcut only: every row
   * must also have a link or button that does the same, for keyboards and screen readers.
   */
  onRowClick?: (row: T) => void
}) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    enableRowSelection: rowSelection !== undefined,
    state: { rowSelection: rowSelection ?? noSelection },
    onRowSelectionChange: (updater: Updater<RowSelectionState>) =>
      onRowSelectionChange?.(
        typeof updater === 'function' ? updater(rowSelection ?? noSelection) : updater,
      ),
  })

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table aria-busy={loading} className={cn(loading && 'opacity-60 transition-opacity')}>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : (
                    <Template
                      template={header.column.columnDef.header}
                      props={header.getContext()}
                    />
                  )}
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
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                onClick={
                  onRowClick &&
                  ((event) => {
                    if (!(event.target as Element).closest(interactive)) onRowClick(row.original)
                  })
                }
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <Template template={cell.column.columnDef.cell} props={cell.getContext()} />
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
