/** A tab whose feature arrives in a later milestone. */
export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1 rounded-lg border border-dashed p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </section>
  )
}
