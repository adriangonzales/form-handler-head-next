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

describe.skipIf(!canCreateUsers)('forms', () => {
  let account: Account
  let other: Account
  let token: string
  let otherToken: string

  async function signIn(user: Account) {
    const response = await call('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: user.email, password: user.password }),
    })

    return response.body.access_token as string
  }

  const createForm = (body: Record<string, unknown>, as = token) =>
    call('/v1/forms', { method: 'POST', token: as, body: JSON.stringify(body) })

  beforeAll(async () => {
    account = createThrowawayUser('Contract')
    other = createThrowawayUser('Contract')
    token = await signIn(account)
    otherToken = await signIn(other)
  })

  afterAll(async () => {
    for (const [user, userToken] of [
      [account, token],
      [other, otherToken],
    ] as const) {
      if (userToken) {
        await call(`/v1/auth/me?password=${encodeURIComponent(user.password)}`, {
          method: 'DELETE',
          token: userToken,
        })
      }
    }
  })

  it('creates an inactive form with 2xx, keeping the schema list sorted by order', async () => {
    const response = await createForm({
      name: 'Contract form',
      schema: [
        { id: '01k0000000000000000000000b', order: 2, name: 'email', rules: ['required', 'email'] },
        { id: '01k0000000000000000000000a', order: 1, name: 'name', rules: 'required,max:255' },
      ],
    })

    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)
    expect(response.body.data).toMatchObject({
      id: expect.any(String),
      name: 'Contract form',
      active: false,
      // Null until settings are sent; after that, every key.
      settings: null,
    })
    expect(response.body.data.schema.map((field: { name: string }) => field.name)).toEqual([
      'name',
      'email',
    ])
  })

  it('rejects unknown settings keys and field keys with 422s on their paths', async () => {
    const settings = await createForm({ name: 'Bad', settings: { colour: 'red' } })
    const schema = await createForm({
      name: 'Bad',
      schema: [{ id: '01k0000000000000000000000a', order: 1, colour: 'red' }],
    })

    expect(settings.status).toBe(422)
    expect(Object.keys(settings.body.errors)).toContain('settings')
    expect(schema.status).toBe(422)
    expect(Object.keys(schema.body.errors).some((key) => key.startsWith('schema.0'))).toBe(true)
  })

  it('reports an invalid domain on its index', async () => {
    const response = await createForm({
      name: 'Bad',
      settings: { domains: ['example.com', 'https://example.com/path'] },
    })

    expect(response.status).toBe(422)
    expect(Object.keys(response.body.errors)).toContain('settings.domains.1')
  })

  it('generates a honeypot name, and rejects one that clashes with a field', async () => {
    const generated = await createForm({ name: 'Honeypot', settings: { honeypot_enabled: true } })

    expect(generated.body.data.settings).toEqual({
      redirect: null,
      timezone: null,
      domains: expect.toBeOneOf([null, []]),
      message: null,
      honeypot_enabled: true,
      honeypot_name: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
    })

    const clash = await createForm({
      name: 'Clash',
      schema: [{ id: '01k0000000000000000000000a', order: 1, name: 'email' }],
      settings: { honeypot_enabled: true, honeypot_name: 'email' },
    })

    expect(clash.status).toBe(422)
    expect(Object.keys(clash.body.errors)).toContain('settings.honeypot_name')
  })

  it('requires name and active on update', async () => {
    const { body } = await createForm({ name: 'Update me' })
    const missing = await call(`/v1/forms/${body.data.id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ active: true }),
    })
    const updated = await call(`/v1/forms/${body.data.id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ name: 'Updated', active: true }),
    })

    expect(missing.status).toBe(422)
    expect(Object.keys(missing.body.errors)).toContain('name')
    expect(updated.status).toBe(200)
    expect(updated.body.data).toMatchObject({ name: 'Updated', active: true })
  })

  it('lists forms with entry counts, sorted and filtered', async () => {
    const response = await call('/v1/forms?sort=name&filter[active]=false&per_page=100', {
      token,
    })
    const names = response.body.data.map((form: { name: string }) => form.name)

    expect(response.status).toBe(200)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(names).not.toContain('Updated')
    expect(response.body.data[0]).toMatchObject({
      active: false,
      entries_count: 0,
      unread_entries_count: 0,
      spam_entries_count: 0,
    })
  })

  it('rejects an unknown sort with a 422', async () => {
    expect((await call('/v1/forms?sort=colour', { token })).status).toBe(422)
  })

  it('soft-deletes a form, answering 404 until it is restored', async () => {
    const { body } = await createForm({ name: 'Delete me' })
    const id = body.data.id

    expect((await call(`/v1/forms/${id}`, { method: 'DELETE', token })).status).toBe(204)
    expect((await call(`/v1/forms/${id}`, { token })).status).toBe(404)

    const restored = await call(`/v1/forms/${id}/restore`, { method: 'POST', token })

    expect(restored.status).toBe(200)
    expect(restored.body.data).toMatchObject({ id, name: 'Delete me' })
    expect((await call(`/v1/forms/${id}`, { token })).status).toBe(200)
  })

  it('duplicates a form as a new, inactive one', async () => {
    const { body } = await createForm({
      name: 'Original',
      schema: [{ id: '01k0000000000000000000000a', order: 1, name: 'email' }],
      settings: { message: 'Thanks' },
    })

    await call(`/v1/forms/${body.data.id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ name: 'Original', active: true }),
    })

    const copy = await call(`/v1/forms/${body.data.id}/duplicate`, { method: 'POST', token })

    expect(copy.status).toBeGreaterThanOrEqual(200)
    expect(copy.status).toBeLessThan(300)
    expect(copy.body.data.id).not.toBe(body.data.id)
    expect(copy.body.data).toMatchObject({
      name: expect.stringContaining('Original'),
      active: false,
      schema: [expect.objectContaining({ name: 'email' })],
      settings: expect.objectContaining({ message: 'Thanks' }),
    })
  })

  it('accepts public submissions as JSON with CORS, keeping only schema fields', async () => {
    const { body } = await createForm({
      name: 'Public',
      schema: [
        { id: '01k0000000000000000000000a', order: 1, name: 'email', rules: ['required', 'email'] },
      ],
      settings: { message: 'Thanks!' },
    })
    const id = body.data.id
    const submit = (data: Record<string, unknown>) =>
      call(`/v1/forms/${id}/submissions`, {
        method: 'POST',
        headers: { Origin: 'https://site.example' },
        body: JSON.stringify(data),
      })

    expect((await submit({ email: 'reader@example.com' })).status).toBe(403)

    await call(`/v1/forms/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ name: 'Public', active: true }),
    })

    const invalid = await submit({ email: 'not-an-email' })
    const accepted = await submit({ email: 'reader@example.com', extra: 'dropped' })

    expect(invalid.status).toBe(422)
    expect(Object.keys(invalid.body.errors)).toEqual(['email'])
    expect(accepted.status).toBe(201)
    expect(accepted.body).toEqual({ data: { redirect: null, message: 'Thanks!' } })
    expect(accepted.headers.get('access-control-allow-origin')).toMatch(
      /^(\*|https:\/\/site\.example)$/,
    )

    const entries = await call(`/v1/forms/${id}/entries`, { token })

    expect(entries.body.data).toHaveLength(1)
    expect(entries.body.data[0].input).toEqual({ email: 'reader@example.com' })
  })

  it("answers 403 for someone else's form and 404 for an unknown one", async () => {
    const { body } = await createForm({ name: 'Private' })

    expect((await call(`/v1/forms/${body.data.id}`, { token: otherToken })).status).toBe(403)
    expect((await call(`/v1/forms/${madeUpUlid}`, { token })).status).toBe(404)
  })
})
