'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A list of hostnames as removable tags. Enter, a comma, leaving the field, or pasting adds what
 * was typed; Backspace in an empty field removes the last one.
 */
export function DomainsInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  placeholder,
}: {
  id: string
  value: string[]
  onChange: (domains: string[]) => void
  onBlur?: () => void
  invalid?: boolean
  describedBy?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  function add(text: string) {
    const known = new Set(value.map((domain) => domain.toLowerCase()))
    const added = text
      .split(/[\s,]+/)
      .map((domain) => domain.trim())
      .filter((domain) => {
        if (!domain || known.has(domain.toLowerCase())) return false
        known.add(domain.toLowerCase())

        return true
      })

    if (added.length > 0) onChange([...value, ...added])
    setDraft('')
  }

  return (
    <div
      className={cn(
        'flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        invalid && 'border-destructive ring-3 ring-destructive/20',
      )}
    >
      <ul className="contents" aria-label="Allowed domains added">
        {value.map((domain) => (
          <li
            key={domain}
            className="flex h-6 items-center gap-1 rounded-md bg-secondary pr-0.5 pl-2 font-mono text-xs"
          >
            {domain}
            <button
              type="button"
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Remove ${domain}`}
              onClick={() => onChange(value.filter((item) => item !== domain))}
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        value={draft}
        placeholder={value.length === 0 ? placeholder : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            add(draft)
          } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          add(draft + event.clipboardData.getData('text'))
        }}
        onBlur={() => {
          add(draft)
          onBlur?.()
        }}
      />
    </div>
  )
}
