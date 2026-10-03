'use client'

import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EntryPanel } from './entry-panel'

/** An entry opened from the list: a slide-over, full width on phones, with the list behind it. */
export function EntrySheet({
  formId,
  entryId,
  renderedAt,
}: {
  formId: string
  entryId: string
  renderedAt: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Back to the list URL with its query, so the list behind keeps its filters and scroll position.
  const close = () =>
    router.push(`/forms/${formId}/entries${searchParams.size ? `?${searchParams}` : ''}` as Route, {
      scroll: false,
    })

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        showCloseButton={false}
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-2xl"
      >
        <SheetDescription className="sr-only">
          Everything recorded for this entry, with actions to triage it.
        </SheetDescription>
        <EntryPanel
          formId={formId}
          entryId={entryId}
          renderedAt={renderedAt}
          mode="sheet"
          title={(text) => (
            <SheetTitle className="flex-1 truncate font-semibold">{text}</SheetTitle>
          )}
          onClose={close}
        />
      </SheetContent>
    </Sheet>
  )
}
