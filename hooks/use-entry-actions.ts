'use client'

import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import {
  type BulkActionItem,
  bulkResultMessage,
  entriesLabel,
  isStaleSelectionError,
} from '@/lib/entries/entries'
import {
  bulkEntries,
  deleteEntry,
  forceDeleteEntry,
  restoreEntry,
  updateEntry,
} from '@/lib/entries/queries'
import { queryKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast-error'
import type { FormEntry, FormEntryUpdateBody, Paginated } from '@/types/models'

/** Replaces an entry wherever it's cached: its detail, and any list page it's on. */
export function patchCachedEntry(queryClient: QueryClient, formId: string, entry: FormEntry) {
  queryClient.setQueryData(queryKeys.entries.detail(formId, entry.id), entry)
  queryClient.setQueriesData<Paginated<FormEntry>>(
    { queryKey: queryKeys.entries.lists(formId) },
    (page) =>
      page && { ...page, data: page.data.map((row) => (row.id === entry.id ? entry : row)) },
  )
}

/** A cached copy of an entry from any list page, for showing it before (or instead of) a fetch. */
export function cachedListEntry(
  queryClient: QueryClient,
  formId: string,
  id: string,
): FormEntry | undefined {
  for (const [, page] of queryClient.getQueriesData<Paginated<FormEntry>>({
    queryKey: queryKeys.entries.lists(formId),
  })) {
    const row = page?.data.find((entry) => entry.id === id)

    if (row) return row
  }

  return undefined
}

/**
 * Entry actions shared by the list, the slide-over and the full page. Each shows a toast and
 * refreshes what it changes; failures show The Backend's message.
 */
export function useEntryActions(formId: string) {
  const queryClient = useQueryClient()

  /** Reloads lists, counts and details after a change that can move entries between tabs. */
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.form(formId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.forms.lists() }),
    ])

  /** The tab counts and the forms list's counts, after a change that keeps rows where they are. */
  const refreshCounts = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.entries.counts(formId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.forms.lists() }),
    ])

  /**
   * Updates an entry, showing the change straight away and putting it back if The Backend refuses.
   * Resolves the stored entry, or `undefined` on failure (after an error toast).
   */
  async function update(
    entry: FormEntry,
    body: FormEntryUpdateBody,
    options: { message?: string; silent?: boolean } = {},
  ): Promise<FormEntry | undefined> {
    patchCachedEntry(queryClient, formId, { ...entry, ...body } as FormEntry)

    try {
      const updated = await updateEntry(entry.id, body)

      patchCachedEntry(queryClient, formId, updated)
      if (options.message) toast.success(options.message)

      return updated
    } catch (error) {
      patchCachedEntry(queryClient, formId, entry)
      if (!options.silent) toastError(error)

      return undefined
    }
  }

  async function restore(id: string): Promise<boolean> {
    try {
      await restoreEntry(id)
      await refresh()
      toast.success('Entry restored')

      return true
    } catch (error) {
      toastError(error)

      return false
    }
  }

  /** Moves an entry to Trash, offering Undo. Resolves whether it was deleted. */
  async function remove(id: string): Promise<boolean> {
    try {
      await deleteEntry(id)
    } catch (error) {
      toastError(error)

      return false
    }

    void refresh()
    toast('Entry moved to Trash', {
      action: { label: 'Undo', onClick: () => void restore(id) },
    })

    return true
  }

  async function forceDelete(id: string): Promise<boolean> {
    try {
      await forceDeleteEntry(id)
      await refresh()
      toast.success('Entry permanently deleted')

      return true
    } catch (error) {
      toastError(error)

      return false
    }
  }

  /**
   * Runs a bulk action on the selected entries and reports how many changed. Resolves whether it
   * ran; a stale selection (an entry changed state meanwhile) refreshes the list.
   */
  async function bulk(item: BulkActionItem, ids: string[]): Promise<boolean> {
    try {
      const affected = await bulkEntries(formId, item.action, ids)

      await refresh()
      toast.success(bulkResultMessage(item, affected, ids.length), {
        action:
          item.action === 'delete' && affected > 0
            ? { label: 'Undo', onClick: () => void undoBulkDelete(ids) }
            : undefined,
      })

      return true
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        isStaleSelectionError(error.errors)
      ) {
        toast.warning('Some entries changed. Refresh and try again.')
        await refresh()
      } else {
        toastError(error)
      }

      return false
    }
  }

  async function undoBulkDelete(ids: string[]) {
    try {
      const restored = await bulkEntries(formId, 'restore', ids)

      await refresh()
      toast.success(`${entriesLabel(restored)} restored`)
    } catch (error) {
      toastError(error)
    }
  }

  return { refresh, refreshCounts, update, remove, restore, forceDelete, bulk }
}
