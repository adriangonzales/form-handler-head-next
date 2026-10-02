// Serves the mock backend (tests/mocks/backend) over HTTP, so the dashboard and the contract suite
// can run without the reference Backend. `pnpm mock:backend`; MOCK_BACKEND_PORT (default 8010).
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { getResponse } from 'msw'
import { createMockBackend } from '../tests/mocks/backend/handlers'
import { MockBackendState } from '../tests/mocks/backend/state'

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8010)
const apiUrl = `http://127.0.0.1:${port}/api`
const spec = JSON.parse(await readFile(new URL('../types/openapi.json', import.meta.url), 'utf8'))
const state = new MockBackendState({
  tokenTtlSeconds: Number(process.env.MOCK_TOKEN_TTL_SECONDS ?? 3600),
  refreshWindowSeconds: Number(process.env.MOCK_REFRESH_WINDOW_SECONDS ?? 604_800),
  now: Date.now,
})
const { handlers } = createMockBackend({ apiUrl, spec, state })

const seed = {
  name: process.env.MOCK_USER_NAME ?? 'Demo User',
  email: process.env.MOCK_USER_EMAIL ?? 'demo@example.com',
  password: process.env.MOCK_USER_PASSWORD ?? 'password',
}

state.createUser(seed)

createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = []

  for await (const chunk of incoming) chunks.push(chunk as Buffer)

  const headers = new Headers()

  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === 'string') headers.set(name, value)
  }

  const method = incoming.method ?? 'GET'
  const request = new Request(new URL(incoming.url ?? '/', `http://127.0.0.1:${port}`), {
    method,
    headers,
    body:
      ['GET', 'HEAD'].includes(method) || chunks.length === 0 ? undefined : Buffer.concat(chunks),
  })
  const response =
    (await getResponse(handlers, request)) ??
    Response.json({ message: 'Not found.' }, { status: 404 })

  outgoing.writeHead(response.status, Object.fromEntries(response.headers))
  outgoing.end(Buffer.from(await response.arrayBuffer()))
}).listen(port, '127.0.0.1', () => {
  console.log(`Mock backend on ${apiUrl} (sign in as ${seed.email} / ${seed.password})`)
})
