'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * Anything a page throws that isn't handled closer to it. `(dashboard)/error.tsx` re-exports this, so
 * a dashboard page's error keeps the sidebar. `retry` fetches the page again; `reset` would only
 * re-render what failed.
 */
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Please try again. If it keeps happening, come back later.
      </p>
      <div className="flex gap-2">
        <Button onClick={retry}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/forms">Go to your forms</Link>
        </Button>
      </div>
    </main>
  )
}
