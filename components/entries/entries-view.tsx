'use client'

import { useQuery } from '@tanstack/react-query'
import type { RowSelectionState } from '@tanstack/react-table'
import { Code, Inbox, ShieldAlert, Star } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { DataTable, dataTableColumns } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ListPagination } from '@/components/shared/list-pagination'
import { RelativeTime } from '@/components/shared/relative-time'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEntryActions } from '@/hooks/use-entry-actions'
import { useListQuery } from '@/hooks/use-list-query'
import { useNow } from '@/hooks/use-now'
import { ApiError } from '@/lib/api-client'
import { entriesConfig } from '@/lib/config'
import {
  type BulkActionItem,
  type CountedStatus,
  countedStatuses,
  entriesLabel,
  entryApiQuery,
  entryFields,
  entryListOptions,
  entrySorts,
  entryStatus,
  entryStatuses,
  entryStatusLabels,
  formatEntryValue,
  spamCheckState,
  spamLikelihood,
} from '@/lib/entries/entries'
import { entriesListQuery, entryCountsQuery } from '@/lib/entries/queries'
import { formQuery } from '@/lib/forms/queries'
import { cn } from '@/lib/utils'
import type { FormEntry, FormEntryBulkAction } from '@/types/models'
import { EntryBulkBar } from './entry-bulk-bar'
import { EntryDateFilter } from './entry-date-filter'
import { ExportButton } from './export-button'

const noEntries: FormEntry[] = []

const emptyMessages: Record<string, string> = {
  inbox: 'No entries.',
  unread: "You're all caught up.",
  starred: 'No starred entries.',
  spam: 'No spam.',
  trash: 'Trash is empty.',
}

/**
 * The Entries tab: status tabs with counts, date range, sort, the table with selection and bulk
 * actions, and pagination, all kept in the URL. Rows open the entry in the slide-over.
 */
export function EntriesView({ formId, renderedAt }: { formId: string; renderedAt: number }) {
  const router = useRouter()
  const search = useSearchParams().toString()
  const { data: form } = useQuery(formQuery(formId))
  const { state, update } = useListQuery('entries', entryListOptions)
  const status = entryStatus(state)
  const apiQuery = useMemo(() => entryApiQuery(state), [state])
  const fields = useMemo(() => entryFields(form?.schema), [form?.schema])
  const now = useNow(renderedAt, 5_000)
  const actions = useEntryActions(formId)
  const { confirm, dialog } = useConfirm()

  // While any row awaits its spam check, the list and counts refetch, so entries the check flags
  // leave the Inbox without a reload.
  const checking = (entry: FormEntry, at = now) =>
    spamCheckState(entry, at, entriesConfig.spamCheckWindowMs) === 'checking'
  const list = useQuery({
    ...entriesListQuery(formId, apiQuery),
    refetchInterval: (query) =>
      query.state.data?.data.some((entry) => checking(entry, Date.now()))
        ? entriesConfig.spamCheckPollMs
        : false,
  })
  const rows = list.data?.data ?? noEntries
  const counts = useQuery({
    ...entryCountsQuery(formId),
    refetchInterval: rows.some((entry) => checking(entry)) ? entriesConfig.spamCheckPollMs : false,
  })

  // Selection is limited to the page on screen, and clears when the query changes.
  const queryKey = JSON.stringify(apiQuery)
  const [selection, setSelection] = useState<{ key: string; ids: RowSelectionState }>({
    key: queryKey,
    ids: {},
  })
  const rowSelection = useMemo(() => {
    if (selection.key !== queryKey) return {}

    const visible = new Set(rows.map((row) => row.id))

    return Object.fromEntries(
      Object.entries(selection.ids).filter(([id, selected]) => selected && visible.has(id)),
    )
  }, [selection, queryKey, rows])
  const selectedIds = Object.keys(rowSelection)
  const clearSelection = () => setSelection({ key: queryKey, ids: {} })
  const [busyAction, setBusyAction] = useState<FormEntryBulkAction>()

  async function runBulk(item: BulkActionItem) {
    const ids = [...selectedIds]

    if (ids.length === 0) return

    if (
      item.action === 'force_delete' &&
      !(await confirm({
        title: `Permanently delete ${entriesLabel(ids.length)}?`,
        description: "Their submitted data is erased and can't be recovered.",
        confirmLabel: 'Delete permanently',
      }))
    ) {
      return
    }

    setBusyAction(item.action)
    if (await actions.bulk(item, ids)) clearSelection()
    setBusyAction(undefined)
  }

  const entryHref = (entry: Pick<FormEntry, 'id'>) =>
    `/forms/${formId}/entries/${entry.id}${search ? `?${search}` : ''}` as Route

  const [starring, setStarring] = useState<string>()

  async function toggleStar(entry: FormEntry) {
    // The button is `aria-disabled` while saving rather than `disabled`, which would drop focus.
    if (starring !== undefined) return

    setStarring(entry.id)
    await actions.update(entry, { starred: !entry.starred })
    if (status === 'starred') await actions.refresh()
    setStarring(undefined)
  }

  const column = dataTableColumns<FormEntry>()
  const columns = column.columns([
    column.display({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all on this page"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select entry received ${row.original.created_at ?? ''}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        />
      ),
    }),
    column.display({
      id: 'unread',
      header: () => <span className="sr-only">Unread</span>,
      cell: ({ row }) =>
        row.original.read_at ? null : (
          <span className="flex justify-center">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            <span className="sr-only">Unread</span>
          </span>
        ),
    }),
    column.display({
      id: 'star',
      header: () => <span className="sr-only">Starred</span>,
      cell: ({ row }) =>
        status === 'trash' ? (
          row.original.starred ? (
            <Star className="size-4 fill-current text-amber-500" aria-label="Starred" />
          ) : null
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={row.original.starred ? 'Unstar entry' : 'Star entry'}
            aria-pressed={row.original.starred}
            aria-disabled={starring === row.original.id}
            onClick={() => void toggleStar(row.original)}
          >
            <Star
              aria-hidden
              className={cn(
                row.original.starred ? 'fill-current text-amber-500' : 'text-muted-foreground',
              )}
            />
          </Button>
        ),
    }),
    column.display({
      id: 'received',
      header: 'Received',
      cell: ({ row }) => (
        <Link href={entryHref(row.original)} scroll={false} className="hover:underline">
          <RelativeTime datetime={row.original.created_at} />
        </Link>
      ),
    }),
    ...fields.map((field, index) =>
      column.display({
        id: `field-${index}`,
        header: field.label,
        cell: ({ row }) => {
          const value = formatEntryValue(row.original.input?.[field.key])

          return value ? (
            <span className="block max-w-64 truncate">{value}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
    ),
    column.display({
      id: 'spam',
      header: () => <span className="sr-only">Spam</span>,
      cell: ({ row }) => {
        const entry = row.original

        if (entry.spam) {
          const likelihood = spamLikelihood(entry)

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="text-amber-700 dark:text-amber-400"
                  tabIndex={0}
                >
                  <ShieldAlert aria-hidden />
                  Spam
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {likelihood !== null
                  ? `${likelihood}% likely spam`
                  : (entry.spam_reason ?? 'Marked as spam')}
              </TooltipContent>
            </Tooltip>
          )
        }

        return checking(entry) ? (
          <Badge variant="secondary" className="font-normal">
            Checking…
          </Badge>
        ) : null
      },
    }),
  ])

  const hasDateFilter = Boolean(state.filter.from || state.filter.to)
  const listError = list.error instanceof ApiError ? list.error : undefined
  const dateError =
    listError?.errors['filter.created_to']?.[0] ?? listError?.errors['filter.created_from']?.[0]
  const total = list.data?.meta.total ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* On a phone the five tabs are wider than the screen, so they scroll on their own. */}
        <Tabs
          value={status}
          onValueChange={(value) => update({ filter: { ...state.filter, status: value } })}
          className="max-w-full min-w-0 overflow-x-auto"
        >
          <TabsList aria-label="Entry status">
            {entryStatuses.map((value) => {
              const count = (countedStatuses as readonly string[]).includes(value)
                ? counts.data?.[value as CountedStatus]
                : undefined

              return (
                <TabsTrigger key={value} value={value} aria-controls={undefined}>
                  {entryStatusLabels[value]}
                  {count !== undefined && (
                    <Badge
                      variant={
                        value === 'unread' && count > 0 && status !== 'unread'
                          ? 'default'
                          : 'secondary'
                      }
                      className="tabular-nums"
                    >
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-start gap-2">
          <EntryDateFilter
            from={state.filter.from}
            to={state.filter.to}
            error={dateError}
            onChange={({ from, to }) =>
              update({ filter: { status: state.filter.status, from, to } })
            }
          />
          <Select value={state.sort} onValueChange={(sort) => update({ sort })}>
            <SelectTrigger aria-label="Sort entries" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entrySorts.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportButton formId={formId} apiQuery={apiQuery} />
        </div>
      </div>

      {list.isError && !list.data && !dateError ? (
        <ErrorState error={list.error} onRetry={() => void actions.refresh()} />
      ) : list.data && total === 0 && status === 'inbox' && !hasDateFilter ? (
        <EmptyState
          icon={Inbox}
          title="No entries yet"
          description="Add the form to your site, or send a test submission, and entries will show up here."
        >
          <Button asChild>
            <Link href={`/forms/${formId}/integrate` as Route}>
              <Code aria-hidden />
              Integrate
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {selectedIds.length > 0 && (
            <EntryBulkBar
              status={status}
              count={selectedIds.length}
              busy={busyAction}
              onRun={(item) => void runBulk(item)}
              onClear={clearSelection}
            />
          )}

          <DataTable
            caption={`${entryStatusLabels[status]} entries`}
            columns={columns}
            data={rows}
            getRowId={(entry) => entry.id}
            loading={list.isPending || list.isPlaceholderData}
            emptyMessage={
              list.isPending
                ? 'Loading…'
                : hasDateFilter
                  ? 'No entries were received in this date range.'
                  : emptyMessages[status]
            }
            rowSelection={rowSelection}
            onRowSelectionChange={(ids) => setSelection({ key: queryKey, ids })}
            rowClassName={(entry) => (entry.read_at ? undefined : 'font-semibold')}
            onRowClick={(entry) => router.push(entryHref(entry), { scroll: false })}
          />

          {list.data && total > 0 && (
            <ListPagination
              meta={list.data.meta}
              perPage={state.perPage}
              onPageChange={(page) => void update({ page })}
              onPerPageChange={(perPage) => void update({ perPage })}
            />
          )}
        </>
      )}

      {dialog}
    </div>
  )
}
