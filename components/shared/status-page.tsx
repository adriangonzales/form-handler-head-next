import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** A full-page message, such as not found or access denied, with a way back to the forms. */
export function StatusPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
      <Button asChild>
        <Link href="/forms">Back to forms</Link>
      </Button>
    </main>
  )
}
