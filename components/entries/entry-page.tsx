'use client'

import { EntryPanel } from './entry-panel'

/** An entry opened from a direct link or a reload: a full page with a way back to the list. */
export function EntryPage({
  formId,
  entryId,
  renderedAt,
}: {
  formId: string
  entryId: string
  renderedAt: number
}) {
  return (
    <div className="rounded-lg border">
      <EntryPanel
        formId={formId}
        entryId={entryId}
        renderedAt={renderedAt}
        mode="page"
        title={(text) => <h2 className="flex-1 truncate font-semibold">{text}</h2>}
      />
    </div>
  )
}
