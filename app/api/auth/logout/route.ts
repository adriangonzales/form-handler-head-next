import { logout } from '@/lib/backend/auth'
import { clientIp } from '@/lib/backend/client'
import { refreshCoordinator } from '@/lib/session/coordinator'
import { clearSession, getSession } from '@/lib/session/server'

/** Invalidates the token at The Backend, then clears the session whatever The Backend answered. */
export async function POST(request: Request) {
  const session = await getSession()

  if (session) {
    // If another request already refreshed this token, The Backend no longer accepts it, but the
    // token that refresh produced is live (and may be in the browser's cookie by now). Revoke that.
    const refreshed = await refreshCoordinator()
      .refreshedTo(session.token)
      .catch(() => null) // Store unreachable: revoke the token we have.

    await logout(refreshed?.token ?? session.token, clientIp(request.headers))
  }

  await clearSession()

  return new Response(null, { status: 204 })
}
