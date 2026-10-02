'use client'

import { ArrowRight, Copy, EllipsisVertical, Pause, Play, Settings, Trash2 } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useFormActions } from '@/hooks/use-form-actions'
import type { FormListItem } from '@/types/models'

/** A forms list row's actions: open, settings, duplicate, activate/deactivate and delete. */
export function FormRowMenu({ form }: { form: FormListItem }) {
  const { setActive, duplicate, remove } = useFormActions()
  const [busy, setBusy] = useState(false)

  function run(action: () => Promise<unknown>) {
    setBusy(true)
    action()
      .catch(() => undefined) // Already shown as a toast.
      .finally(() => setBusy(false))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${form.name}`}
          disabled={busy}
        >
          <EllipsisVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/entries` as Route}>
            <ArrowRight aria-hidden />
            Open
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/settings` as Route}>
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(() => duplicate.mutateAsync(form))}>
          <Copy aria-hidden />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => run(() => setActive.mutateAsync({ form, active: !form.active }))}
        >
          {form.active ? <Pause aria-hidden /> : <Play aria-hidden />}
          {form.active ? 'Deactivate' : 'Activate'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => run(() => remove(form))}>
          <Trash2 aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
