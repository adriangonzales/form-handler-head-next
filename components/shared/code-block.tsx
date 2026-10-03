'use client'

import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/hooks/use-copy'

/** Read-only code, shown as text (never rendered), with a copy button. */
export function CodeBlock({ code, label }: { code: string; label: string }) {
  const copy = useCopy()

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="xs"
        className="absolute top-2 right-2"
        aria-label={`Copy ${label}`}
        onClick={() => void copy(code, label)}
      >
        <Copy aria-hidden />
        Copy
      </Button>
      <pre
        role="region"
        aria-label={label}
        tabIndex={0}
        className="max-h-96 overflow-auto rounded-lg border bg-muted/50 p-4 pr-20 font-mono text-xs/5"
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}
