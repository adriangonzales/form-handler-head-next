import { EntrySheet } from '@/components/entries/entry-sheet'
import { renderTime } from '@/lib/render-time'

/** An entry opened from the list: shown in the slide-over, from the list's copy and a refetch. */
export default async function EntrySheetPage({
  params,
}: PageProps<'/forms/[formId]/entries/[entryId]'>) {
  const { formId, entryId } = await params

  return <EntrySheet formId={formId} entryId={entryId} renderedAt={renderTime()} />
}
