import { type NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/lib/backend/client'
import { loginUrl, safeRedirect } from '@/lib/redirect'
import {
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  unsealSession,
} from '@/lib/session/session'
import { resolveSessionToken } from '@/lib/session/session-token'

/** Pages guests can see. Everything else needs a session. */
const publicPaths = new Set(['/login', '/forgot-password', '/reset-password'])

/**
 * Runs before every page render (not API routes or static files).
 *
 * - Sends guests to the login page, with a way back.
 * - Refreshes the session's token when it's about to expire. Server Components can't set cookies,
 *   so the refreshed cookie goes both onto this request (for the render that follows) and onto the
 *   response (for the browser). Server Components then always see a usable token.
 * - Ends a session whose refresh window has passed.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value)

  if (publicPaths.has(pathname)) {
    if (session && pathname === '/login' && session.refreshableUntil > Date.now()) {
      const next = safeRedirect(request.nextUrl.searchParams.get('next'))

      return NextResponse.redirect(new URL(next, request.url))
    }

    return NextResponse.next()
  }

  const next = `${pathname}${search}`

  if (!session) {
    return NextResponse.redirect(new URL(loginUrl({ next }), request.url))
  }

  const outcome = await resolveSessionToken(session, { forwardedFor: clientIp(request.headers) })

  if (outcome.kind === 'ended') {
    const response = NextResponse.redirect(
      new URL(loginUrl({ reason: 'expired', next }), request.url),
    )

    response.cookies.delete(SESSION_COOKIE)

    return response
  }

  // When The Backend or Redis is briefly unreachable, render with the current token rather than
  // signing the user out; it is still valid for AUTH_REFRESH_AHEAD_SECONDS.
  if (outcome.kind === 'unavailable' || !outcome.refreshed) {
    return NextResponse.next()
  }

  const sealed = await sealSession(outcome.session)

  request.cookies.set(SESSION_COOKIE, sealed)

  const response = NextResponse.next({ request: { headers: request.headers } })

  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions(outcome.session))

  return response
}

export const config = {
  // Pages only: route handlers under /api refresh tokens themselves, and static files need no session.
  matcher: ['/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.[a-z0-9]+$).*)'],
}
