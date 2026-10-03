'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useHydrated } from '@/hooks/use-hydrated'
import { applyApiError } from '@/lib/form-errors'
import { createForm } from '@/lib/forms/queries'
import { formTemplates, templateSchema } from '@/lib/forms/templates'
import { queryKeys } from '@/lib/query-keys'

const schema = z.object({
  name: z.string().trim().min(1, 'Give the form a name.').max(400, 'Use at most 400 characters.'),
  template: z.enum(['blank', 'contact', 'newsletter']),
})

type Values = z.input<typeof schema>

/** Creates a form from a name and a starting template, then opens its Integrate tab. */
export function NewForm() {
  const hydrated = useHydrated()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [failure, setFailure] = useState<string>()
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', template: 'contact' },
  })
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState

  async function onSubmit({ name, template }: z.output<typeof schema>) {
    setFailure(undefined)

    try {
      const created = await createForm({ name, schema: templateSchema(template) })

      // Not cached from this response: the form's layout fetches it, as The Backend stores it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.forms.lists() })
      toast.success(`Created “${created.name}”`, {
        description: "It's inactive until you turn it on.",
      })
      router.push(`/forms/${created.id}/integrate` as Route)
    } catch (error) {
      setFailure(applyApiError(error, form.setError, ['name', 'template']))
      throw error // Keeps isSubmitSuccessful false.
    }
  }

  return (
    <form
      onSubmit={(event) =>
        void form
          .handleSubmit(onSubmit)(event)
          .catch(() => undefined)
      }
      noValidate
      className="max-w-xl"
    >
      <fieldset disabled={!hydrated || isSubmitting || isSubmitSuccessful}>
        <FieldGroup>
          {failure && <FormAlert>{failure}</FormAlert>}

          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              autoFocus
              placeholder="Contact us"
              aria-invalid={!!errors.name}
              aria-describedby="name-help"
              {...form.register('name')}
            />
            <FieldDescription id="name-help">
              Only you see this. Submitters don&apos;t.
            </FieldDescription>
            <FieldError errors={[errors.name]} />
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Start from</FieldLegend>
            <FieldDescription>You can change the fields later.</FieldDescription>
            <Controller
              control={form.control}
              name="template"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid-cols-1 sm:grid-cols-3"
                >
                  {formTemplates.map((template) => (
                    <FieldLabel key={template.id} htmlFor={`template-${template.id}`}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle id={`template-${template.id}-label`}>
                            {template.label}
                          </FieldTitle>
                          <FieldDescription id={`template-${template.id}-description`}>
                            {template.description}
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem
                          value={template.id}
                          id={`template-${template.id}`}
                          aria-labelledby={`template-${template.id}-label`}
                          aria-describedby={`template-${template.id}-description`}
                        />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              )}
            />
          </FieldSet>

          <div className="flex gap-2">
            <Button type="submit">{isSubmitting ? 'Creating…' : 'Create form'}</Button>
            <Button variant="ghost" asChild>
              <Link href="/forms">Cancel</Link>
            </Button>
          </div>
        </FieldGroup>
      </fieldset>
    </form>
  )
}
