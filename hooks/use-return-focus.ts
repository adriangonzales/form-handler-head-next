import { useRef } from 'react'

type AutoFocusHandler = (event: Event) => void

/**
 * Returns focus to whatever had it when a Radix dialog opened. Radix only returns focus to a
 * `…Trigger`, and most dialogs here are opened from state (a menu item, a row action, a route), so
 * without this focus falls to the page body when they close. If that element has gone (a menu item,
 * say), Radix's own behaviour applies.
 *
 * Radix only reports the opening when nothing inside the dialog has focus yet, so a dialog that
 * starts on a particular field focuses it from `onOpenAutoFocus` rather than with `autoFocus`.
 */
export function useReturnFocus(handlers: {
  onOpenAutoFocus?: AutoFocusHandler
  onCloseAutoFocus?: AutoFocusHandler
}) {
  const previous = useRef<HTMLElement | null>(null)

  return {
    onOpenAutoFocus: (event: Event) => {
      // Radix runs this before it moves focus into the dialog.
      previous.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      handlers.onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      const element = previous.current

      previous.current = null
      handlers.onCloseAutoFocus?.(event)

      if (!event.defaultPrevented && element?.isConnected && element !== document.body) {
        event.preventDefault()
        element.focus()
      }
    },
  }
}
