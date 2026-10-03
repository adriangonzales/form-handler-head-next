import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { loginUrl } from '@/lib/redirect'
import { refreshCoordinator } from '@/lib/session/coordinator'
import { requireSession } from '@/lib/session/server'
import { type BackendCallOptions, clientIp } from './client'

/**
 * Calls The Backend from a Server Component with the session's token. proxy.ts refreshed the token
 * before this render, so it's usable. Server Components can't set cookies, so they never refresh.
 *
 * A 401 can still happen when another request (the browser's, still carrying the same token)
 * refreshed it after proxy.ts ran, which invalidates it. The call is then retried once with the
 * token that refresh produced; the browser picks it up on its next request. Any other 401 (the
 * session was revoked elsewhere) sends the user to sign in again.
 */
export async function renderCall<T extends { response: Response }>(
  call: (options: Required<Pick<BackendCallOptions, 'token'>> & BackendCallOptions) => Promise<T>,
): Promise<T> {
  const session = await requireSession()
  const forwardedFor = clientIp(await headers())
  let result = await call({ token: session.token, forwardedFor })

  if (result.response.status === 401) {
    const refreshed = await refreshCoordinator()
      .refreshedTo(session.token)
      .catch(() => null) // Store unreachable: treat as not refreshed.

    if (refreshed) result = await call({ token: refreshed.token, forwardedFor })
  }

  if (result.response.status === 401) redirect(loginUrl({ reason: 'expired' }))

  return result
}
