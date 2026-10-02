import 'server-only'
import { z } from 'zod'

const seconds = z.coerce.number().int().positive()

/** Reports a missing variable as "is required" rather than as a type mismatch. */
const required = (message: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? 'is required' : message),
})

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /** The Backend's API base, called only from this server, e.g. `http://127.0.0.1:8001/api`. */
    BACKEND_API_URL: z.url(required('must be a URL')).transform((url) => url.replace(/\/+$/, '')),
    /** The Backend's refresh window: how long after login a token can still be refreshed. */
    BACKEND_REFRESH_WINDOW_SECONDS: seconds.default(604_800),
    /** Refresh the token when it expires within this many seconds. */
    AUTH_REFRESH_AHEAD_SECONDS: seconds.default(120),
    /** Seals the session cookie and encrypts refresh results in Redis. */
    SESSION_SECRET: z
      .string(required('must be a string'))
      .min(32, 'must be at least 32 characters'),
    /** Shares token refreshes between server instances. Required in production. */
    REDIS_URL: z.url('must be a URL').optional(),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.REDIS_URL !== undefined, {
    path: ['REDIS_URL'],
    message: 'is required in production',
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>

/** Parses server configuration, throwing one error that lists every missing or invalid variable. */
export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(env)

  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    )

    throw new Error(`Invalid server configuration:\n${problems.join('\n')}`)
  }

  return result.data
}

let cached: ServerEnv | undefined

/** The server configuration, read from `process.env` at runtime (not inlined at build time). */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)

  return cached
}
