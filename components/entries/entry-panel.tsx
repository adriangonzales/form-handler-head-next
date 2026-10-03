'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Mail,
  MailOpen,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cachedListEntry, useEntryActions } from '@/hooks/use-entry-actions'
import { useNow } from '@/hooks/use-now'
import { ApiError } from '@/lib/api-client'
import { entriesConfig } from '@/lib/config'
import {
  adjacentEntries,
  entryApiQuery,
  entryFields,
  entryListOptions,
  entryStatus,
  spamCheckState,
} from '@/lib/entries/entries'
import { entriesListQuery, entryQuery } from '@/lib/entries/queries'
import { formQuery } from '@/lib/forms/queries'
import { parseListQuery } from '@/lib/list-query'
import { toastError } from '@/lib/toast-error'
import { cn } from '@/lib/utils'
import type { FormEntry, FormEntryUpdateBody } from '@/types/models'
import { EntryDetail } from './entry-detail'

const noEntries: FormEntry[] = []

/**
 * One entry with its actions: in the slide-over over the list (`sheet`), or as a full page for a
 * direct link (`page`). The slide-over also moves through the list with previous/next and `k`/`j`.
 */
export function EntryPanel({
  formId,
  entryId,
  renderedAt,
  mode,
  title,
  onClose,
}: {
  formId: string
  entryId: string
  renderedAt: number
  mode: 'sheet' | 'page'
  /** The heading: the sheet's dialog title, or the page's h1. */
  title: (text: React.ReactNode) => React.ReactNode
  /** Closes the slide-over. */
  onClose?: () => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const actions = useEntryActions(formId)
  const { confirm, dialog } = useConfirm()
  const now = useNow(renderedAt, 5_000)
  const listState = useMemo(
    () => parseListQuery(Object.fromEntries(searchParams.entries()), entryListOptions),
    [searchParams],
  )
  const status = entryStatus(listState)
  const inTrash = status === 'trash'
  const apiQuery = useMemo(() => entryApiQuery(listState), [listState])
  const { data: form } = useQuery(formQuery(formId))
  const fields = useMemo(() => entryFields(form?.schema), [form?.schema])

  // The list the entry was opened from: for previous/next, and for entries in Trash, which the
  // show endpoint doesn't return.
  const list = useQuery({
    ...entriesListQuery(formId, apiQuery),
    enabled: mode === 'sheet' || inTrash,
  })
  const detail = useQuery({
    ...entryQuery(formId, entryId),
    enabled: !inTrash,
    // Show the list's copy straight away, then refresh it.
    initialData: () => cachedListEntry(queryClient, formId, entryId),
    initialDataUpdatedAt: 0,
    refetchInterval: (query) =>
      query.state.data &&
      spamCheckState(query.state.data, Date.now(), entriesConfig.spamCheckWindowMs) === 'checking'
        ? entriesConfig.spamCheckPollMs
        : false,
  })
  const entry = inTrash ? list.data?.data.find((row) => row.id === entryId) : detail.data
  const notFound =
    (detail.error instanceof ApiError && detail.error.status === 404) ||
    (inTrash && list.isSuccess && !entry)

  // Opening an unread entry marks it read, once per entry while it's open.
  const markedRead = useRef(new Set<string>())

  useEffect(() => {
    if (!entry || entry.read_at || inTrash || markedRead.current.has(entry.id)) return

    markedRead.current.add(entry.id)
    void actions
      .update(entry, { read_at: new Date().toISOString() }, { silent: true })
      .then((updated) => updated && actions.refreshCounts())
  }, [entry, inTrash, actions])

  // The spam check finished while the entry was open, and flagged it.
  const checkedAt = useRef(entry?.spam_checked_at)

  useEffect(() => {
    if (!entry) return

    if (!checkedAt.current && entry.spam_checked_at && entry.spam) {
      toast.warning('Moved to Spam', { description: entry.spam_reason ?? undefined })
      void actions.refresh()
    }

    checkedAt.current = entry.spam_checked_at
  }, [entry, actions])

  // --- Previous / next ------------------------------------------------------------------------

  // Where the entry was last seen in the list, for when it leaves it (read in Unread, moved to
  // Spam): previous/next then carry on from that position.
  const rows = list.data?.data ?? noEntries
  const [lastSeen, setLastSeen] = useState<{ id: string; index: number }>()
  const index = rows.findIndex((row) => row.id === entryId)

  if (index !== -1 && (lastSeen?.id !== entryId || lastSeen.index !== index)) {
    setLastSeen({ id: entryId, index })
  }

  const neighbours = adjacentEntries(
    rows,
    entryId,
    lastSeen?.id === entryId ? lastSeen.index : undefined,
  )
  const currentPage = list.data?.meta.current_page ?? 1
  const lastPage = list.data?.meta.last_page ?? 1
  const hasPrevious = Boolean(neighbours.previous) || currentPage > 1
  const hasNext = Boolean(neighbours.next) || currentPage < lastPage
  const [moving, setMoving] = useState(false)

  function goTo(id: string, page = currentPage) {
    const params = new URLSearchParams(searchParams)

    if (page > 1) params.set('page', String(page))
    else params.delete('page')

    const query = params.toString()

    router.replace(`/forms/${formId}/entries/${id}${query ? `?${query}` : ''}` as Route, {
      scroll: false,
    })
  }

  /** Moves through the list, loading the page before or after this one at its edges. */
  async function move(direction: -1 | 1) {
    if (moving) return

    const adjacent = direction === 1 ? neighbours.next : neighbours.previous

    if (adjacent) return goTo(adjacent.id)

    const page = currentPage + direction

    if (page < 1 || page > lastPage) return

    setMoving(true)

    try {
      const rows = (await queryClient.fetchQuery(entriesListQuery(formId, { ...apiQuery, page })))
        .data
      const target = direction === 1 ? rows[0] : rows.at(-1)

      if (target) goTo(target.id, page)
    } catch (error) {
      toastError(error)
    } finally {
      setMoving(false)
    }
  }

  const moveRef = useRef(move)

  useEffect(() => {
    moveRef.current = move
  })

  useEffect(() => {
    if (mode !== 'sheet') return

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return

      const target = event.target as HTMLElement | null

      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      if (event.key === 'j') void moveRef.current(1)
      else if (event.key === 'k') void moveRef.current(-1)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  // --- Actions ------------------------------------------------------------------------------

  const [busy, setBusy] = useState<string>()
  const listHref = `/forms/${formId}/entries${searchParams.size ? `?${searchParams}` : ''}` as Route

  const leave = () => (onClose ? onClose() : router.push(listHref))

  // Buttons show `aria-disabled` while an action runs, not `disabled`: a disabled button loses
  // keyboard focus, so this ignores presses instead.
  async function run(name: string, action: () => Promise<unknown>) {
    if (busy !== undefined) return

    setBusy(name)
    await action()
    setBusy(undefined)
  }

  const change = (entry: FormEntry, name: string, body: FormEntryUpdateBody, message?: string) =>
    run(name, async () => {
      if (await actions.update(entry, body, { message })) await actions.refresh()
    })

  async function forceDelete(id: string) {
    const confirmed = await confirm({
      title: 'Permanently delete this entry?',
      description: "Its submitted data is erased and can't be recovered.",
      confirmLabel: 'Delete permanently',
    })

    if (confirmed) {
      await run('force', async () => {
        if (await actions.forceDelete(id)) leave()
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-1 border-b px-4 py-3 sm:px-6">
        {mode === 'page' && (
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={listHref} aria-label="Back to entries">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
        )}
        {title(
          <>
            Entry
            {entry?.deleted_at && (
              <span className="font-normal text-muted-foreground"> (in Trash)</span>
            )}
          </>,
        )}
        {mode === 'sheet' && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous entry"
              aria-keyshortcuts="k"
              disabled={!hasPrevious}
              aria-disabled={moving}
              onClick={() => void move(-1)}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next entry"
              aria-keyshortcuts="j"
              disabled={!hasNext}
              aria-disabled={moving}
              onClick={() => void move(1)}
            >
              <ChevronDown aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Close entry" onClick={leave}>
              <X aria-hidden />
            </Button>
          </>
        )}
      </header>

      {entry && (
        <div className="flex flex-wrap gap-2 border-b px-4 py-3 sm:px-6">
          {!inTrash && !entry.deleted_at ? (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={entry.starred}
                aria-disabled={busy !== undefined}
                onClick={() => void change(entry, 'star', { starred: !entry.starred })}
              >
                <Star aria-hidden className={cn(entry.starred && 'fill-current text-amber-500')} />
                {entry.starred ? 'Starred' : 'Star'}
              </Button>
              {entry.read_at ? (
                <Button
                  variant="outline"
                  size="sm"
                  aria-disabled={busy !== undefined}
                  onClick={() => {
                    // Don't mark it read again while it's still open.
                    markedRead.current.add(entry.id)
                    void change(entry, 'read', { read_at: null }, 'Marked as unread')
                  }}
                >
                  <Mail aria-hidden />
                  Mark as unread
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  aria-disabled={busy !== undefined}
                  onClick={() =>
                    void change(
                      entry,
                      'read',
                      { read_at: new Date().toISOString() },
                      'Marked as read',
                    )
                  }
                >
                  <MailOpen aria-hidden />
                  Mark as read
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                aria-disabled={busy !== undefined}
                onClick={() =>
                  void change(
                    entry,
                    'spam',
                    { spam: !entry.spam },
                    entry.spam ? 'Marked as not spam' : 'Marked as spam',
                  )
                }
              >
                {entry.spam ? <ShieldCheck aria-hidden /> : <ShieldAlert aria-hidden />}
                {entry.spam ? 'Not spam' : 'Mark as spam'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="ms-auto"
                aria-disabled={busy !== undefined}
                onClick={() =>
                  void run('delete', async () => {
                    if (await actions.remove(entry.id)) leave()
                  })
                }
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-disabled={busy !== undefined}
                onClick={() =>
                  void run('restore', async () => {
                    if (await actions.restore(entry.id)) leave()
                  })
                }
              >
                <Undo2 aria-hidden />
                Restore
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="ms-auto"
                aria-disabled={busy !== undefined}
                onClick={() => void forceDelete(entry.id)}
              >
                <Trash aria-hidden />
                Delete permanently
              </Button>
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {entry ? (
          <EntryDetail entry={entry} fields={fields} now={now} />
        ) : notFound ? (
          <EmptyState
            icon={SearchX}
            title="Entry not found"
            description="It may have been deleted, or moved out of this list."
          >
            <Button variant="outline" onClick={leave}>
              Back to entries
            </Button>
          </EmptyState>
        ) : detail.isError ? (
          <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <div className="flex flex-col gap-6" aria-busy="true">
            <span className="sr-only">Loading entry…</span>
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog}
    </div>
  )
}
