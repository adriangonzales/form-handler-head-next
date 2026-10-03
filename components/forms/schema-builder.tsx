'use client'

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListPlus, Plus, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormAlert } from '@/components/auth/form-alert'
import { EmptyState } from '@/components/shared/empty-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/hooks/use-hydrated'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { ApiError } from '@/lib/api-client'
import { entryTotalQuery, formQuery, updateForm } from '@/lib/forms/queries'
import { queryKeys } from '@/lib/query-keys'
import {
  draftsToSchema,
  type FieldDraft,
  inputName,
  newFieldDraft,
  schemaToDrafts,
  validateDrafts,
} from '@/lib/schema/builder'
import type { Form } from '@/types/models'
import { draftDisplayName, SchemaFieldRow } from './schema-field-row'

/** The Fields tab: edits the form's schema as a list of rows, saved together. */
export function SchemaBuilder({ formId }: { formId: string }) {
  const { data: form } = useQuery(formQuery(formId))

  // The layout fetched the form before this rendered, so it's only missing after a delete.
  return form ? <Builder key={form.id} form={form} /> : null
}

const serialise = (drafts: readonly FieldDraft[]) => JSON.stringify(draftsToSchema(drafts))

function Builder({ form }: { form: Form }) {
  const hydrated = useHydrated()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState(() => schemaToDrafts(form.schema))
  const [saved, setSaved] = useState(() => serialise(drafts))
  const [showErrors, setShowErrors] = useState(false)
  const [failures, setFailures] = useState<string[]>([])
  const [focusLast, setFocusLast] = useState(false)
  const dirty = serialise(drafts) !== saved
  const errors = showErrors ? validateDrafts(drafts) : {}

  useUnsavedChanges(dirty)

  // Entries keep the input names they were submitted with, so renaming or removing a field on a
  // form that has entries leaves them under the old name.
  const { data: entryTotal = 0 } = useQuery(entryTotalQuery(form.id))
  const droppedNames = useMemo(() => {
    const current = new Set(drafts.map(inputName))

    return schemaToDrafts(form.schema)
      .map(inputName)
      .filter((name) => !current.has(name))
  }, [drafts, form.schema])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const nameOf = (key: string | number) => {
    const draft = drafts.find((item) => item.key === key)

    return draft ? draftDisplayName(draft) : 'Field'
  }
  const positionOf = (key: string | number) => drafts.findIndex((item) => item.key === key) + 1

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)} of ${drafts.length}.`,
    // Over its own position (straight after pickup, too): nothing new to say.
    onDragOver: ({ active, over }) =>
      over?.id === active.id
        ? undefined
        : over
          ? `${nameOf(active.id)} moved to position ${positionOf(over.id)} of ${drafts.length}.`
          : `${nameOf(active.id)} is no longer over a position.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)} of ${drafts.length}.`
        : `${nameOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return

    setDrafts((current) =>
      arrayMove(
        current,
        current.findIndex((draft) => draft.key === active.id),
        current.findIndex((draft) => draft.key === over.id),
      ),
    )
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta

    if (target >= 0 && target < drafts.length) setDrafts(arrayMove(drafts, index, target))
  }

  function addField() {
    setDrafts([...drafts, newFieldDraft()])
    setFocusLast(true)
  }

  const save = useMutation({
    mutationFn: () =>
      updateForm(form.id, { name: form.name, active: form.active, schema: draftsToSchema(drafts) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.forms.detail(updated.id), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.forms.lists() })

      const next = schemaToDrafts(updated.schema)

      setDrafts(next)
      setSaved(serialise(next))
      setShowErrors(false)
      setFocusLast(false)
      toast.success('Fields saved')
    },
    onError: (error) => {
      const messages = error instanceof ApiError ? Object.values(error.errors).flat() : []

      setFailures(
        messages.length > 0
          ? messages
          : [error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'],
      )
    },
  })

  function onSave() {
    setShowErrors(true)
    setFailures([])

    if (Object.keys(validateDrafts(drafts)).length > 0) {
      setFailures(['Fix the highlighted fields, then save again.'])

      return
    }

    save.mutate()
  }

  function discard() {
    const next = schemaToDrafts(form.schema)

    setDrafts(next)
    setSaved(serialise(next))
    setShowErrors(false)
    setFailures([])
    setFocusLast(false)
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Submissions are checked against these fields. Only fields listed here are stored; anything
        else in a submission is dropped.
      </p>

      {failures.map((failure) => (
        <FormAlert key={failure}>{failure}</FormAlert>
      ))}

      {entryTotal > 0 && droppedNames.length > 0 && (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>This form already has entries</AlertTitle>
          <AlertDescription>
            Existing entries keep their values under{' '}
            {droppedNames.map((name) => `“${name}”`).join(', ')}. They still appear in exports, and
            under “Other fields” on each entry.
          </AlertDescription>
        </Alert>
      )}

      {drafts.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="No fields yet"
          description="Without fields, every submission is accepted but nothing it sends is stored, only when and where it came from."
        >
          <Button onClick={addField} disabled={!hydrated}>
            <Plus aria-hidden />
            Add field
          </Button>
        </EmptyState>
      ) : (
        <DndContext
          // A fixed id keeps dnd-kit's generated ARIA ids the same on the server and in the browser.
          id="schema-fields"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'To reorder a field, press Space or Enter to pick it up, use the arrow keys to move it, then press Space or Enter to drop it, or Escape to cancel.',
            },
          }}
        >
          <SortableContext
            items={drafts.map((draft) => draft.key)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-3" aria-label="Fields">
              {drafts.map((draft, index) => (
                <SchemaFieldRow
                  key={draft.key}
                  draft={draft}
                  index={index}
                  count={drafts.length}
                  errors={errors[draft.key]}
                  otherNames={drafts.filter((other) => other !== draft).map(inputName)}
                  autoFocus={focusLast && index === drafts.length - 1}
                  onChange={(next) =>
                    setDrafts((current) =>
                      current.map((item) => (item.key === next.key ? next : item)),
                    )
                  }
                  onMove={(delta) => move(index, delta)}
                  onRemove={() => setDrafts(drafts.filter((item) => item.key !== draft.key))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {drafts.length > 0 && (
          <Button variant="outline" onClick={addField} disabled={!hydrated}>
            <Plus aria-hidden />
            Add field
          </Button>
        )}
        <div className="flex-1" />
        {dirty && (
          <Button variant="ghost" onClick={discard}>
            Discard changes
          </Button>
        )}
        <Button onClick={onSave} disabled={!dirty || !hydrated || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save fields'}
        </Button>
      </div>
    </div>
  )
}
