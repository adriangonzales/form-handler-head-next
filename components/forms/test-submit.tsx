'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, CircleAlert, CircleCheck, CirclePause, ShieldAlert } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useHydrated } from '@/hooks/use-hydrated'
import { isFieldErrors } from '@/lib/backend/errors'
import { toFormErrors } from '@/lib/form-errors'
import { hostAllowed } from '@/lib/forms/settings'
import { queryKeys } from '@/lib/query-keys'
import { snippetFields, type SnippetField } from '@/lib/snippets'
import type { Form } from '@/types/models'

type Outcome =
  | { kind: 'success'; message: string | null; redirect: string | null; asBot: boolean }
  | { kind: 'error'; title: string; description?: string }

const samples: Record<string, string> = {
  name: 'Alex Morgan',
  full_name: 'Alex Morgan',
  first_name: 'Alex',
  last_name: 'Morgan',
  company: 'Morgan & Co',
  phone: '+1 555 0100',
  subject: 'Question about pricing',
}

/** A plausible value for a field, so the spam check doesn't flag the test as throwaway text. */
function sampleValue(field: SnippetField): string {
  switch (field.type) {
    case 'email':
      return 'alex.morgan@example.com'
    case 'url':
      return 'https://example.com'
    case 'number':
      return '3'
    case 'select':
      return field.options[0] ?? ''
    case 'textarea':
      return "Hi, I'd like to know more about your plans for a team of five. Could someone get in touch this week?"
    default:
      return samples[field.name.toLowerCase()] ?? 'Example'
  }
}

/**
 * A form generated from the schema that posts straight from this browser to the public endpoint,
 * without credentials, the way the user's own site will.
 */
export function TestSubmit({ form, endpoint }: { form: Form; endpoint: string }) {
  const hydrated = useHydrated()
  const queryClient = useQueryClient()
  const fields = snippetFields(form.schema)
  const honeypotName = form.settings?.honeypot_enabled ? form.settings.honeypot_name : null
  const [values, setValues] = useState<Record<string, string>>({})
  const [honeypotValue, setHoneypotValue] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [outcome, setOutcome] = useState<Outcome>()
  const [submitting, setSubmitting] = useState(false)

  // The Backend checks the `Referer`, which is this dashboard's host, against the allowed domains.
  const dashboardHost = hydrated ? window.location.hostname : undefined
  const blockedByDomains =
    dashboardHost !== undefined && !hostAllowed(dashboardHost, form.settings?.domains)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setOutcome(undefined)
    setFieldErrors({})

    const body: Record<string, string> = {}

    for (const field of fields) {
      if (values[field.name]) body[field.name] = values[field.name]!
    }

    if (honeypotName && honeypotValue) body[honeypotName] = honeypotValue

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'omit',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        setOutcome({
          kind: 'success',
          message: data.data?.message ?? null,
          redirect: data.data?.redirect ?? null,
          asBot: Boolean(honeypotName && body[honeypotName]),
        })
        void queryClient.invalidateQueries({ queryKey: queryKeys.entries.form(form.id) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.forms.lists() })
      } else if (response.status === 422) {
        const { fieldErrors: errors, otherMessages } = toFormErrors(
          isFieldErrors(data.errors) ? data.errors : {},
          fields.map((field) => field.name),
        )

        setFieldErrors(Object.fromEntries(errors.map(({ name, message }) => [name, message])))
        setOutcome({
          kind: 'error',
          title: 'The submission was rejected',
          description: otherMessages[0] ?? 'Check the highlighted fields.',
        })
      } else {
        setOutcome({
          kind: 'error',
          title:
            response.status === 429
              ? 'Too many submissions. Wait a minute and try again.'
              : typeof data.message === 'string'
                ? data.message
                : `The Backend answered ${response.status}.`,
        })
      }
    } catch {
      setOutcome({
        kind: 'error',
        title: "Couldn't reach The Backend",
        description: `Check that ${endpoint} is reachable from this browser.`,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const entriesHref = `/forms/${form.id}/entries` as Route
  const setValue = (name: string, value: string) =>
    setValues((current) => ({ ...current, [name]: value }))

  return (
    <div className="flex flex-col gap-4">
      {!form.active && (
        <Alert>
          <CirclePause aria-hidden />
          <AlertTitle>This form is inactive, so test submissions will be rejected.</AlertTitle>
        </Alert>
      )}

      {blockedByDomains && (
        <Alert>
          <ShieldAlert aria-hidden />
          <AlertTitle>
            {dashboardHost} isn&apos;t in this form&apos;s allowed domains, so The Backend will
            reject submissions from here.
          </AlertTitle>
          <AlertDescription>
            Add it to the allowed domains while you test, or clear the list.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/forms/${form.id}/settings` as Route}>Open settings</Link>
            </Button>
          </AlertAction>
        </Alert>
      )}

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This form has no fields, so a test submission sends nothing but is still stored with when
          and where it came from.
        </p>
      )}

      <form onSubmit={(event) => void submit(event)} noValidate aria-label="Test submission">
        <fieldset disabled={!hydrated || submitting}>
          <FieldGroup>
            {fields.map((field, index) => {
              const id = `test-${index}`
              const error = fieldErrors[field.name]
              const value = values[field.name] ?? ''

              return (
                <Field key={field.name} data-invalid={!!error}>
                  <FieldLabel htmlFor={id}>
                    {field.label}
                    {field.required && (
                      <span aria-hidden className="text-destructive">
                        *
                      </span>
                    )}
                  </FieldLabel>
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={id}
                      rows={3}
                      value={value}
                      aria-invalid={!!error}
                      aria-required={field.required}
                      onChange={(event) => setValue(field.name, event.target.value)}
                    />
                  ) : field.type === 'select' ? (
                    <Select value={value} onValueChange={(option) => setValue(field.name, option)}>
                      <SelectTrigger id={id} className="w-full" aria-invalid={!!error}>
                        <SelectValue placeholder="Choose…" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      type={field.type === 'number' ? 'text' : field.type}
                      inputMode={field.type === 'number' ? 'numeric' : undefined}
                      value={value}
                      aria-invalid={!!error}
                      aria-required={field.required}
                      onChange={(event) => setValue(field.name, event.target.value)}
                    />
                  )}
                  <FieldError>{error}</FieldError>
                </Field>
              )
            })}

            {honeypotName && (
              <Collapsible className="rounded-lg border">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="group w-full justify-start">
                    <Bot aria-hidden />
                    Simulate a bot
                    <ChevronDown
                      aria-hidden
                      className="ml-auto transition-transform group-data-[state=open]:rotate-180"
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 pt-0">
                  <Field>
                    <FieldLabel htmlFor="test-honeypot">
                      Hidden honeypot input “{honeypotName}”
                    </FieldLabel>
                    <Input
                      id="test-honeypot"
                      value={honeypotValue}
                      placeholder="I'm a bot"
                      aria-describedby="test-honeypot-help"
                      onChange={(event) => setHoneypotValue(event.target.value)}
                    />
                    <FieldDescription id="test-honeypot-help">
                      Real visitors never see this. Fill it in to see that a bot gets a normal
                      response, but its entry is marked as spam.
                    </FieldDescription>
                  </Field>
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit">{submitting ? 'Sending…' : 'Send test submission'}</Button>
              {fields.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setValues(
                      Object.fromEntries(fields.map((field) => [field.name, sampleValue(field)])),
                    )
                  }
                >
                  Fill with sample data
                </Button>
              )}
            </div>
          </FieldGroup>
        </fieldset>
      </form>

      <div aria-live="polite">
        {outcome?.kind === 'success' && (
          <Alert>
            <CircleCheck aria-hidden className="text-emerald-600" />
            <AlertTitle>Submission accepted</AlertTitle>
            <AlertDescription>
              {outcome.message && <p>Message shown to the submitter: “{outcome.message}”</p>}
              {outcome.redirect && (
                <p>
                  The submitter&apos;s page would then go to{' '}
                  <span className="font-mono">{outcome.redirect}</span>.
                </p>
              )}
              <p>
                {outcome.asBot
                  ? 'The honeypot was filled in, so this entry is stored as spam and no alert is sent.'
                  : "This created a real entry. It's checked for spam first, so throwaway text may land in Spam, and alerts go out once the check finishes."}
              </p>
              <p className="mt-2 flex gap-3">
                <Link href={entriesHref} className="text-primary hover:underline">
                  View in Inbox
                </Link>
                <Link
                  href={`${entriesHref}?status=spam` as Route}
                  className="text-primary hover:underline"
                >
                  View Spam
                </Link>
              </p>
            </AlertDescription>
          </Alert>
        )}

        {outcome?.kind === 'error' && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>{outcome.title}</AlertTitle>
            {outcome.description && <AlertDescription>{outcome.description}</AlertDescription>}
          </Alert>
        )}
      </div>
    </div>
  )
}
