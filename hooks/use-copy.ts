'use client'

import { toast } from 'sonner'

/** Copies text to the clipboard, confirming with a toast that names what was copied. */
export function useCopy() {
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied ${what}`)
    } catch {
      toast.error(`Couldn't copy ${what}. Select it and copy it yourself.`)
    }
  }
}
