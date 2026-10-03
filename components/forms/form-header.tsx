'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Copy, EllipsisVertical, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useFormActions } from '@/hooks/use-form-actions'
import { formQuery } from '@/lib/forms/queries'

/** The top of every form tab: back link, name, the Active switch, and Duplicate/Delete. */
export function FormHeader({ formId }: { formId: string }) {
  const router = useRouter()
  const { data: form } = useQuery(formQuery(formId))
  const { setActive, duplicate, remove } = useFormActions()

  if (!form) return null

  async function deleteForm() {
    if (!form) return

    try {
      await remove(form)
      router.push('/forms')
    } catch {
      // Already shown as a toast.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="icon-sm" asChild>
        <Link href="/forms" aria-label="Back to forms">
          <ArrowLeft aria-hidden />
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{form.name}</h1>

      <div className="flex items-center gap-2">
        <Switch
          id="form-active"
          checked={form.active}
          // Not `disabled` while saving, which would drop keyboard focus.
          aria-disabled={setActive.isPending}
          onCheckedChange={(active) => {
            if (!setActive.isPending) setActive.mutate({ form, active })
          }}
        />
        <Label htmlFor="form-active" className="w-16">
          {form.active ? 'Active' : 'Inactive'}
        </Label>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Form actions">
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={duplicate.isPending} onSelect={() => duplicate.mutate(form)}>
            <Copy aria-hidden />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void deleteForm()}>
            <Trash2 aria-hidden />
            Delete form
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
