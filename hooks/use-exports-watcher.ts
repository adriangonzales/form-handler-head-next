'use client'

import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ApiError } from '@/lib/api-client'
import { isInProgress, pollDelay } from '@/lib/exports/exports'
import {
  exportsListQuery,
  fetchExport,
  patchCachedExport,
  recentExportsQuery,
  removeCachedExport,
} from '@/lib/exports/queries'
import { queryKeys } from '@/lib/query-keys'
import type { FormEntryExport, Paginated } from '@/types/models'

type SettledListener = (entryExport: FormEntryExport) => void

const settledListeners = new Map<string, SettledListener>()

/** Calls `listener` once when the export completes or fails, wherever the user is by then. */
export function onExportSettled(id: string, listener: SettledListener) {
  settledListeners.set(id, listener)
}

/**
 * Polls every export that's in progress in any cached list of exports (the account's recent
 * exports, which this loads, and the Exports page), every 2 s and then every 10 s after 30 s, until
 * it completes or fails, and updates every list that shows it. Polling pauses while the tab is
 * hidden. Mount it once, in the dashboard layout, so no export is polled twice.
 */
export function useExportsWatcher() {
  const queryClient = useQueryClient()

  // Loaded here for the sidebar badge, the Entries tab's popover, and polling.
  useQuery(exportsListQuery(recentExportsQuery))

  useEffect(() => {
    const poller = createExportPoller(queryClient)

    return () => poller.stop()
  }, [queryClient])
}

/**
 * Watches the query cache for in-progress exports and polls each one on its own timer. Trackers
 * survive changes to the lists (a refetch, another page) and are only cleared by `stop`.
 */
function createExportPoller(queryClient: QueryClient) {
  const trackers = new Map<string, { startedAt: number; timer?: number }>()
  const waitingForVisible = new Set<string>()
  let stopped = false

  function schedule(id: string) {
    const tracker = trackers.get(id)

    if (!tracker || stopped) return

    tracker.timer = window.setTimeout(
      () => void tick(id),
      pollDelay(Date.now() - tracker.startedAt),
    )
  }

  async function tick(id: string) {
    if (document.visibilityState === 'hidden') {
      waitingForVisible.add(id)

      return
    }

    let entryExport: FormEntryExport

    try {
      entryExport = await fetchExport(id)
    } catch (error) {
      if (stopped) return

      if (error instanceof ApiError && error.status === 404) {
        trackers.delete(id)
        removeCachedExport(queryClient, id)
      } else {
        schedule(id)
      }

      return
    }

    if (stopped || !trackers.has(id)) return

    if (isInProgress(entryExport)) {
      schedule(id)
    } else {
      // Before patching the cache, so the change it triggers doesn't track the export again.
      trackers.delete(id)
      settledListeners.get(id)?.(entryExport)
      settledListeners.delete(id)
    }

    patchCachedExport(queryClient, entryExport)
  }

  function sync() {
    const pages = queryClient.getQueriesData<Paginated<FormEntryExport>>({
      queryKey: queryKeys.exports.lists(),
    })

    for (const [, page] of pages) {
      for (const row of page?.data ?? []) {
        if (isInProgress(row) && !trackers.has(row.id)) {
          trackers.set(row.id, { startedAt: Date.now() })
          schedule(row.id)
        }
      }
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return

    for (const id of waitingForVisible) void tick(id)

    waitingForVisible.clear()
  }

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.query.queryKey[0] === queryKeys.exports.all[0]) sync()
  })

  document.addEventListener('visibilitychange', onVisibilityChange)
  sync()

  return {
    stop() {
      stopped = true
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)

      for (const tracker of trackers.values()) window.clearTimeout(tracker.timer)

      trackers.clear()
      waitingForVisible.clear()
    },
  }
}
