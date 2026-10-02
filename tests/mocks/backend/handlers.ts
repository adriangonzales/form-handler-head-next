import { http, HttpResponse, type RequestHandler } from 'msw'
import { MockBackendState } from './state'

// A mock of The Backend that follows docs/backend-contract.md, for `pnpm dev:mock` and for running
// the contract suite without the reference Backend. Endpoints are added as features need them.

const unauthenticated = () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })

const invalid = (errors: Record<string, string[]>) =>
  HttpResponse.json(
    { message: Object.values(errors)[0]?.[0] ?? 'The given data was invalid.', errors },
    { status: 422 },
  )

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
      if (!state.authenticate(bearer(request))) return unauthenticated()

      const perPage = perPageFrom(request)

      return perPage instanceof Response
        ? perPage
        : HttpResponse.json(paginate(request, [], perPage))
    }),

    http.post(`${api}/forms/:form/submissions`, () =>
      HttpResponse.json({ message: 'Not found.' }, { status: 404 }),
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
