'use client'

import { useExportsWatcher } from '@/hooks/use-exports-watcher'

/** Polls in-progress exports for the whole dashboard. Rendered once, in the dashboard layout. */
export function ExportsWatcher() {
  useExportsWatcher()

  return null
}
