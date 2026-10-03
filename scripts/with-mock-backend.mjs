// Runs a command against a fresh mock backend: starts the mock, waits until it answers, runs the
// command with the environment pointed at it, then stops the mock and exits with the command's code.
//
//   node scripts/with-mock-backend.mjs pnpm exec playwright test
//
// The mock answers on MOCK_BACKEND_PORT (default 8011, so it doesn't meet `pnpm dev:mock` on 8010).
import { spawn } from 'node:child_process'
import { mockBackendEnv } from './mock-backend-env.mjs'

const [command, ...args] = process.argv.slice(2)

if (!command) {
  console.error('Usage: node scripts/with-mock-backend.mjs <command> [args…]')
  process.exit(2)
}

const port = process.env.MOCK_BACKEND_PORT ?? '8011'
const env = { ...process.env, ...mockBackendEnv(port) }
const probe = `${env.BACKEND_API_URL}/v1/auth/me`

/** Whether anything answers HTTP on the mock's port. */
const answering = () =>
  fetch(probe).then(
    () => true,
    () => false,
  )

if (await answering()) {
  console.error(
    `Something is already listening on port ${port}. Stop it, or set MOCK_BACKEND_PORT.`,
  )
  process.exit(1)
}

const mock = spawn('pnpm', ['exec', 'tsx', 'scripts/mock-backend.ts'], { env, stdio: 'inherit' })
let mockExited = false

mock.on('exit', () => (mockExited = true))

for (let waited = 0; !(await answering()); waited += 200) {
  if (mockExited || waited > 30_000) {
    console.error('The mock backend did not start.')
    mock.kill('SIGTERM')
    process.exit(1)
  }

  await new Promise((resolve) => setTimeout(resolve, 200))
}

const child = spawn(command, args, { env, stdio: 'inherit' })
const stop = (signal) => child.kill(signal)

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

child.on('exit', (code, signal) => {
  mock.kill('SIGTERM')
  process.exit(code ?? (signal ? 1 : 0))
})
