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

describe.skipIf(!canCreateUsers)('entries', () => {
  let account: Account
  let token: string
  let formId: string

  const addEntry = (message: string) =>
    call(`/v1/forms/${formId}/entries`, {
      method: 'POST',
      token,
      body: JSON.stringify({ message }),
    }).then((response) => response.body.data.id as string)

  const list = (query = '') =>
    call(`/v1/forms/${formId}/entries${query}`, { token }).then((response) => response.body)

  beforeAll(async () => {
    account = createThrowawayUser('Contract')
    token = (
      await call('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: account.email, password: account.password }),
      })
    ).body.access_token

    const form = await call('/v1/forms', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'Entries',
        schema: [{ id: '01k0000000000000000000000a', order: 1, name: 'message' }],
      }),
    })

    formId = form.body.data.id
    await call(`/v1/forms/${formId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ name: 'Entries', active: true }),
    })
  })

  afterAll(async () => {
    if (token) {
      await call(`/v1/auth/me?password=${encodeURIComponent(account.password)}`, {
        method: 'DELETE',
        token,
      })
    }
  })

  it('adds entries as the owner, sorted oldest first unless asked otherwise', async () => {
    const first = await addEntry('First')
    const second = await addEntry('Second')

    const ids = (page: { data: { id: string }[] }) => page.data.map((entry) => entry.id)

    expect(ids(await list())).toEqual([first, second])
    expect(ids(await list('?sort=-created_at'))).toEqual([second, first])
    expect((await list()).data[0]).toMatchObject({
      input: { message: 'First' },
      spam_score: expect.any(Number),
      starred: false,
      read_at: null,
    })
  })

  it('updates triage fields with PUT, and rejects changes to submitted data', async () => {
    const id = await addEntry('Update me')
    const updated = await call(`/v1/entries/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ starred: true, read_at: '2026-10-02T10:00:00Z' }),
    })
    const rejected = await call(`/v1/entries/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ input: { message: 'Changed' } }),
    })

    expect(updated.status).toBe(200)
    expect(updated.body.data).toMatchObject({ starred: true, read_at: expect.any(String) })
    expect(rejected.status).toBe(422)
    expect(Object.keys(rejected.body.errors)).toContain('input')
  })

  it('filters by tab', async () => {
    const id = await addEntry('Spammy')

    await call(`/v1/entries/${id}`, { method: 'PUT', token, body: JSON.stringify({ spam: true }) })

    const spam = await list('?filter[spam]=true')
    const inbox = await list('?filter[spam]=false')
    const starred = await list('?filter[starred]=true')

    expect(spam.data.map((entry: { id: string }) => entry.id)).toEqual([id])
    expect(inbox.data.map((entry: { id: string }) => entry.id)).not.toContain(id)
    expect(starred.meta.total).toBe(1)
  })

  it('soft-deletes, restores, and only erases entries already in Trash', async () => {
    const id = await addEntry('Erase me')

    expect((await call(`/v1/entries/${id}/force`, { method: 'DELETE', token })).status).toBe(409)
    expect((await call(`/v1/entries/${id}`, { method: 'DELETE', token })).status).toBe(204)
    expect((await call(`/v1/entries/${id}`, { token })).status).toBe(404)
    expect((await list('?filter[trashed]=only')).data.map((e: { id: string }) => e.id)).toEqual([
      id,
    ])

    expect((await call(`/v1/entries/${id}/restore`, { method: 'POST', token })).status).toBe(200)
    expect((await call(`/v1/entries/${id}`, { token })).status).toBe(200)

    await call(`/v1/entries/${id}`, { method: 'DELETE', token })
    expect((await call(`/v1/entries/${id}/force`, { method: 'DELETE', token })).status).toBe(204)
    expect(
      (await list('?filter[trashed]=with')).data.map((e: { id: string }) => e.id),
    ).not.toContain(id)
  })

  it('reports how many entries a bulk action changed, and rejects stale ids on their index', async () => {
    const ids = [await addEntry('A'), await addEntry('B'), await addEntry('C')]

    await call(`/v1/entries/${ids[0]}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ starred: true }),
    })

    const bulk = (action: string, bulkIds: string[]) =>
      call(`/v1/forms/${formId}/entries/bulk`, {
        method: 'POST',
        token,
        body: JSON.stringify({ action, ids: bulkIds }),
      })

    expect((await bulk('star', ids)).body).toEqual({ data: { action: 'star', affected: 2 } })

    // Restoring entries that aren't in Trash: each is reported on its index.
    const stale = await bulk('restore', ids)

    expect(stale.status).toBe(422)
    expect(Object.keys(stale.body.errors)).toEqual(expect.arrayContaining(['ids.0', 'ids.2']))
  })

  it('rejects an end date before the start date', async () => {
    const response = await call(
      `/v1/forms/${formId}/entries?filter[created_from]=2026-10-05&filter[created_to]=2026-10-01`,
      { token },
    )

    expect(response.status).toBe(422)
    expect(Object.keys(response.body.errors)).toContain('filter.created_to')
  })
})

describe.skipIf(!canCreateUsers)('exports', () => {
  let account: Account
  let token: string
  let formId: string
  /** Every export this suite started, newest last. */
  const started: string[] = []

  const createForm = async (name: string) => {
    const form = await call('/v1/forms', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name,
        schema: [
          { id: '01k0000000000000000000000a', order: 2, label: 'Your message', name: 'message' },
          { id: '01k0000000000000000000000b', order: 1, label: 'Full name', name: 'name' },
        ],
      }),
    })

    await call(`/v1/forms/${form.body.data.id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ name, active: true }),
    })

    return form.body.data.id as string
  }

  const startExport = async (form: string, body: Record<string, unknown>) => {
    const response = await call(`/v1/forms/${form}/entries/exports`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    })

    if (response.status === 202) started.push(response.body.data.id)

    return response
  }

  /** Polls an export until it's no longer in progress. Needs The Backend's workers running. */
  async function settled(id: string) {
    const deadline = Date.now() + 30_000

    for (;;) {
      const { body } = await call(`/v1/entry-exports/${id}`, { token })

      if (!['pending', 'processing'].includes(body.data.status)) return body.data

      if (Date.now() > deadline) {
        throw new Error(`Export ${id} is still ${body.data.status}: are the workers running?`)
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  beforeAll(async () => {
    account = createThrowawayUser('Contract')
    token = (
      await call('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: account.email, password: account.password }),
      })
    ).body.access_token
    formId = await createForm('Contract Exports')

    for (const [name, message, starred] of [
      ['Ana', 'First', true],
      ['Bo', 'Second', false],
      ['Cy', '=1+1', true],
    ] as const) {
      const entry = await call(`/v1/forms/${formId}/entries`, {
        method: 'POST',
        token,
        body: JSON.stringify({ name, message }),
      })

      if (starred) {
        await call(`/v1/entries/${entry.body.data.id}`, {
          method: 'PUT',
          token,
          body: JSON.stringify({ starred: true }),
        })
      }
    }
  })

  afterAll(async () => {
    if (token) {
      await call(`/v1/auth/me?password=${encodeURIComponent(account.password)}`, {
        method: 'DELETE',
        token,
      })
    }
  })

  it('starts an export with 202 and Location, keeping filter and sort but not per_page', async () => {
    const response = await startExport(formId, {
      filter: { starred: 'true' },
      sort: '-created_at',
      per_page: 5,
    })
    const entryExport = response.body.data

    expect(response.status).toBe(202)
    expect(response.headers.get('location')).toMatch(
      new RegExp(`/v1/entry-exports/${entryExport.id}$`),
    )
    expect(entryExport).toMatchObject({
      form_id: formId,
      status: expect.stringMatching(/^(pending|processing|completed)$/),
      parameters: { filter: { starred: 'true' }, sort: '-created_at' },
      filename: expect.stringMatching(/^contract-exports-entries-\d{4}-\d{2}-\d{2}\.csv$/),
    })
    expect(entryExport.parameters).not.toHaveProperty('per_page')
    expect(Date.parse(entryExport.expires_at) - Date.parse(entryExport.created_at)).toBe(
      24 * 3600 * 1000,
    )

    if (entryExport.status !== 'completed') expect(entryExport.download_url).toBeNull()
  })

  it('returns `{}` as the parameters of an export without filters, and rejects bad filters', async () => {
    const plain = await startExport(formId, {})
    const invalid = await startExport(formId, { filter: { spam: 'maybe' } })

    expect(plain.body.data.parameters).toEqual({})
    expect(invalid.status).toBe(422)
    expect(Object.keys(invalid.body.errors)).toContain('filter.spam')
  })

  it('lists exports newest first, with per_page bounds, and answers 404 for an unknown one', async () => {
    const index = await call('/v1/entry-exports', { token })

    expect(index.status).toBe(200)
    expect(index.body.data.map((row: { id: string }) => row.id)).toEqual([...started].reverse())
    expect(index.body.meta).toMatchObject({ current_page: 1, per_page: 15 })
    expect((await call('/v1/entry-exports?per_page=101', { token })).status).toBe(422)
    expect((await call(`/v1/entry-exports/${madeUpUlid}`, { token })).status).toBe(404)
  })

  it('completes with a signed link that downloads the CSV without a token', async () => {
    const entryExport = await settled(started[0]!)

    expect(entryExport).toMatchObject({
      status: 'completed',
      row_count: 2,
      completed_at: expect.any(String),
      error: null,
    })
    expect(entryExport.download_url).toMatch(/^https?:\/\//)

    const download = await fetch(entryExport.download_url)
    const csv = await download.text()
    const lines = csv.trim().split(/\r?\n/)

    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toMatch(/^text\/csv/)
    expect(download.headers.get('content-disposition')).toContain(entryExport.filename)
    // Schema fields in order, headed by their labels.
    expect(lines[0]).toMatch(/^id,created_at,"Full name","Your message",read_at,starred,spam,/)
    expect(lines[0]).toContain('spam_checked_at')
    expect(lines).toHaveLength(3)
    // Newest first, and formula-like cells are neutralised.
    expect(lines[1]).toContain(`'=1+1`)
    expect(lines[2]).toContain('First')

    const tampered = new URL(entryExport.download_url)

    tampered.searchParams.set('signature', 'x'.repeat(64))
    expect((await fetch(tampered)).status).toBe(403)
  })

  it('leaves exports of a deleted form out of the index', async () => {
    const other = await createForm('Contract Gone')
    const gone = (await startExport(other, {})).body.data.id

    await call(`/v1/forms/${other}`, { method: 'DELETE', token })

    const index = await call('/v1/entry-exports?per_page=100', { token })

    expect(index.body.data.map((row: { id: string }) => row.id)).not.toContain(gone)
  })
})

describe.skipIf(!canCreateUsers)('notifications', () => {
  let account: Account
  let other: Account
  let token: string
  let otherToken: string
  let formId: string

  const signIn = async (user: Account) =>
    (
      await call('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: user.email, password: user.password }),
      })
    ).body.access_token as string

  const createForm = async (name: string, as = token) =>
    (await call('/v1/forms', { method: 'POST', token: as, body: JSON.stringify({ name }) })).body
      .data.id as string

  const addRecipient = (body: Record<string, unknown>, form = formId, as = token) =>
    call(`/v1/forms/${form}/notifications`, {
      method: 'POST',
      token: as,
      body: JSON.stringify(body),
    })

  const update = (id: string, body: Record<string, unknown>) =>
    call(`/v1/notifications/${id}`, { method: 'PUT', token, body: JSON.stringify(body) })

  const listIds = async (form = formId) =>
    (await call(`/v1/forms/${form}/notifications`, { token })).body.data.map(
      (row: { id: string }) => row.id,
    )

  beforeAll(async () => {
    account = createThrowawayUser('Contract')
    other = createThrowawayUser('Contract')
    token = await signIn(account)
    otherToken = await signIn(other)
    formId = await createForm('Contract Notifications')
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

  it('adds recipients enabled by default, listed at a fixed 15 per page', async () => {
    const email = await addRecipient({ type: 'email', value: 'alerts@example.com' })
    const sms = await addRecipient({ type: 'sms', value: '+14155552671', enabled: false })

    expect(email.status).toBeGreaterThanOrEqual(200)
    expect(email.status).toBeLessThan(300)
    expect(email.body.data).toMatchObject({
      form_id: formId,
      type: 'email',
      value: 'alerts@example.com',
      enabled: true,
      error: null,
      deleted_at: null,
    })
    expect(email.body.data.id).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/)
    expect(sms.body.data).toMatchObject({ type: 'sms', enabled: false })

    const list = await call(`/v1/forms/${formId}/notifications?per_page=1`, { token })

    expect(list.status).toBe(200)
    expect(list.body.meta).toMatchObject({ per_page: 15, total: 2, current_page: 1 })
    // The contract doesn't fix the list's order.
    expect(list.body.data.map((row: { id: string }) => row.id).sort()).toEqual(
      [email.body.data.id, sms.body.data.id].sort(),
    )
  })

  it('checks the value against the type, and refuses to take an error', async () => {
    for (const body of [
      { type: 'email', value: 'not-an-email' },
      { type: 'sms', value: '415-555-2671' },
      { type: 'sms', value: '+1 415 555 2671' },
      { type: 'sms', value: '+0123456' },
    ]) {
      const response = await addRecipient(body)

      expect(response.status, JSON.stringify(body)).toBe(422)
      expect(Object.keys(response.body.errors)).toEqual(['value'])
    }

    const typeError = await addRecipient({ type: 'pigeon', value: 'coo' })

    expect(typeError.status).toBe(422)
    expect(Object.keys(typeError.body.errors)).toContain('type')

    const withError = await addRecipient({ type: 'email', value: 'a@example.com', error: null })

    expect(withError.status).toBe(422)
    expect(Object.keys(withError.body.errors)).toEqual(['error'])
  })

  it('requires type, value and enabled on update, and never moves a recipient', async () => {
    const id = (await addRecipient({ type: 'email', value: 'edit@example.com' })).body.data.id

    const missing = await update(id, { enabled: false })

    expect(missing.status).toBe(422)
    expect(Object.keys(missing.body.errors).sort()).toEqual(['type', 'value'])

    const noEnabled = await update(id, { type: 'email', value: 'edit@example.com' })

    expect(noEnabled.status).toBe(422)
    expect(Object.keys(noEnabled.body.errors)).toEqual(['enabled'])

    const moved = await update(id, {
      type: 'email',
      value: 'edit@example.com',
      enabled: true,
      form_id: madeUpUlid,
    })

    expect(moved.status).toBe(422)
    expect(Object.keys(moved.body.errors)).toEqual(['form_id'])

    const changed = await update(id, { type: 'sms', value: '+447700900123', enabled: false })

    expect(changed.status).toBe(200)
    expect(changed.body.data).toMatchObject({
      id,
      form_id: formId,
      type: 'sms',
      value: '+447700900123',
      enabled: false,
    })
    expect((await call(`/v1/notifications/${id}`, { token })).body.data.enabled).toBe(false)
  })

  it('soft-deletes a recipient, answering 404 until it is restored', async () => {
    const id = (await addRecipient({ type: 'email', value: 'gone@example.com' })).body.data.id

    expect((await call(`/v1/notifications/${id}`, { method: 'DELETE', token })).status).toBe(204)
    expect((await call(`/v1/notifications/${id}`, { token })).status).toBe(404)
    expect(await listIds()).not.toContain(id)

    const restored = await call(`/v1/notifications/${id}/restore`, { method: 'POST', token })

    expect(restored.status).toBe(200)
    expect(restored.body.data).toMatchObject({ id, deleted_at: null })
    expect(await listIds()).toContain(id)
  })

  it("answers 403 for someone else's recipients, and those of a deleted form", async () => {
    const theirForm = await createForm('Not yours', otherToken)
    const theirs = (
      await addRecipient({ type: 'email', value: 'theirs@example.com' }, theirForm, otherToken)
    ).body.data.id

    expect((await call(`/v1/notifications/${theirs}`, { token })).status).toBe(403)
    expect((await call(`/v1/forms/${theirForm}/notifications`, { token })).status).toBe(403)
    expect((await addRecipient({ type: 'email', value: 'me@example.com' }, theirForm)).status).toBe(
      403,
    )

    const doomed = await createForm('Deleted with recipients')
    const orphan = (await addRecipient({ type: 'email', value: 'o@example.com' }, doomed)).body.data
      .id

    await call(`/v1/forms/${doomed}`, { method: 'DELETE', token })
    expect((await call(`/v1/notifications/${orphan}`, { token })).status).toBe(403)
    expect((await call(`/v1/forms/${doomed}/notifications`, { token })).status).toBe(404)
  })
})
