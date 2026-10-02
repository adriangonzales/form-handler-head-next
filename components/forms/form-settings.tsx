'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, type FieldError as RhfFieldError, useForm, useWatch } from 'react-hook-form'
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
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCopy } from '@/hooks/use-copy'
import { useFormActions } from '@/hooks/use-form-actions'
import { useHydrated } from '@/hooks/use-hydrated'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { applyApiError } from '@/lib/form-errors'
import { formQuery, updateForm } from '@/lib/forms/queries'
import {
  domainPattern,
  honeypotNamePattern,
  settingsFormState,
  settingsPayload,
} from '@/lib/forms/settings'
import { queryKeys } from '@/lib/query-keys'
import type { Form } from '@/types/models'
import { DomainsInput } from './domains-input'
import { TimezoneSelect } from './timezone-select'

// Mirrors The Backend's limits, so most mistakes show before anything is sent.
const schema = z.object({
  name: z.string().trim().min(1, 'Give the form a name.').max(400, 'Use at most 400 characters.'),
  settings: z.object({
    message: z.string().max(2000, 'Use at most 2000 characters.'),
    redirect: z.union([
      z.literal(''),
      z
        .url({
          protocol: /^https?$/,
          message: 'Enter a full URL, such as https://example.com/thanks.',
        })
        .max(2048, 'Use at most 2048 characters.'),
    ]),
    timezone: z.string(),
    domains: z.array(
      z.string().regex(domainPattern, 'Use bare hostnames such as example.com or *.example.com.'),
    ),
    honeypot_enabled: z.boolean(),
    honeypot_name: z.union([
      z.literal(''),
      z
        .string()
        .regex(honeypotNamePattern, 'Use only letters, digits, “_” and “-”.')
        .max(255, 'Use at most 255 characters.'),
    ]),
  }),
})

type Values = z.infer<typeof schema>

const fieldNames = [
  'name',
  'settings.message',
  'settings.redirect',
  'settings.timezone',
  'settings.domains',
  'settings.honeypot_enabled',
  'settings.honeypot_name',
] as const

function valuesFrom(form: Form): Values {
  return { name: form.name, settings: settingsFormState(form.settings) }
}

/** The first message among a field's errors, including errors on a list's items. */
function firstError(error: unknown): RhfFieldError | undefined {
  if (!error || typeof error !== 'object') return undefined
  if ('message' in error && typeof error.message === 'string') return error as RhfFieldError

  return Object.values(error).map(firstError).find(Boolean)
}

/** The Settings tab: name, after-submission behaviour, spam protection, and deleting the form. */
export function FormSettings({ formId }: { formId: string }) {
  const { data: form } = useQuery(formQuery(formId))

  // The layout fetched the form before this rendered, so it's only missing after a delete.
  return form ? <SettingsEditor key={form.id} form={form} /> : null
}

function SettingsEditor({ form: saved }: { form: Form }) {
  const hydrated = useHydrated()
  const router = useRouter()
  const queryClient = useQueryClient()
  const copy = useCopy()
  const { remove } = useFormActions()
  const [failure, setFailure] = useState<string>()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesFrom(saved),
  })
  const { errors, isDirty } = form.formState
  const [honeypotEnabled, honeypotName] = useWatch({
    control: form.control,
    name: ['settings.honeypot_enabled', 'settings.honeypot_name'],
  })

  useUnsavedChanges(isDirty)

  const save = useMutation({
    mutationFn: (values: Values) =>
      updateForm(saved.id, {
        name: values.name,
        active: saved.active,
        settings: settingsPayload(values.settings),
      }),
    onMutate: () => setFailure(undefined),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.forms.detail(updated.id), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.forms.lists() })
      // Show what The Backend stored, including a generated honeypot name.
      form.reset(valuesFrom(updated))
      toast.success('Settings saved')
    },
    onError: (error) => setFailure(applyApiError(error, form.setError, fieldNames)),
  })

  async function deleteForm() {
    try {
      await remove(saved)
      router.push('/forms')
    } catch {
      // Already shown as a toast.
    }
  }

  const domainsError = firstError(errors.settings?.domains)

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
        <fieldset disabled={!hydrated || save.isPending}>
          <FieldGroup className="gap-8">
            {failure && <FormAlert>{failure}</FormAlert>}

            <FieldSet>
              <FieldLegend>General</FieldLegend>
              <FieldGroup>
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" aria-invalid={!!errors.name} {...form.register('name')} />
                  <FieldError errors={[errors.name]} />
                </Field>

                <Field data-invalid={!!errors.settings?.timezone}>
                  <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                  <Controller
                    control={form.control}
                    name="settings.timezone"
                    render={({ field }) => (
                      <TimezoneSelect
                        id="timezone"
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.settings?.timezone}
                        describedBy="timezone-help"
                      />
                    )}
                  />
                  <FieldDescription id="timezone-help">
                    Used for submission times in alert emails. Times are in UTC when this isn&apos;t
                    set.
                  </FieldDescription>
                  <FieldError errors={[errors.settings?.timezone]} />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>After a submission</FieldLegend>
              <FieldDescription>
                The Backend returns these to the submitting page, which shows the message or goes to
                the redirect URL.
              </FieldDescription>
              <FieldGroup>
                <Field data-invalid={!!errors.settings?.message}>
                  <FieldLabel htmlFor="message">Success message</FieldLabel>
                  <Textarea
                    id="message"
                    rows={3}
                    maxLength={2000}
                    placeholder="Thanks, we'll be in touch."
                    aria-invalid={!!errors.settings?.message}
                    {...form.register('settings.message')}
                  />
                  <FieldError errors={[errors.settings?.message]} />
                </Field>

                <Field data-invalid={!!errors.settings?.redirect}>
                  <FieldLabel htmlFor="redirect">Redirect URL</FieldLabel>
                  <Input
                    id="redirect"
                    type="url"
                    placeholder="https://example.com/thanks"
                    aria-invalid={!!errors.settings?.redirect}
                    {...form.register('settings.redirect')}
                  />
                  <FieldError errors={[errors.settings?.redirect]} />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Spam protection</FieldLegend>
              <FieldDescription>
                Every public submission is also checked for spam automatically.
              </FieldDescription>
              <FieldGroup>
                <Field data-invalid={!!domainsError}>
                  <FieldLabel htmlFor="domains">Allowed domains</FieldLabel>
                  <Controller
                    control={form.control}
                    name="settings.domains"
                    render={({ field }) => (
                      <DomainsInput
                        id="domains"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={!!domainsError}
                        describedBy="domains-help"
                        placeholder="example.com"
                      />
                    )}
                  />
                  <FieldDescription id="domains-help">
                    Hostnames allowed to submit, such as example.com, or *.example.com for its
                    subdomains. When the list isn&apos;t empty, submissions from other sites are
                    rejected. Press Enter after each one.
                  </FieldDescription>
                  <FieldError errors={[domainsError]} />
                </Field>

                <Field orientation="horizontal" data-invalid={!!errors.settings?.honeypot_enabled}>
                  <Controller
                    control={form.control}
                    name="settings.honeypot_enabled"
                    render={({ field }) => (
                      <Switch
                        id="honeypot-enabled"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-describedby="honeypot-help"
                      />
                    )}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="honeypot-enabled">Honeypot field</FieldLabel>
                    <FieldDescription id="honeypot-help">
                      Adds a hidden input that people leave empty. Bots that fill it in get a normal
                      response, but their entry is marked as spam.
                    </FieldDescription>
                    <FieldError errors={[errors.settings?.honeypot_enabled]} />
                  </FieldContent>
                </Field>

                {honeypotEnabled && (
                  <Field data-invalid={!!errors.settings?.honeypot_name}>
                    <FieldLabel htmlFor="honeypot-name">Honeypot input name</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="honeypot-name"
                        placeholder="Generated when you save"
                        className="font-mono"
                        aria-invalid={!!errors.settings?.honeypot_name}
                        aria-describedby="honeypot-name-help"
                        {...form.register('settings.honeypot_name')}
                      />
                      {honeypotName && (
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            size="icon-xs"
                            aria-label="Copy honeypot input name"
                            onClick={() => void copy(honeypotName, 'the honeypot input name')}
                          >
                            <Copy aria-hidden />
                          </InputGroupButton>
                        </InputGroupAddon>
                      )}
                    </InputGroup>
                    <FieldDescription id="honeypot-name-help">
                      Leave blank to have one generated. Your form&apos;s hidden input must use this
                      name.
                    </FieldDescription>
                    <FieldError errors={[errors.settings?.honeypot_name]} />
                  </Field>
                )}
              </FieldGroup>
            </FieldSet>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={!isDirty}>
                {save.isPending ? 'Saving…' : 'Save settings'}
              </Button>
              {isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    form.reset()
                    setFailure(undefined)
                  }}
                >
                  Discard changes
                </Button>
              )}
            </div>
          </FieldGroup>
        </fieldset>
      </form>

      <section
        aria-labelledby="delete-form-heading"
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
      >
        <h2 id="delete-form-heading" className="font-semibold text-destructive">
          Delete form
        </h2>
        <p className="text-sm text-muted-foreground">
          The form stops accepting submissions. Its entries and notification recipients are kept,
          and come back if you undo straight away.
        </p>
        <Button variant="destructive" onClick={() => void deleteForm()}>
          <Trash2 aria-hidden />
          Delete form
        </Button>
      </section>
    </div>
  )
}
