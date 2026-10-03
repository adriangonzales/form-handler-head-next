'use client'

import {
  Mail,
  MailOpen,
  ShieldAlert,
  ShieldCheck,
  Star,
  StarOff,
  Trash,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type BulkActionItem, bulkActionsFor, type EntryStatus } from '@/lib/entries/entries'
import type { FormEntryBulkAction } from '@/types/models'

const icons: Record<FormEntryBulkAction, React.ComponentType<{ 'aria-hidden'?: boolean }>> = {
  mark_read: MailOpen,
  mark_unread: Mail,
  star: Star,
  unstar: StarOff,
  mark_spam: ShieldAlert,
  mark_not_spam: ShieldCheck,
  delete: Trash2,
  restore: Undo2,
  force_delete: Trash,
}

/** The actions for the selected entries; which ones depends on the tab. */
export function EntryBulkBar({
  status,
  count,
  busy,
  onRun,
  onClear,
}: {
  status: EntryStatus
  count: number
  /** The action in progress. */
  busy?: FormEntryBulkAction
  onRun: (item: BulkActionItem) => void
  onClear: () => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/50 px-3 py-2"
    >
      <span className="me-2 text-sm font-medium tabular-nums" aria-live="polite">
        {count} selected
      </span>
      {bulkActionsFor(status).map((item) => {
        const Icon = icons[item.action]

        return (
          <Button
            key={item.action}
            variant={item.destructive ? 'destructive' : 'ghost'}
            size="sm"
            disabled={busy !== undefined}
            onClick={() => onRun(item)}
          >
            <Icon aria-hidden />
            {busy === item.action ? `${item.label}…` : item.label}
          </Button>
        )
      })}
      <Button variant="link" size="sm" className="ms-auto" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  )
}
