'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Anything a page throws that isn't handled closer to it. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Please try again. If it keeps happening, come back later.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/forms">Go to your forms</Link>
        </Button>
      </div>
    </main>
  )
}
