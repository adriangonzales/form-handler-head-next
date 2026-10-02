// Runs the dashboard against the mock backend: starts both, and stops both on Ctrl-C.
// The mock answers on MOCK_BACKEND_PORT (default 8010). Values in .env are overridden where they
// would point the dashboard elsewhere, and the refresh store is in memory.
import { spawn } from 'node:child_process'

const port = process.env.MOCK_BACKEND_PORT ?? '8010'
const apiUrl = `http://127.0.0.1:${port}/api`
const env = {
  ...process.env,
  MOCK_BACKEND_PORT: port,
  BACKEND_API_URL: apiUrl,
  NEXT_PUBLIC_BACKEND_PUBLIC_URL: apiUrl,
  SESSION_SECRET: process.env.SESSION_SECRET || 'mock-backend-session-secret-not-for-real-use',
  // Empty rather than unset, so Next.js doesn't fill it in from .env: the mock uses the memory store.
  REDIS_URL: '',
}

const children = [
  spawn('pnpm', ['exec', 'tsx', 'scripts/mock-backend.ts'], { env, stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'next', 'dev', ...process.argv.slice(2)], { env, stdio: 'inherit' }),
]

const stop = () => children.forEach((child) => child.kill('SIGTERM'))

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
children.forEach((child) => child.on('exit', stop))
