import type { LucideIcon } from 'lucide-react'

/** A centred message for a list with nothing in it, with an optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-16 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}
