// Loads `.env` for test runners that don't (Vitest's contract project, Playwright helpers).
try {
  process.loadEnvFile()
} catch {
  // No .env: rely on the environment.
}

/** The Backend's API base for tests that call it directly. */
export function backendApiUrl(): string {
  const url = process.env.BACKEND_API_URL

  if (!url) {
    throw new Error(
      'Set BACKEND_API_URL (in .env or the environment) to run tests against a backend.',
    )
  }

  return url.replace(/\/+$/, '')
}
