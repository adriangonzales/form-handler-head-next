import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`

// The suite runs its own dev server on E2E_PORT (default 3100), never one you have open, because it
// sets AUTH_REFRESH_AHEAD_SECONDS above the token lifetime: every request refreshes the token, which
// exercises the refresh path all the time. It needs BACKEND_API_URL, SESSION_SECRET and
// E2E_CREATE_USER_CMD (from .env or the environment).
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next dev --port ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: { AUTH_REFRESH_AHEAD_SECONDS: '4000' },
      },
})
