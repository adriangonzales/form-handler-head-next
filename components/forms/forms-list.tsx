'use client'

import { useQuery } from '@tanstack/react-query'
import { CirclePause, CircleCheck, FilePlus, Plus } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { DataTable, dataTableColumns } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ListPagination } from '@/components/shared/list-pagination'
import { RelativeTime } from '@/components/shared/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useListQuery } from '@/hooks/use-list-query'
import { formListOptions, formSorts, formsListQuery } from '@/lib/forms/queries'
import type { FormListItem } from '@/types/models'
import { FormRowMenu } from './form-row-menu'

const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
] as const

const entriesHref = (form: FormListItem, status?: 'unread' | 'spam') =>
  `/forms/${form.id}/entries${status ? `?status=${status}` : ''}` as Route

const column = dataTableColumns<FormListItem>()

const columns = column.columns([
  column.accessor('name', {
    header: 'Name',
    cell: ({ row }) => (
      <Link href={entriesHref(row.original)} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  }),
  column.accessor('active', {
    header: 'Status',
    cell: ({ row }) =>
      row.original.active ? (
        <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
          <CircleCheck aria-hidden />
          Active
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          <CirclePause aria-hidden />
          Inactive
        </Badge>
      ),
  }),
  column.accessor('entries_count', {
    header: 'Entries',
    cell: ({ row }) => (
      <Link
        href={entriesHref(row.original)}
        className="tabular-nums hover:underline"
        aria-label={`${row.original.entries_count} entries in ${row.original.name}`}
      >
        {row.original.entries_count}
      </Link>
    ),
  }),
  column.accessor('unread_entries_count', {
    header: 'Unread',
    cell: ({ row }) =>
      row.original.unread_entries_count > 0 ? (
        <Badge asChild>
          <Link href={entriesHref(row.original, 'unread')} className="tabular-nums">
            {row.original.unread_entries_count} unread
          </Link>
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  column.accessor('spam_entries_count', {
    header: 'Spam',
    cell: ({ row }) =>
      row.original.spam_entries_count > 0 ? (
        <Link
          href={entriesHref(row.original, 'spam')}
          className="text-muted-foreground tabular-nums hover:underline"
          aria-label={`${row.original.spam_entries_count} spam in ${row.original.name}`}
        >
          {row.original.spam_entries_count}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  column.accessor('updated_at', {
    header: 'Updated',
    cell: ({ row }) => <RelativeTime datetime={row.original.updated_at} />,
  }),
  column.accessor('created_at', {
    header: 'Created',
    cell: ({ row }) => <RelativeTime datetime={row.original.created_at} />,
  }),
  column.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <FormRowMenu form={row.original} />
      </div>
    ),
  }),
])

const noForms: FormListItem[] = []

/** The forms table, with status tabs, sort, and pagination kept in the URL. */
export function FormsList() {
  const { state, apiQuery, update } = useListQuery('forms', formListOptions)
  const { data, error, isPending, isPlaceholderData, isError, refetch } = useQuery(
    formsListQuery(apiQuery),
  )
  const filtered = state.filter.active !== undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={state.filter.active ?? 'all'}
          onValueChange={(value) => update({ filter: value === 'all' ? {} : { active: value } })}
        >
          <TabsList aria-label="Filter by status">
            {statusFilters.map(({ value, label }) => (
              // The list below isn't a tab panel per filter, so the tabs control nothing by id.
              <TabsTrigger key={value} value={value} aria-controls={undefined}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={state.sort} onValueChange={(sort) => update({ sort })}>
          <SelectTrigger aria-label="Sort forms" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formSorts.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data && data.meta.total === 0 && !filtered ? (
        <EmptyState
          icon={FilePlus}
          title="Create your first form"
          description="Define its fields, then post submissions to it from any website."
        >
          <Button asChild>
            <Link href="/forms/new">
              <Plus aria-hidden />
              New form
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <DataTable
            caption="Your forms"
            columns={columns}
            data={data?.data ?? noForms}
            getRowId={(form) => form.id}
            loading={isPending || isPlaceholderData}
            emptyMessage={isPending ? 'Loading…' : 'No forms match this filter.'}
          />
          {data && data.meta.total > 0 && (
            <ListPagination
              meta={data.meta}
              perPage={state.perPage}
              onPageChange={(page) => void update({ page })}
              onPerPageChange={(perPage) => void update({ perPage })}
            />
          )}
        </>
      )}
    </div>
  )
}
