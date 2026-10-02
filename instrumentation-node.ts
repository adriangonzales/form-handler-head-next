// Validates server configuration at startup. A misconfigured server exits with the list of
// problems, rather than starting and failing every request.
import { serverEnv } from './lib/env'

try {
  serverEnv()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
