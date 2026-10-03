'use client'

import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellOff,
  EllipsisVertical,
  MailWarning,
  MessageSquareOff,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { parseAsString, useQueryState } from 'nuqs'
import { createContext, use, useState } from 'react'
import { toast } from 'sonner'
import { DataTable, dataTableColumns } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ListPagination } from '@/components/shared/list-pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { setEnabledKey, useNotificationActions } from '@/hooks/use-notification-actions'
import { formQuery } from '@/lib/forms/queries'
import { notificationTypeMeta, pageFrom } from '@/lib/notifications/notifications'
import { notificationsListQuery, patchCachedNotification } from '@/lib/notifications/queries'
import { queryKeys } from '@/lib/query-keys'
import type { FormNotification } from '@/types/models'
import { NotificationDialog } from './notification-dialog'

const noRecipients: FormNotification[] = []

/** What a row's menu does; provided by RecipientList, which owns the dialog and the page. */
const RowActionsContext = createContext<{
  edit: (notification: FormNotification) => void
  remove: (notification: FormNotification) => void
} | null>(null)

// Columns are built once, and cells that hold state are components, so a refetch re-renders a
// row's switch and menu in place instead of remounting them (which would drop keyboard focus).
const column = dataTableColumns<FormNotification>()
const columns = column.columns([
  column.display({
    id: 'recipient',
    header: 'Recipient',
    cell: ({ row }) => <RecipientCell notification={row.original} />,
  }),
  column.display({
    id: 'delivery',
    header: 'Delivery',
    cell: ({ row }) => <DeliveryCell notification={row.original} />,
  }),
  column.display({
    id: 'enabled',
    header: 'Enabled',
    cell: ({ row }) => <EnabledSwitch notification={row.original} />,
  }),
  column.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <RowMenu notification={row.original} />,
  }),
])

/**
 * The Notifications tab: a form's alert recipients, 15 per page with the page in the URL, the
 * add/edit dialog, and when alerts are sent.
 */
export function RecipientList({ formId }: { formId: string }) {
  const queryClient = useQueryClient()
  const [rawPage, setRawPage] = useQueryState(
    'page',
    parseAsString.withOptions({ history: 'push' }),
  )
  const page = pageFrom(rawPage)
  const list = useQuery(notificationsListQuery(formId, page))
  const { data: form } = useQuery(formQuery(formId))
  const { remove } = useNotificationActions(formId)
  const [editor, setEditor] = useState<{ open: boolean; notification?: FormNotification }>({
    open: false,
  })
  const rows = list.data?.data ?? noRecipients
  const total = list.data?.meta.total ?? 0
  const timezone = form?.settings?.timezone || 'UTC'
  const setPage = (next: number) => void setRawPage(next > 1 ? String(next) : null)

  const rowActions = {
    edit: (notification: FormNotification) => setEditor({ open: true, notification }),
    remove: (notification: FormNotification) => {
      remove(notification, () => {
        // Removing the only row on a later page would leave that page empty.
        if (rows.length === 1 && page > 1) setPage(page - 1)
      }).catch(() => undefined) // Already shown as a toast.
    },
  }

  function onSaved(saved: FormNotification) {
    if (editor.notification) patchCachedNotification(queryClient, saved)
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists(formId) })
    toast.success(editor.notification ? 'Recipient saved' : `Added ${saved.value}`)
  }

  const addButton = (
    <Button onClick={() => setEditor({ open: true })}>
      <Plus aria-hidden />
      Add recipient
    </Button>
  )

  let body: React.ReactNode

  if (list.isError && !list.data) {
    body = <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  } else if (list.data && total === 0 && page === 1) {
    body = (
      <EmptyState
        icon={BellOff}
        title="Nobody is alerted yet"
        description="New entries still arrive in the inbox, but nobody hears about them until you add a recipient."
      >
        {addButton}
      </EmptyState>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <RowActionsContext value={rowActions}>
          <DataTable
            caption="Recipients"
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            loading={list.isPending || list.isPlaceholderData}
            emptyMessage={list.isPending ? 'Loading…' : 'No recipients on this page.'}
          />
        </RowActionsContext>
        {list.data && list.data.meta.last_page > 1 && (
          <ListPagination meta={list.data.meta} onPageChange={setPage} />
        )}
      </div>
    )
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="font-semibold">Recipients</h2>
          <p className="text-sm text-muted-foreground">
            Enabled email recipients are alerted when a new entry arrives through your site.
          </p>
        </div>
        {addButton}
      </div>

      {body}

      <section aria-labelledby="alerts-help" className="flex flex-col gap-2 border-t pt-6">
        <h3 id="alerts-help" className="text-sm font-semibold">
          When alerts are sent
        </h3>
        <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground">
          <li>
            When a new entry arrives through the form&apos;s public endpoint. Entries added through
            the API don&apos;t alert anyone.
          </li>
          <li>
            Every submission is checked for spam first, so alerts arrive a few seconds after the
            entry. Entries flagged as spam, by the honeypot or the spam check, don&apos;t alert
            anyone.
          </li>
          <li>
            Marking an entry <strong className="font-medium text-foreground">Not spam</strong> later
            doesn&apos;t send an alert for it.
          </li>
          <li>
            Times in alert emails use the form&apos;s timezone ({timezone}). Change it in{' '}
            <Link
              href={`/forms/${formId}/settings` as Route}
              className="text-foreground underline underline-offset-3"
            >
              Settings
            </Link>
            .
          </li>
        </ul>
      </section>

      <NotificationDialog
        formId={formId}
        notification={editor.notification}
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onSaved={onSaved}
      />
    </div>
  )
}

/** The type icon and value, with the full delivery error underneath when there is one. */
function RecipientCell({ notification }: { notification: FormNotification }) {
  const { type, value, error } = notification
  const { icon: Icon, label } = notificationTypeMeta(type)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">{label}:</span>
        <span className="font-medium break-all">{value}</span>
      </div>
      {error && (
        <p className="ms-6 max-w-md text-xs break-words whitespace-normal text-destructive">
          {error}{' '}
          <span className="text-muted-foreground">Clears after the next successful delivery.</span>
        </p>
      )}
    </div>
  )
}

function DeliveryCell({ notification: { type, error } }: { notification: FormNotification }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {error && (
        <Badge variant="destructive">
          <MailWarning aria-hidden />
          Delivery problem
        </Badge>
      )}
      {type === 'sms' && (
        <Badge variant="secondary">
          <MessageSquareOff aria-hidden />
          Not delivered yet
        </Badge>
      )}
      {!error && type !== 'sms' && <span className="text-muted-foreground">OK</span>}
    </div>
  )
}

/** The Enabled switch. It's disabled while its own update is saving, so clicks can't race. */
function EnabledSwitch({ notification }: { notification: FormNotification }) {
  const { setEnabled } = useNotificationActions(notification.form_id)
  const saving = useMutationState({
    filters: {
      mutationKey: setEnabledKey,
      status: 'pending',
      predicate: (mutation) =>
        (mutation.state.variables as { notification?: FormNotification } | undefined)?.notification
          ?.id === notification.id,
    },
  }).length

  return (
    <Switch
      checked={notification.enabled}
      disabled={saving > 0}
      aria-label={`Alerts for ${notification.value}`}
      onCheckedChange={(enabled) => setEnabled.mutate({ notification, enabled })}
    />
  )
}

function RowMenu({ notification }: { notification: FormNotification }) {
  const actions = use(RowActionsContext)

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${notification.value}`}>
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => actions?.edit(notification)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => actions?.remove(notification)}>
            <Trash2 aria-hidden />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
