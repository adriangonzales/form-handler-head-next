import type { FormSchema } from '@/types/models'
import { orderedFields, parseRules } from '@/lib/schema/builder'

/** One input in a generated form, worked out from a schema field. */
export interface SnippetField {
  name: string
  label: string
  type: 'text' | 'email' | 'url' | 'number' | 'textarea' | 'select'
  required: boolean
  options: string[]
}

export function snippetFields(schema: FormSchema | null | undefined): SnippetField[] {
  return orderedFields(schema).map((field) => {
    const rules = parseRules(field.rules)
    const max = Number(rules.max)

    return {
      name: field.name || field.id,
      label: field.label || field.id,
      type:
        rules.oneOf.length > 0
          ? 'select'
          : rules.email
            ? 'email'
            : rules.url
              ? 'url'
              : rules.numeric
                ? 'number'
                : max > 255
                  ? 'textarea'
                  : 'text',
      required: rules.required,
      options: rules.oneOf,
    }
  })
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Ids for generated inputs: a safe, unique `fh-…` slug per field. */
function inputId(name: string, index: number) {
  return `fh-${index + 1}-${name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`
}

function fieldHtml(field: SnippetField, index: number): string {
  const id = inputId(field.name, index)
  const attrs = `id="${id}" name="${escapeHtml(field.name)}"${field.required ? ' required' : ''}`
  const label = `    <label for="${id}">${escapeHtml(field.label)}</label>`

  if (field.type === 'textarea') {
    return `${label}\n    <textarea ${attrs} rows="5"></textarea>`
  }

  if (field.type === 'select') {
    const options = [
      ...(field.required ? [] : ['      <option value=""></option>']),
      ...field.options.map(
        (option) => `      <option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`,
      ),
    ]

    return `${label}\n    <select ${attrs}>\n${options.join('\n')}\n    </select>`
  }

  return `${label}\n    <input ${attrs} type="${field.type}">`
}

function honeypotHtml(name: string): string {
  return [
    '  <!-- Leave this hidden input empty: bots that fill it in are marked as spam. -->',
    '  <div style="position: absolute; left: -9999px" aria-hidden="true">',
    `    <input name="${escapeHtml(name)}" type="text" tabindex="-1" autocomplete="off">`,
    '  </div>',
  ].join('\n')
}

export function formHtml(options: {
  endpoint: string
  fields: readonly SnippetField[]
  honeypotName?: string | null
  formId?: string
}): string {
  const id = options.formId ? ` id="${escapeHtml(options.formId)}"` : ''
  const parts = options.fields.map((field, index) => `  <p>\n${fieldHtml(field, index)}\n  </p>`)

  if (options.honeypotName) {
    parts.push(honeypotHtml(options.honeypotName))
  }

  parts.push('  <button type="submit">Send</button>')

  return `<form${id} method="post" action="${escapeHtml(options.endpoint)}">\n${parts.join('\n')}\n</form>`
}

/** Embeds a value in a `<script>` safely: JSON, with `<` escaped so `</script>` can't close it. */
export function scriptLiteral(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

export function formScript(formId: string): string {
  return `<p id="${formId}-status" role="status"></p>
<script>
  const form = document.getElementById(${scriptLiteral(formId)})
  const status = document.getElementById(${scriptLiteral(`${formId}-status`)})

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    form.querySelectorAll('[data-fh-error]').forEach((error) => error.remove())
    status.textContent = ''

    let response
    let body = {}

    try {
      response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      })
      body = await response.json().catch(() => ({}))
    } catch {
      status.textContent = 'Could not send the form. Check your connection and try again.'
      return
    }

    if (response.ok) {
      if (body.data.redirect) {
        window.location.href = body.data.redirect
        return
      }

      form.reset()
      status.textContent = body.data.message || 'Thanks! Your message was sent.'
      return
    }

    if (response.status === 422) {
      for (const [name, messages] of Object.entries(body.errors || {})) {
        const input = form.elements.namedItem(name)

        if (input) {
          const error = document.createElement('p')
          error.dataset.fhError = ''
          error.textContent = messages[0]
          input.after(error)
        }
      }
      return
    }

    status.textContent =
      response.status === 429
        ? 'Too many submissions. Please wait a minute and try again.'
        : body.message || 'Something went wrong. Please try again.'
  })
</script>`
}
