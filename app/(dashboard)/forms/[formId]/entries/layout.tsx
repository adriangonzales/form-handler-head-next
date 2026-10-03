/**
 * The Entries tab. `detail` is a parallel slot: following an entry link from the list intercepts
 * `[entryId]` into a slide-over there, while `children` keeps the list (and its scroll position).
 * A direct link or reload renders `[entryId]` as a full page in `children` instead.
 */
export default function EntriesLayout({
  children,
  detail,
}: LayoutProps<'/forms/[formId]/entries'>) {
  return (
    <>
      {children}
      {detail}
    </>
  )
}
