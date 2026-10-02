import 'server-only'
import type { TokenSet } from '@/lib/session/token-action'
import type { User } from '@/types/models'
import { type BackendCallOptions, backendClient } from './client'
import { BackendError, backendErrorFrom } from './errors'

/** The Backend answered a token request without a usable token. */
export class MissingTokenError extends Error {
  constructor() {
    super('The Backend returned no token.')
  }
}

/** Builds token data from a login, refresh or password-change response. */
export function tokenSetFromResponse(
  body: { access_token: unknown; expires_in: unknown },
  now = Date.now(),
): TokenSet {
  if (typeof body.access_token !== 'string' || body.access_token === '') {
    throw new MissingTokenError()
  }

  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 0

  return { token: body.access_token, expiresAt: now + expiresIn * 1000 }
}

/** Exchanges credentials for a token. Throws BackendError for 422 (wrong credentials) and 429. */
export async function login(
  credentials: { email: string; password: string },
  options: BackendCallOptions,
): Promise<TokenSet> {
  const { data, error, response } = await backendClient(options).POST('/v1/auth/login', {
    body: credentials,
  })

  if (!data) throw backendErrorFrom(response, error)

  return tokenSetFromResponse(data)
}

export async function currentUser(options: BackendCallOptions): Promise<User> {
  const { data, error, response } = await backendClient(options).GET('/v1/auth/me')

  if (!data) throw backendErrorFrom(response, error)

  return data.data
}

/**
 * Refreshes a token. Resolves `null` when The Backend rejects it (401), and throws for anything
 * else (network, 5xx), so a transient failure never ends the session.
 */
export async function refreshToken(token: string, forwardedFor?: string): Promise<TokenSet | null> {
  const { data, response } = await backendClient({ token, forwardedFor }).POST('/v1/auth/refresh')

  if (response.status === 401) return null

  if (!data)
    throw new BackendError(response.status, `Token refresh failed with ${response.status}.`)

  return tokenSetFromResponse(data)
}

/** Invalidates a token. Failures are ignored: signing out always works locally. */
export async function logout(token: string, forwardedFor?: string): Promise<void> {
  await backendClient({ token, forwardedFor })
    .POST('/v1/auth/logout')
    .catch(() => undefined)
}
