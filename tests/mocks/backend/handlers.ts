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
import { entryCounts, newEntry, refererAllowed, validateSubmission } from './entries'
import { MockBackendState } from './state'

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

        const trashed = new URL(request.url).searchParams.get('filter[trashed]')
        const entries = state
          .entriesOf(form.id)
          .filter((entry) =>
            trashed === 'with'
              ? true
              : trashed === 'only'
                ? entry.deleted_at !== null
                : entry.deleted_at === null,
          )
          .sort((a, b) => (a.id < b.id ? 1 : -1))

        return HttpResponse.json(paginate(request, entries, perPage))
      }),
    ),

    http.put(`${api}/entries/:entry`, async ({ request, params }) => {
      const entry = state.entries.get(String(params.entry).toLowerCase())

      if (!entry) return notFound()

      return withForm(request, entry.form_id, async () => {
        const body = await jsonBody(request)

        if ('read_at' in body) entry.read_at = (body.read_at as string | null) ?? null
        if ('spam' in body) entry.spam = (body.spam as boolean | null) ?? null
        if ('starred' in body) entry.starred = Boolean(body.starred)
        entry.updated_at = state.timestamp()

        return HttpResponse.json({ data: entry })
      })
    }),

    // Anything else under the API answers like the contract: 401 for guests, 404 otherwise.
    http.all(`${api}/*`, ({ request }) =>
      state.authenticate(bearer(request))
        ? HttpResponse.json({ message: 'Not found.' }, { status: 404 })
        : unauthenticated(),
    ),
  ]

  return { state, handlers }
}
