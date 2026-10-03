// The environment that points the dashboard, and its tests, at the mock backend on `port`. Values
// in .env are overridden where they would point elsewhere: these are set in the environment, which
// takes precedence over .env for Next.js, Playwright and the test helpers.

/** @param {string} port */
export function mockBackendEnv(port) {
  const apiUrl = `http://127.0.0.1:${port}/api`

  return {
    MOCK_BACKEND_PORT: port,
    BACKEND_API_URL: apiUrl,
    BACKEND_SPEC_URL: `http://127.0.0.1:${port}/docs/api.json`,
    NEXT_PUBLIC_BACKEND_PUBLIC_URL: apiUrl,
    SESSION_SECRET: process.env.SESSION_SECRET || 'mock-backend-session-secret-not-for-real-use',
    // Empty rather than unset, so nothing fills it in from .env: the mock uses the memory store.
    REDIS_URL: '',
    // The mock's own sign-up for test users (the contract has none).
    E2E_CREATE_USER_CMD: `curl -sf -X POST http://127.0.0.1:${port}/__mock/users -H 'Content-Type: application/json' -d '{"name":"{name}","email":"{email}","password":"{password}"}'`,
  }
}
