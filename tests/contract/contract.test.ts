// Checks The Backend's conventions from docs/backend-contract.md against BACKEND_API_URL. Any
// backend this dashboard is pointed at should pass. Run with `pnpm test:contract`.
//
// Error bodies are matched loosely: a backend may add keys (a debug trace, say) beside `message`.
//
// The public checks use made-up IDs and addresses, so they change nothing. The auth checks create a
// throwaway user (E2E_CREATE_USER_CMD) and delete it through the API at the end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { specUrlFrom } from '../../scripts/spec-url.mjs'
import { backendApiUrl } from '../support/env'
import { type Account, canCreateUsers, createThrowawayUser } from '../support/throwaway-user'

const base = backendApiUrl()

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, headers, ...rest } = init
  const response = await fetch(`${base}${path}`, {
    redirect: 'manual',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })
  const text = await response.text()

  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  }
}

const madeUpUlid = '01k0000000000000000000000z'
const madeUpEmail = () => `contract-${Date.now().toString(36)}@example.invalid`

describe('OpenAPI spec', () => {
  it('is served as OpenAPI 3.1 with every endpoint the dashboard uses', async () => {
    const specUrl = specUrlFrom({ ...process.env, BACKEND_API_URL: base })
    const spec = await (await fetch(specUrl!)).json()

    expect(spec.openapi).toMatch(/^3\.1\./)
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/login',
        '/v1/auth/refresh',
        '/v1/auth/logout',
        '/v1/auth/me',
        '/v1/auth/password',
        '/v1/auth/forgot-password',
        '/v1/auth/reset-password',
        '/v1/forms',
        '/v1/forms/{form}',
        '/v1/forms/{form}/restore',
        '/v1/forms/{form}/duplicate',
        '/v1/forms/{form}/entries',
        '/v1/forms/{form}/entries/bulk',
        '/v1/entries/{entry}',
        '/v1/entries/{entry}/restore',
        '/v1/entries/{entry}/force',
        '/v1/forms/{form}/entries/exports',
        '/v1/entry-exports',
        '/v1/entry-exports/{export}',
        '/v1/entry-exports/{export}/download',
        '/v1/forms/{form}/notifications',
        '/v1/notifications/{notification}',
        '/v1/notifications/{notification}/restore',
        '/v1/forms/{form}/submissions',
      ]),
    )
  })
})

describe('errors without a session', () => {
  it('answers a guest with 401 JSON, never a redirect', async () => {
    const response = await call('/v1/forms')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({ message: expect.any(String) })
  })

  it('rejects an invalid bearer token with 401', async () => {
    expect((await call('/v1/auth/me', { token: 'not-a-token' })).status).toBe(401)
  })

  it('refuses to refresh an invalid token with 401', async () => {
    expect((await call('/v1/auth/refresh', { method: 'POST', token: 'not-a-token' })).status).toBe(
      401,
    )
  })

  it('rejects wrong credentials with a 422 on email', async () => {
    const response = await call('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: madeUpEmail(), password: 'wrong-password' }),
    })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      message: expect.any(String),
      errors: { email: [expect.any(String)] },
    })
  })

  it('answers forgot-password the same way for an unknown address', async () => {
    const response = await call('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: madeUpEmail() }),
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ message: expect.any(String) })
  })

  it('answers a submission to an unknown form with 404 JSON', async () => {
    const response = await call(`/v1/forms/${madeUpUlid}/submissions`, {
      method: 'POST',
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ message: expect.any(String) })
  })
})

describe.skipIf(!canCreateUsers)('auth tokens', () => {
  let account: Account
  let token: string
  let deleted = false

  beforeAll(() => {
    account = createThrowawayUser('Contract')
  })

  afterAll(async () => {
    if (!deleted && token) {
      await call(`/v1/auth/me?password=${encodeURIComponent(account.password)}`, {
        method: 'DELETE',
        token,
      })
    }
  })

  it('logs in with a bearer token', async () => {
    const response = await call('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: account.email, password: account.password }),
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      access_token: expect.any(String),
      token_type: 'bearer',
      expires_in: expect.any(Number),
    })
    token = response.body.access_token
  })

  it('returns the user wrapped in data', async () => {
    const response = await call('/v1/auth/me', { token })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ email: account.email, name: account.name })
  })

  it('returns an empty forms list in the pagination envelope', async () => {
    const response = await call('/v1/forms?per_page=5', { token })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      data: [],
      links: { first: expect.any(String), prev: null, next: null },
      meta: { current_page: 1, last_page: 1, per_page: 5, total: 0 },
    })
  })

  it('rejects a page size over 100 with a 422 on per_page', async () => {
    const response = await call('/v1/forms?per_page=101', { token })

    expect(response.status).toBe(422)
    expect(Object.keys(response.body.errors)).toContain('per_page')
  })

  it('invalidates the old token when refreshing', async () => {
    const response = await call('/v1/auth/refresh', { method: 'POST', token })

    expect(response.status).toBe(200)
    expect(response.body.access_token).toEqual(expect.any(String))
    expect(response.body.access_token).not.toBe(token)

    const old = token
    token = response.body.access_token

    expect((await call('/v1/auth/me', { token: old })).status).toBe(401)
    expect((await call('/v1/auth/me', { token })).status).toBe(200)
  })

  it('deletes the account, after which the credentials stop working', async () => {
    const wrong = await call('/v1/auth/me?password=wrong-password', { method: 'DELETE', token })

    expect(wrong.status).toBe(422)

    const response = await call(`/v1/auth/me?password=${encodeURIComponent(account.password)}`, {
      method: 'DELETE',
      token,
    })

    expect(response.status).toBe(204)
    deleted = true

    const login = await call('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: account.email, password: account.password }),
    })

    expect(login.status).toBe(422)
  })
})
