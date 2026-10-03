'use client'

import { useQuery } from '@tanstack/react-query'
import { CirclePause, Copy, ListPlus, Play } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { CodeBlock } from '@/components/shared/code-block'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCopy } from '@/hooks/use-copy'
import { useFormActions } from '@/hooks/use-form-actions'
import { formQuery } from '@/lib/forms/queries'
import { backendPublicUrl } from '@/lib/public-env'
import { formHtml, formScript, snippetFields } from '@/lib/snippets'
import { TestSubmit } from './test-submit'

const snippetFormId = 'contact-form'

/** The Integrate tab: the submission endpoint, snippets for the user's site, and a test form. */
export function IntegratePanel({ formId }: { formId: string }) {
  const { data: form } = useQuery(formQuery(formId))
  const { setActive } = useFormActions()
  const copy = useCopy()

  if (!form) return null

  const endpoint = `${backendPublicUrl}/v1/forms/${form.id}/submissions`
  const fields = snippetFields(form.schema)
  const honeypotName = form.settings?.honeypot_enabled ? form.settings.honeypot_name : null
  const htmlSnippet = formHtml({ endpoint, fields, honeypotName })
  const scriptSnippet = `${formHtml({ endpoint, fields, honeypotName, formId: snippetFormId })}\n${formScript(snippetFormId)}`
  const fieldsHref = `/forms/${form.id}/fields` as Route

  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <section aria-labelledby="endpoint-heading" className="flex flex-col gap-3">
        <h2 id="endpoint-heading" className="font-semibold">
          Submission endpoint
        </h2>

        {!form.active && (
          <Alert>
            <CirclePause aria-hidden />
            <AlertTitle>This form is inactive</AlertTitle>
            <AlertDescription>Submissions are rejected until you turn it on.</AlertDescription>
            <AlertAction>
              <Button
                size="sm"
                disabled={setActive.isPending}
                onClick={() => setActive.mutate({ form, active: true })}
              >
                <Play aria-hidden />
                Turn on
              </Button>
            </AlertAction>
          </Alert>
        )}

        <InputGroup>
          <InputGroupInput
            value={endpoint}
            readOnly
            className="font-mono"
            aria-label="Submission endpoint"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Copy submission endpoint"
              onClick={() => void copy(endpoint, 'the submission endpoint')}
            >
              <Copy aria-hidden />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-sm text-muted-foreground">
          Post the form&apos;s fields to this URL. Anyone can submit, so The Backend checks allowed
          domains, rate limits and spam.
        </p>
      </section>

      <section aria-labelledby="snippet-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="snippet-heading" className="font-semibold">
            Add it to your site
          </h2>
          <p className="text-sm text-muted-foreground">
            Generated from this form&apos;s{' '}
            <Link href={fieldsHref} className="text-primary hover:underline">
              fields
            </Link>
            {honeypotName && ' and its honeypot'}.
          </p>
        </div>

        {fields.length === 0 && (
          <Alert>
            <ListPlus aria-hidden />
            <AlertTitle>Add fields first</AlertTitle>
            <AlertDescription>
              The snippet only has a submit button until the form has fields.
            </AlertDescription>
            <AlertAction>
              <Button variant="outline" size="sm" asChild>
                <Link href={fieldsHref}>Edit fields</Link>
              </Button>
            </AlertAction>
          </Alert>
        )}

        <Tabs defaultValue="script">
          <TabsList variant="line" aria-label="Snippet">
            <TabsTrigger value="script">HTML + JavaScript (recommended)</TabsTrigger>
            <TabsTrigger value="html">Plain HTML</TabsTrigger>
          </TabsList>
          <TabsContent value="script" className="flex flex-col gap-2 pt-2">
            <CodeBlock code={scriptSnippet} label="the HTML and JavaScript snippet" />
            <p className="text-muted-foreground">
              Sends the form as JSON, then shows the success message or goes to the redirect URL,
              and puts validation errors next to their inputs.
            </p>
          </TabsContent>
          <TabsContent value="html" className="flex flex-col gap-2 pt-2">
            <CodeBlock code={htmlSnippet} label="the HTML snippet" />
            <p className="text-muted-foreground">
              The Backend always answers with JSON and never redirects, so with plain HTML the
              visitor sees that JSON after submitting. Use the JavaScript version for a proper
              thank-you message.
            </p>
          </TabsContent>
        </Tabs>
      </section>

      <section aria-labelledby="test-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="test-heading" className="font-semibold">
            Test submission
          </h2>
          <p className="text-sm text-muted-foreground">
            Sends a real submission from this browser to the endpoint above, without signing in, the
            same way your site will.
          </p>
        </div>
        <TestSubmit form={form} endpoint={endpoint} />
      </section>
    </div>
  )
}
