import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { loginUrl } from '@/lib/redirect'
import { requireSession } from '@/lib/session/server'
import { type BackendCallOptions, clientIp } from './client'

/**
 * Calls The Backend from a Server Component with the session's token. proxy.ts refreshed the token
 * before this render, so it's usable; if The Backend still answers 401 (the session was revoked
 * elsewhere), the user is sent to sign in again. Server Components can't set cookies, so they
 * never refresh.
 */
export async function renderCall<T extends { response: Response }>(
  call: (options: Required<Pick<BackendCallOptions, 'token'>> & BackendCallOptions) => Promise<T>,
): Promise<T> {
  const session = await requireSession()
  const result = await call({ token: session.token, forwardedFor: clientIp(await headers()) })

  if (result.response.status === 401) redirect(loginUrl({ reason: 'expired' }))

  return result
}
