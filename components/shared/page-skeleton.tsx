import { Skeleton } from '@/components/ui/skeleton'

/**
 * What a dashboard page shows while its server render is on the way (the `loading.tsx` files). The
 * title is real, so the page is named at once; the rest are placeholder blocks.
 */
export function PageSkeleton({
  title,
  variant = 'table',
}: {
  /** Omit on a tab, where the form's header already names the page. */
  title?: string
  variant?: 'table' | 'form'
}) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
      {variant === 'table' ? <TableSkeleton /> : <FormSkeleton />}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-9 w-full max-w-sm" />
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        {Array.from({ length: 6 }, (_, row) => (
          <Skeleton key={row} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="flex max-w-2xl flex-col gap-6" aria-hidden>
      {Array.from({ length: 3 }, (_, field) => (
        <div key={field} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  )
}
