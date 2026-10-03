'use client'

import { useCallback, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ConfirmOptions {
  title: string
  /** What will be lost. */
  description: string
  confirmLabel: string
}

/**
 * A confirmation for actions that can't be undone. `confirm(options)` opens the dialog and
 * resolves `true` if the user goes ahead; render `dialog` once in the component.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions>()
  const resolver = useRef<(confirmed: boolean) => void>(undefined)

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setOptions(next)
      }),
    [],
  )

  function settle(confirmed: boolean) {
    resolver.current?.(confirmed)
    resolver.current = undefined
    setOptions(undefined)
  }

  const dialog = (
    <AlertDialog open={options !== undefined} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => settle(true)}>
            {options?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, dialog }
}
