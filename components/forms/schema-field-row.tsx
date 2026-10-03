'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react'
import { TagsInput } from '@/components/shared/tags-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useCopy } from '@/hooks/use-copy'
import { type DraftErrors, type FieldDraft, slugifyInputName } from '@/lib/schema/builder'
import { cn } from '@/lib/utils'

const presets = [
  { key: 'required', label: 'Required' },
  { key: 'email', label: 'Email address' },
  { key: 'numeric', label: 'Number' },
  { key: 'url', label: 'URL' },
] as const

/** What a row is called in buttons and announcements. */
export function draftDisplayName(draft: FieldDraft): string {
  return draft.label.trim() || draft.name.trim() || 'New field'
}

/** One field of the schema builder: label, input name, ID, rules, and move/remove controls. */
export function SchemaFieldRow({
  draft,
  index,
  count,
  errors,
  otherNames,
  autoFocus,
  onChange,
  onMove,
  onRemove,
}: {
  draft: FieldDraft
  index: number
  count: number
  errors?: DraftErrors[string]
  /** Input names of the other fields, so a generated name stays unique. */
  otherNames: readonly string[]
  /** Focuses the label input when the row appears, for a field the user just added. */
  autoFocus?: boolean
  onChange: (draft: FieldDraft) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  const copy = useCopy()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draft.key })
  const position = index + 1
  const displayName = draftDisplayName(draft)
  const id = (part: string) => `${draft.key}-${part}`

  const update = (patch: Partial<FieldDraft>) => onChange({ ...draft, ...patch })

  /** Until the input name is typed, it follows the label: `Email address` → `email_address`. */
  function setLabel(label: string) {
    if (draft.nameEdited) return update({ label })

    const base = slugifyInputName(label)
    let name = base
    let suffix = 2

    while (name && otherNames.includes(name)) {
      name = `${base}_${suffix}`
      suffix += 1
    }

    update({ label, name })
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-field-row={position}
      className={cn(
        'flex flex-col gap-4 rounded-lg border bg-card p-4',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <div className="flex items-center gap-1">
        <Button
          ref={setActivatorNodeRef}
          variant="ghost"
          size="icon-sm"
          className="cursor-grab touch-none"
          aria-label={`Drag to reorder ${displayName}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {position}. {displayName}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={index === 0}
          aria-label={`Move ${displayName} up`}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={index === count - 1}
          aria-label={`Move ${displayName} down`}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label={`Remove ${displayName}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={id('label')}>Label</FieldLabel>
          <Input
            id={id('label')}
            value={draft.label}
            placeholder="Email address"
            data-field-label
            autoFocus={autoFocus}
            aria-describedby={id('label-help')}
            onChange={(event) => setLabel(event.target.value)}
          />
          <FieldDescription id={id('label-help')}>
            Shown with entries and in alert emails.
          </FieldDescription>
        </Field>
        <Field data-invalid={!!errors?.name}>
          <FieldLabel htmlFor={id('name')}>Input name</FieldLabel>
          <Input
            id={id('name')}
            value={draft.name}
            placeholder="email_address"
            className="font-mono"
            required
            aria-invalid={!!errors?.name}
            aria-describedby={id('name-help')}
            onChange={(event) => update({ name: event.target.value, nameEdited: true })}
          />
          <FieldDescription id={id('name-help')}>
            The name your form&apos;s input must use. Submitted values are stored under it.
          </FieldDescription>
          <FieldError>{errors?.name}</FieldError>
        </Field>
      </div>

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        Field ID{' '}
        <span className="font-mono" data-field-id>
          {draft.id}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Copy the field ID of ${displayName}`}
          onClick={() => void copy(draft.id, 'the field ID')}
        >
          <Copy aria-hidden />
        </Button>
      </p>

      <FieldSet className="gap-3">
        <FieldLegend variant="label">Validation</FieldLegend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {presets.map((preset) => (
            <Field key={preset.key} orientation="horizontal" className="w-auto">
              <Checkbox
                id={id(preset.key)}
                checked={draft[preset.key]}
                onCheckedChange={(checked) => update({ [preset.key]: checked === true })}
              />
              <FieldLabel htmlFor={id(preset.key)} className="font-normal">
                {preset.label}
              </FieldLabel>
            </Field>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          {(['min', 'max'] as const).map((bound) => (
            <Field key={bound} data-invalid={!!errors?.[bound]}>
              <FieldLabel htmlFor={id(bound)}>{bound === 'min' ? 'Min' : 'Max'}</FieldLabel>
              <Input
                id={id(bound)}
                value={draft[bound]}
                inputMode="numeric"
                placeholder="—"
                aria-invalid={!!errors?.[bound]}
                aria-describedby={id(`${bound}-help`)}
                onChange={(event) => update({ [bound]: event.target.value })}
              />
              <FieldDescription id={id(`${bound}-help`)}>
                Length, or value for numbers.
              </FieldDescription>
              <FieldError>{errors?.[bound]}</FieldError>
            </Field>
          ))}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={id('one-of')}>One of</FieldLabel>
            <TagsInput
              id={id('one-of')}
              value={draft.oneOf}
              onChange={(oneOf) => update({ oneOf })}
              placeholder="sales"
              listLabel={`Values accepted for ${displayName}`}
              split={/,+/}
              describedBy={id('one-of-help')}
            />
            <FieldDescription id={id('one-of-help')}>
              Only these values are accepted. Press Enter after each.
            </FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={id('custom')}>Other rules</FieldLabel>
          <TagsInput
            id={id('custom')}
            value={draft.custom}
            onChange={(custom) => update({ custom })}
            placeholder="alpha_dash"
            listLabel={`Other rules for ${displayName}`}
            split={/\n+/}
            mono
            describedBy={id('custom-help')}
          />
          <FieldDescription id={id('custom-help')}>
            Any rule in The Backend&apos;s rule syntax, such as alpha_dash or date. The Backend
            doesn&apos;t check these until a submission arrives, so a typo fails then.
          </FieldDescription>
        </Field>
      </FieldSet>
    </li>
  )
}
