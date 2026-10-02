import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { clientIp } from '@/lib/backend/client'
import { HttpError, unauthenticated } from '@/lib/http'
import { loginUrl } from '@/lib/redirect'
import {
  SESSION_COOKIE,
  type Session,
  sealSession,
  sessionCookieOptions,
  unsealSession,
} from './session'
import { resolveSessionToken } from './session-token'

/** The signed-in session, or null. Reads the cookie, which proxy.ts has already refreshed. */
export const getSession = cache(async (): Promise<Session | null> => {
  return unsealSession((await cookies()).get(SESSION_COOKIE)?.value)
})

/**
 * The session for a Server Component, or a redirect to the login page. proxy.ts sends guests there
 * first; this is the second line of defence for routes its matcher might miss.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession()

  if (!session) redirect(loginUrl())

  return session
}

/** Saves the session cookie. Route handlers only: Server Components can't set cookies. */
export async function saveSession(session: Session): Promise<void> {
  ;(await cookies()).set(SESSION_COOKIE, await sealSession(session), sessionCookieOptions(session))
}

export async function clearSession(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}

/**
 * Calls The Backend with the session's token from a route handler: refreshes it first when needed,
 * and refreshes and retries once if The Backend answers 401. Saves a refreshed session; clears an
 * ended one and throws 401, so the client sends the user to the login page.
 */
export async function withBackendToken<T extends { response: Response }>(
  request: Request,
  call: (token: string, forwardedFor: string | undefined) => Promise<T>,
): Promise<T> {
  const forwardedFor = clientIp(request.headers)
  const session = await getSession()

  if (!session) throw unauthenticated()

  let current = await usableSession(session, { forwardedFor })
  let result = await call(current.token, forwardedFor)

  if (result.response.status === 401) {
    current = await usableSession(current, { forwardedFor, forceRefresh: true })
    result = await call(current.token, forwardedFor)
  }

  if (result.response.status === 401) {
    await clearSession()
    throw unauthenticated()
  }

  return result
}

async function usableSession(
  session: Session,
  options: { forwardedFor?: string; forceRefresh?: boolean },
): Promise<Session> {
  const outcome = await resolveSessionToken(session, options)

  if (outcome.kind === 'ended') {
    await clearSession()
    throw unauthenticated()
  }

  if (outcome.kind === 'unavailable') {
    throw new HttpError(outcome.status, outcome.message)
  }

  if (outcome.refreshed) await saveSession(outcome.session)

  return outcome.session
}
