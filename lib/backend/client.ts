import 'server-only'
import createClient from 'openapi-fetch'
import { serverEnv } from '@/lib/env'
import type { paths } from '@/types/api'

export interface BackendCallOptions {
  /** The session's access token, for authenticated endpoints. */
  token?: string
  /** The browser's IP, so The Backend's per-IP throttles apply per user rather than to this server. */
  forwardedFor?: string
}

/**
 * Typed client for The Backend. The only place outside lib/backend that should know The Backend's
 * base URL and auth header is nowhere: other code calls the helpers in lib/backend.
 */
export function backendClient(options: BackendCallOptions = {}) {
  return createClient<paths>({
    baseUrl: serverEnv().BACKEND_API_URL,
    headers: backendHeaders(options),
  })
}

export function backendHeaders({
  token,
  forwardedFor,
}: BackendCallOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor
  if (token) headers.Authorization = `Bearer ${token}`

  return headers
}

/** The client IP of an incoming request: the first `X-Forwarded-For` entry, which Next.js sets. */
export function clientIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()

  return forwarded || headers.get('x-real-ip') || undefined
}
