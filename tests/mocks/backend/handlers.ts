import { http, HttpResponse, type RequestHandler } from 'msw'
import {
  checkHoneypot,
  formListItem,
  formResource,
  formSorts,
  type MockForm,
  newFormId,
  sortForms,
  validateSchema,
  validateSettings,
} from './forms'
import {
  applyBulkAction,
  bulkActions,
  entryCounts,
  newEntry,
  queryEntries,
  refererAllowed,
  validateEntryUpdate,
  validateSubmission,
} from './entries'
import {
  advanceExport,
  exportParameters,
  exportResource,
  type MockExport,
  newExport,
  validateExportParameters,
  validSignature,
} from './exports'
import { newNotification, validateNotification } from './notifications'
import { MockBackendState } from './state'
import type { FormEntry, FormNotification } from '../../../types/models'

// A mock of The Backend that follows docs/backend-contract.md, for `pnpm dev:mock` and for running
// the contract suite without the reference Backend. Endpoints are added as features need them.

const unauthenticated = () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })

const invalid = (errors: Record<string, string[]>) =>
  HttpResponse.json(
    { message: Object.values(errors)[0]?.[0] ?? 'The given data was invalid.', errors },
    { status: 422 },
  )

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'content-type, accept',
}

const isBlankValue = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

const notFound = () => HttpResponse.json({ message: 'Not found.' }, { status: 404 })

const forbidden = () =>
  HttpResponse.json({ message: 'This action is unauthorized.' }, { status: 403 })

function add(errors: Record<string, string[]>, key: string, message: string) {
  ;(errors[key] ??= []).push(message)
}

function checkName(name: unknown, errors: Record<string, string[]>) {
  if (typeof name !== 'string' || name.trim() === '') {
    add(errors, 'name', 'The name field is required.')
  } else if (name.length > 400) {
    add(errors, 'name', 'The name field must not be greater than 400 characters.')
  }
}

function bearer(request: Request): string | undefined {
  return request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => ({}))

  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

/** The contract's pagination envelope for one page of `items`. */
function paginate<T>(request: Request, items: T[], perPage: number) {
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const lastPage = Math.max(1, Math.ceil(items.length / perPage))
  const data = items.slice((page - 1) * perPage, page * perPage)
  const pageUrl = (n: number) => {
    const link = new URL(url)

    link.searchParams.delete('page')
    link.searchParams.append('page', String(n))

    return link.toString()
  }
  const from = data.length > 0 ? (page - 1) * perPage + 1 : null

  return {
    data,
    links: {
      first: pageUrl(1),
      last: pageUrl(lastPage),
      prev: page > 1 ? pageUrl(page - 1) : null,
      next: page < lastPage ? pageUrl(page + 1) : null,
    },
    meta: {
      current_page: page,
      from,
      last_page: lastPage,
      links: [],
      path: `${url.origin}${url.pathname}`,
      per_page: perPage,
      to: from === null ? null : from + data.length - 1,
      total: items.length,
    },
  }
}

function perPageFrom(request: Request): number | Response {
  const value = new URL(request.url).searchParams.get('per_page')

  if (value === null) return 15

  const perPage = Number(value)

  return Number.isInteger(perPage) && perPage >= 1 && perPage <= 100
    ? perPage
    : invalid({ per_page: ['The per page field must be between 1 and 100.'] })
}

export interface MockBackend {
  state: MockBackendState
  handlers: RequestHandler[]
}

export function createMockBackend(options: {
  /** The API base, e.g. `http://127.0.0.1:8010/api`. */
  apiUrl: string
  /** Served at `{origin}/docs/api.json`. */
  spec?: unknown
  state?: MockBackendState
}): MockBackend {
  const api = `${options.apiUrl.replace(/\/+$/, '')}/v1`
  const origin = new URL(options.apiUrl).origin
  const state =
    options.state ??
    new MockBackendState({ tokenTtlSeconds: 3600, refreshWindowSeconds: 604_800, now: Date.now })

  /**
   * Runs `handle` for the signed-in user's form: 401 for guests, 404 for unknown (or, unless
   * `withTrashed`, deleted) forms, and 403 for someone else's.
   */
  function withForm(
    request: Request,
    id: unknown,
    handle: (form: MockForm) => Response | Promise<Response>,
    options: { withTrashed?: boolean } = {},
  ) {
    const user = state.authenticate(bearer(request))

    if (!user) return unauthenticated()

    const form = state.forms.get(String(id).toLowerCase())

    if (!form || (form.deleted_at !== null && !options.withTrashed)) return notFound()
    if (form.user_id !== user.id) return forbidden()

    return handle(form)
  }

  /**
   * Runs `handle` for an entry on one of the signed-in user's forms: 401 for guests, 404 for
   * unknown (or, unless `withTrashed`, deleted) entries, and 403 for someone else's entries or
   * entries of a deleted form.
   */
  function withEntry(
    request: Request,
    id: unknown,
    handle: (entry: FormEntry) => Response | Promise<Response>,
    options: { withTrashed?: boolean } = {},
  ) {
    const user = state.authenticate(bearer(request))

    if (!user) return unauthenticated()

    const entry = state.entries.get(String(id).toLowerCase())

    if (!entry || (entry.deleted_at !== null && !options.withTrashed)) return notFound()

    const form = state.forms.get(entry.form_id)

    if (!form || form.user_id !== user.id || form.deleted_at !== null) return forbidden()

    return handle(entry)
  }

  /**
   * Runs `handle` for a recipient on one of the signed-in user's forms: 401 for guests, 404 for
   * unknown (or, unless `withTrashed`, deleted) recipients, and 403 for someone else's or those
   * of a deleted form.
   */
  function withNotification(
    request: Request,
    id: unknown,
    handle: (notification: FormNotification) => Response | Promise<Response>,
    options: { withTrashed?: boolean } = {},
  ) {
    const user = state.authenticate(bearer(request))

    if (!user) return unauthenticated()

    const notification = state.notifications.get(String(id).toLowerCase())

    if (!notification || (notification.deleted_at !== null && !options.withTrashed)) {
      return notFound()
    }

    const form = state.forms.get(notification.form_id)

    if (!form || form.user_id !== user.id || form.deleted_at !== null) {
      return HttpResponse.json({ message: 'You do not own this form.' }, { status: 403 })
    }

    return handle(notification)
  }

  const at = (ms?: number) => state.timestamp(ms)

  /** Brings an export up to date with the time, and returns it as the resource. */
  function exportOut(entryExport: MockExport) {
    const now = state.options.now()

    advanceExport(
      entryExport,
      state.forms.get(entryExport.form_id),
      () => state.entriesOf(entryExport.form_id),
      at,
      now,
    )

    return exportResource(entryExport, {
      apiUrl: options.apiUrl,
      secret: state.signingSecret,
      now,
    })
  }

  /**
   * Runs `handle` for an export of one of the signed-in user's forms: 401 for guests, 404 for
   * unknown exports, and 403 for someone else's or those of a deleted form.
   */
  function withExport(
    request: Request,
    id: unknown,
    handle: (entryExport: MockExport) => Response | Promise<Response>,
  ) {
    const user = state.authenticate(bearer(request))

    if (!user) return unauthenticated()

    const entryExport = state.exports.get(String(id).toLowerCase())

    if (!entryExport) return notFound()

    const form = state.forms.get(entryExport.form_id)

    if (!form || form.user_id !== user.id || form.deleted_at !== null) {
      return HttpResponse.json({ message: 'You do not own this form.' }, { status: 403 })
    }

    return handle(entryExport)
  }

  const handlers: RequestHandler[] = [
    // Mock-only: creates a user, standing in for a backend's own provisioning (E2E_CREATE_USER_CMD).
    http.post(`${origin}/__mock/users`, async ({ request }) => {
      const body = await jsonBody(request)

      try {
        return HttpResponse.json(
          {
            data: state.createUser({
              name: String(body.name ?? ''),
              email: String(body.email ?? ''),
              password: String(body.password ?? ''),
            }),
          },
          { status: 201 },
        )
      } catch (error) {
        return HttpResponse.json({ message: (error as Error).message }, { status: 409 })
      }
    }),

    // Mock-only: records a bounce, standing in for a mail provider's webhook, so delivery problems
    // can be seen in `pnpm dev:mock`.
    http.post(
      `${origin}/__mock/notifications/:notification/bounce`,
      async ({ request, params }) => {
        const notification = state.notifications.get(String(params.notification).toLowerCase())

        if (!notification) return notFound()

        const body = await jsonBody(request)

        notification.error =
          typeof body.message === 'string'
            ? body.message.slice(0, 255)
            : 'Bounced (HardBounce): The server was unable to deliver your message.'

        return HttpResponse.json({ data: notification })
      },
    ),

    // Mock-only: the alerts sent so far, standing in for a mail catcher.
    http.get(`${origin}/__mock/alerts`, () => HttpResponse.json({ data: state.alerts })),

    http.get(`${origin}/docs/api.json`, () =>
      options.spec ? HttpResponse.json(options.spec) : new HttpResponse(null, { status: 404 }),
    ),

    http.post(`${api}/auth/login`, async ({ request }) => {
      const body = await jsonBody(request)
      const user = state.findUserByEmail(String(body.email ?? ''))

      if (!user || !state.checkPassword(user.id, String(body.password ?? ''))) {
        return invalid({ email: ['These credentials do not match our records.'] })
      }

      return HttpResponse.json(state.issueToken(user.id))
    }),

    http.post(`${api}/auth/refresh`, ({ request }) => {
      const tokens = state.refresh(bearer(request))

      return tokens ? HttpResponse.json(tokens) : unauthenticated()
    }),

    http.post(`${api}/auth/logout`, ({ request }) => {
      if (!state.authenticate(bearer(request))) return unauthenticated()

      state.revoke(bearer(request))

      return new HttpResponse(null, { status: 204 })
    }),

    http.get(`${api}/auth/me`, ({ request }) => {
      const user = state.authenticate(bearer(request))

      return user ? HttpResponse.json({ data: user }) : unauthenticated()
    }),

    http.delete(`${api}/auth/me`, ({ request }) => {
      const user = state.authenticate(bearer(request))

      if (!user) return unauthenticated()

      const password = new URL(request.url).searchParams.get('password') ?? ''

      if (!state.checkPassword(user.id, password)) {
        return invalid({ password: ['The password is incorrect.'] })
      }

      state.deleteUser(user.id)

      return new HttpResponse(null, { status: 204 })
    }),

    http.post(`${api}/auth/forgot-password`, () =>
      HttpResponse.json({
        message: 'If an account exists for that email, a password reset link has been sent.',
      }),
    ),

    // The mock sends no emails, so no reset token is ever valid.
    http.post(`${api}/auth/reset-password`, () =>
      invalid({ email: ['This password reset token is invalid.'] }),
    ),

    http.get(`${api}/forms`, ({ request }) => {
      const user = state.authenticate(bearer(request))

      if (!user) return unauthenticated()

      const perPage = perPageFrom(request)

      if (perPage instanceof Response) return perPage

      const params = new URL(request.url).searchParams
      const sort = params.get('sort') ?? '-updated_at'
      const active = params.get('filter[active]')

      if (!formSorts.includes(sort)) return invalid({ sort: ['The selected sort is invalid.'] })
      if (active !== null && !['true', 'false', '1', '0'].includes(active)) {
        return invalid({ 'filter.active': ['The selected filter.active is invalid.'] })
      }

      const forms = [...state.forms.values()].filter(
        (form) =>
          form.user_id === user.id &&
          form.deleted_at === null &&
          (active === null || form.active === (active === 'true' || active === '1')),
      )

      return HttpResponse.json(
        paginate(
          request,
          sortForms(forms, sort).map((form) =>
            formListItem(form, entryCounts(state.entriesOf(form.id))),
          ),
          perPage,
        ),
      )
    }),

    http.post(`${api}/forms`, async ({ request }) => {
      const user = state.authenticate(bearer(request))

      if (!user) return unauthenticated()

      const body = await jsonBody(request)
      const errors: Record<string, string[]> = {}

      checkName(body.name, errors)

      const schema = validateSchema(body.schema, errors)
      const settings = validateSettings(body.settings, errors)

      checkHoneypot(settings, schema, null, body.settings !== undefined, errors)

      if (Object.keys(errors).length > 0) return invalid(errors)

      const at = state.timestamp()
      const form: MockForm = {
        id: newFormId(),
        user_id: user.id,
        name: body.name as string,
        active: false,
        schema,
        settings,
        created_at: at,
        updated_at: at,
        deleted_at: null,
      }

      state.forms.set(form.id, form)

      return HttpResponse.json({ data: formResource(form) }, { status: 201 })
    }),

    http.get(`${api}/forms/:form`, ({ request, params }) =>
      withForm(request, params.form, (form) => HttpResponse.json({ data: formResource(form) })),
    ),

    http.put(`${api}/forms/:form`, ({ request, params }) =>
      withForm(request, params.form, async (form) => {
        const body = await jsonBody(request)
        const errors: Record<string, string[]> = {}

        checkName(body.name, errors)

        if (typeof body.active !== 'boolean') {
          add(errors, 'active', 'The active field is required and must be true or false.')
        }

        const schema = 'schema' in body ? validateSchema(body.schema, errors) : form.schema
        const settings =
          'settings' in body ? validateSettings(body.settings, errors) : form.settings

        checkHoneypot(settings, schema, form.settings, 'settings' in body, errors)

        if (Object.keys(errors).length > 0) return invalid(errors)

        Object.assign(form, {
          name: body.name,
          active: body.active,
          schema,
          settings,
          updated_at: state.timestamp(),
        })

        return HttpResponse.json({ data: formResource(form) })
      }),
    ),

    http.delete(`${api}/forms/:form`, ({ request, params }) =>
      withForm(request, params.form, (form) => {
        form.deleted_at = state.timestamp()

        return new HttpResponse(null, { status: 204 })
      }),
    ),

    http.post(`${api}/forms/:form/restore`, ({ request, params }) =>
      withForm(
        request,
        params.form,
        (form) => {
          form.deleted_at = null

          return HttpResponse.json({ data: formResource(form) })
        },
        { withTrashed: true },
      ),
    ),

    http.post(`${api}/forms/:form/duplicate`, ({ request, params }) =>
      withForm(request, params.form, (form) => {
        const at = state.timestamp()
        const copy: MockForm = {
          ...structuredClone(form),
          id: newFormId(),
          name: `${form.name.slice(0, 393)} (copy)`,
          active: false,
          created_at: at,
          updated_at: at,
        }

        state.forms.set(copy.id, copy)

        return HttpResponse.json({ data: formResource(copy) }, { status: 201 })
      }),
    ),

    // Public submissions: no auth, and CORS from any origin without credentials.
    http.options(
      `${api}/forms/:form/submissions`,
      () => new HttpResponse(null, { status: 204, headers: cors }),
    ),

    http.post(`${api}/forms/:form/submissions`, async ({ request, params }) => {
      const form = state.forms.get(String(params.form).toLowerCase())
      const respond = (body: Parameters<typeof HttpResponse.json>[0], status: number) =>
        HttpResponse.json(body, { status, headers: cors })

      if (!form || form.deleted_at !== null) return respond({ message: 'Not found.' }, 404)
      if (!form.active) return respond({ message: 'This action is unauthorized.' }, 403)
      if (!refererAllowed(request.headers.get('referer'), form.settings?.domains ?? null)) {
        return respond({ message: 'Submissions are not accepted from this domain.' }, 403)
      }

      const body = await jsonBody(request)
      const errors: Record<string, string[]> = {}
      const input = validateSubmission(form.schema, body, errors)

      if (Object.keys(errors).length > 0) {
        return respond({ message: Object.values(errors)[0]![0], errors }, 422)
      }

      const honeypot = form.settings?.honeypot_enabled ? form.settings.honeypot_name : null
      const entry = newEntry(form, input, request, {
        at: state.timestamp(),
        honeypotTripped: Boolean(honeypot && !isBlankValue(body[honeypot])),
      })

      state.entries.set(entry.id, entry)
      state.sendAlerts(entry)

      return respond(
        {
          data: {
            redirect: form.settings?.redirect ?? null,
            message: form.settings?.message ?? null,
          },
        },
        201,
      )
    }),

    http.get(`${api}/forms/:form/entries`, ({ request, params }) =>
      withForm(request, params.form, (form) => {
        const perPage = perPageFrom(request)

        if (perPage instanceof Response) return perPage

        const entries = queryEntries(state.entriesOf(form.id), new URL(request.url).searchParams)

        return Array.isArray(entries)
          ? HttpResponse.json(paginate(request, entries, perPage))
          : invalid(entries)
      }),
    ),

    // Adds an entry as the form's owner: validated like a submission, and not spam-checked.
    http.post(`${api}/forms/:form/entries`, ({ request, params }) =>
      withForm(request, params.form, async (form) => {
        if (!form.active) return forbidden()

        const errors: Record<string, string[]> = {}
        const input = validateSubmission(form.schema, await jsonBody(request), errors)

        if (Object.keys(errors).length > 0) return invalid(errors)

        const entry = newEntry(form, input, request, {
          at: state.timestamp(),
          honeypotTripped: false,
        })

        entry.spam = false
        state.entries.set(entry.id, entry)

        return HttpResponse.json({ data: entry }, { status: 201 })
      }),
    ),

    http.post(`${api}/forms/:form/entries/bulk`, ({ request, params }) =>
      withForm(request, params.form, async (form) => {
        const body = await jsonBody(request)
        const action = String(body.action ?? '')
        const ids = Array.isArray(body.ids) ? body.ids : []
        const forDeleted = bulkActions.forDeletedEntries.includes(action)
        const errors: Record<string, string[]> = {}

        if (![...bulkActions.forEntries, ...bulkActions.forDeletedEntries].includes(action)) {
          errors.action = ['The selected action is invalid.']
        }

        if (ids.length < 1 || ids.length > 100) {
          errors.ids = ['The ids field must have between 1 and 100 items.']
        }

        const entries = ids.flatMap((id: unknown, index: number) => {
          const entry = state.entries.get(String(id).toLowerCase())

          if (!entry || entry.form_id !== form.id || (entry.deleted_at !== null) !== forDeleted) {
            errors[`ids.${index}`] = [`The selected ids.${index} is invalid.`]

            return []
          }

          return [entry]
        })

        if (Object.keys(errors).length > 0) return invalid(errors)

        const affected = applyBulkAction(entries, action, state.timestamp(), (entry) =>
          state.entries.delete(entry.id),
        )

        return HttpResponse.json({ data: { action, affected } })
      }),
    ),

    http.get(`${api}/entries/:entry`, ({ request, params }) =>
      withEntry(request, params.entry, (entry) => HttpResponse.json({ data: entry })),
    ),

    http.put(`${api}/entries/:entry`, ({ request, params }) =>
      withEntry(request, params.entry, async (entry) => {
        const body = await jsonBody(request)
        const errors = validateEntryUpdate(body)

        if (Object.keys(errors).length > 0) return invalid(errors)

        for (const key of ['spam', 'spam_score', 'spam_reason', 'starred', 'read_at'] as const) {
          if (key in body) Object.assign(entry, { [key]: body[key] })
        }

        entry.updated_at = state.timestamp()

        return HttpResponse.json({ data: entry })
      }),
    ),

    http.delete(`${api}/entries/:entry`, ({ request, params }) =>
      withEntry(request, params.entry, (entry) => {
        entry.deleted_at = state.timestamp()

        return new HttpResponse(null, { status: 204 })
      }),
    ),

    http.post(`${api}/entries/:entry/restore`, ({ request, params }) =>
      withEntry(
        request,
        params.entry,
        (entry) => {
          entry.deleted_at = null

          return HttpResponse.json({ data: entry })
        },
        { withTrashed: true },
      ),
    ),

    // Only entries already in Trash can be deleted for good.
    http.delete(`${api}/entries/:entry/force`, ({ request, params }) =>
      withEntry(
        request,
        params.entry,
        (entry) => {
          if (entry.deleted_at === null) {
            return HttpResponse.json(
              { message: 'Only deleted entries can be permanently deleted.' },
              { status: 409 },
            )
          }

          state.entries.delete(entry.id)

          return new HttpResponse(null, { status: 204 })
        },
        { withTrashed: true },
      ),
    ),

    // Exports: 202 with `Location`; the file is written in the background (see exportSteps).
    http.post(`${api}/forms/:form/entries/exports`, ({ request, params }) =>
      withForm(request, params.form, async (form) => {
        const parameters = exportParameters(await jsonBody(request))
        const errors = validateExportParameters(parameters)

        if (Object.keys(errors).length > 0) return invalid(errors)

        const entryExport = newExport(form, parameters, at, state.options.now())

        state.exports.set(entryExport.id, entryExport)

        return HttpResponse.json(
          { data: exportOut(entryExport) },
          { status: 202, headers: { Location: `${api}/entry-exports/${entryExport.id}` } },
        )
      }),
    ),

    // Newest first, leaving out expired exports and those of deleted forms.
    http.get(`${api}/entry-exports`, ({ request }) => {
      const user = state.authenticate(bearer(request))

      if (!user) return unauthenticated()

      const perPage = perPageFrom(request)

      if (perPage instanceof Response) return perPage

      const now = state.options.now()
      const exports = [...state.exports.values()]
        .filter((entryExport) => {
          const form = state.forms.get(entryExport.form_id)

          return (
            form?.user_id === user.id &&
            form.deleted_at === null &&
            Date.parse(entryExport.expires_at) > now
          )
        })
        .sort(
          (a, b) =>
            Date.parse(b.created_at!) - Date.parse(a.created_at!) || b.id.localeCompare(a.id),
        )

      return HttpResponse.json(paginate(request, exports.map(exportOut), perPage))
    }),

    http.get(`${api}/entry-exports/:export/download`, ({ request, params }) => {
      const entryExport = state.exports.get(String(params.export).toLowerCase())
      const now = state.options.now()

      if (!validSignature(state.signingSecret, new URL(request.url), now)) {
        return HttpResponse.json({ message: 'Invalid signature.' }, { status: 403 })
      }

      if (!entryExport) return notFound()

      exportOut(entryExport)

      if (Date.parse(entryExport.expires_at) <= now) {
        return HttpResponse.json({ message: 'This export has expired.' }, { status: 410 })
      }

      if (entryExport.status !== 'completed' || entryExport.csv === null) {
        return HttpResponse.json({ message: 'This export is not ready.' }, { status: 409 })
      }

      return new HttpResponse(entryExport.csv, {
        headers: {
          'Content-Type': 'text/csv; charset=UTF-8',
          'Content-Disposition': `attachment; filename=${entryExport.filename}`,
        },
      })
    }),

    http.get(`${api}/entry-exports/:export`, ({ request, params }) =>
      withExport(request, params.export, (entryExport) =>
        HttpResponse.json({ data: exportOut(entryExport) }),
      ),
    ),

    // Notifications: a form's alert recipients. The list is fixed at 15 per page.
    http.get(`${api}/forms/:form/notifications`, ({ request, params }) =>
      withForm(request, params.form, (form) =>
        HttpResponse.json(paginate(request, state.notificationsOf(form.id), 15)),
      ),
    ),

    http.post(`${api}/forms/:form/notifications`, ({ request, params }) =>
      withForm(request, params.form, async (form) => {
        const body = await jsonBody(request)
        const errors = validateNotification(body, 'create')

        if (Object.keys(errors).length > 0) return invalid(errors)

        const notification = newNotification(
          form.id,
          body as { type: string; value: string; enabled?: unknown },
          state.timestamp(),
        )

        state.notifications.set(notification.id, notification)

        return HttpResponse.json({ data: notification }, { status: 201 })
      }),
    ),

    http.get(`${api}/notifications/:notification`, ({ request, params }) =>
      withNotification(request, params.notification, (notification) =>
        HttpResponse.json({ data: notification }),
      ),
    ),

    http.put(`${api}/notifications/:notification`, ({ request, params }) =>
      withNotification(request, params.notification, async (notification) => {
        const body = await jsonBody(request)
        const errors = validateNotification(body, 'update')

        if (Object.keys(errors).length > 0) return invalid(errors)

        Object.assign(notification, {
          type: body.type,
          value: body.value,
          enabled: body.enabled,
          updated_at: state.timestamp(),
        })

        return HttpResponse.json({ data: notification })
      }),
    ),

    http.delete(`${api}/notifications/:notification`, ({ request, params }) =>
      withNotification(request, params.notification, (notification) => {
        notification.deleted_at = state.timestamp()

        return new HttpResponse(null, { status: 204 })
      }),
    ),

    http.post(`${api}/notifications/:notification/restore`, ({ request, params }) =>
      withNotification(
        request,
        params.notification,
        (notification) => {
          notification.deleted_at = null

          return HttpResponse.json({ data: notification })
        },
        { withTrashed: true },
      ),
    ),

    // Anything else under the API answers like the contract: 401 for guests, 404 otherwise.
    http.all(`${api}/*`, ({ request }) =>
      state.authenticate(bearer(request))
        ? HttpResponse.json({ message: 'Not found.' }, { status: 404 })
        : unauthenticated(),
    ),
  ]

  return { state, handlers }
}
