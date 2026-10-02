import { Inbox } from 'lucide-react'

/** A centred card for the signed-out pages. */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2 font-semibold">
        <Inbox className="size-5 text-primary" aria-hidden />
        Form Handler
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        {children}
      </div>
    </main>
  )
}
