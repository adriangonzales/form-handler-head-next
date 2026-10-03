'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { isExpired } from '@/lib/exports/exports'
import {
  addCachedExport,
  createExport,
  fetchExport,
  patchCachedExport,
  removeCachedExport,
} from '@/lib/exports/queries'
import { toastError } from '@/lib/toast-error'
import type { FormEntryExport } from '@/types/models'

/**
 * Download and Try again for any list of exports; changes land in every cached list.
 *
 * Download fetches the export again for a fresh signed link, because a link from an earlier
 * response may have expired, then starts an ordinary browser download from The Backend. The file
 * never passes through this app.
 */
export function useExportActions() {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string>()

  /** Starts an export with the same filters and sort. Throws when The Backend refuses. */
  async function start(entryExport: Pick<FormEntryExport, 'form_id' | 'parameters'>) {
    const started = await createExport(entryExport.form_id, entryExport.parameters)

    addCachedExport(queryClient, started)

    return started
  }

  function expired(entryExport: FormEntryExport) {
    removeCachedExport(queryClient, entryExport.id)
    toast.warning('This export has expired', {
      description: 'Exports are kept for 24 hours.',
      action: {
        label: 'Export again',
        onClick: () => void run(entryExport.id, () => start(entryExport)),
      },
    })
  }

  async function download(entryExport: FormEntryExport) {
    await run(entryExport.id, async () => {
      let fresh: FormEntryExport

      try {
        fresh = await fetchExport(entryExport.id)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return expired(entryExport)

        throw error
      }

      if (isExpired(fresh, Date.now())) return expired(fresh)

      // Back in the lists as in progress, if it is, so the watcher polls it again.
      patchCachedExport(queryClient, fresh)

      if (fresh.status !== 'completed' || !fresh.download_url) {
        toast('This export is not ready yet.')

        return
      }

      startDownload(fresh.download_url, fresh.filename)
    })
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id)

    try {
      await action()
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(undefined)
    }
  }

  return {
    /** The export whose action is running. */
    busy,
    download,
    retry: (entryExport: FormEntryExport) => run(entryExport.id, () => start(entryExport)),
    start,
  }
}

/** A plain link click, so the browser streams the file and shows its own download UI. */
function startDownload(url: string, filename: string) {
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}
