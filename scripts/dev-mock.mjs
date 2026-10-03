// Runs the dashboard against the mock backend: starts both, and stops both on Ctrl-C.
// The mock answers on MOCK_BACKEND_PORT (default 8010). Values in .env are overridden where they
// would point the dashboard elsewhere, and the refresh store is in memory.
import { spawn } from 'node:child_process'
import { mockBackendEnv } from './mock-backend-env.mjs'

const env = { ...process.env, ...mockBackendEnv(process.env.MOCK_BACKEND_PORT ?? '8010') }

const children = [
  spawn('pnpm', ['exec', 'tsx', 'scripts/mock-backend.ts'], { env, stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'next', 'dev', ...process.argv.slice(2)], { env, stdio: 'inherit' }),
]

const stop = () => children.forEach((child) => child.kill('SIGTERM'))

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
children.forEach((child) => child.on('exit', stop))
