'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False during server rendering and hydration, true after. Forms stay disabled until then, because
 * a native submit before hydration would send the fields, password included, as a GET query.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
