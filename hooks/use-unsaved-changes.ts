'use client'

import { useEffect } from 'react'

export const unsavedChangesMessage = 'You have unsaved changes. Leave without saving?'

/**
 * Warns before leaving with unsaved changes: when closing or reloading the tab (`beforeunload`),
 * and when following a link inside the app. The App Router has no navigation events to cancel, so
 * link clicks are caught before React sees them, and cancelled unless the user confirms.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const link = (event.target as Element | null)?.closest?.('a[href]')

      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank') return

      const url = new URL(link.href, window.location.href)

      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return
      }

      if (!window.confirm(unsavedChangesMessage)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    // Capture on the document runs before React's listeners on the root, so Next's Link never
    // starts a navigation the user cancelled.
    document.addEventListener('click', onClick, true)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])
}
