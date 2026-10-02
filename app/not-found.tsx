import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">This page doesn&apos;t exist, or it has been deleted.</p>
      <Button asChild>
        <Link href="/forms">Go to your forms</Link>
      </Button>
    </main>
  )
}
