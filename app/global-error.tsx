'use client'

import './globals.css'

/** Errors in the root layout itself, which replaces the whole document. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <button type="button" className="underline" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  )
}
