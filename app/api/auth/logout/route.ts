import { logout } from '@/lib/backend/auth'
import { clientIp } from '@/lib/backend/client'
import { refreshCoordinator } from '@/lib/session/coordinator'
import { clearSession, getSession } from '@/lib/session/server'

/** Invalidates the token at The Backend, then clears the session whatever The Backend answered. */
export async function POST(request: Request) {
  const session = await getSession()

  if (session) {
    // A token another request already refreshed is no longer valid, so there's nothing to revoke.
    const refreshed = await refreshCoordinator()
      .wasRefreshed(session.token)
      .catch(() => false)

    if (!refreshed) await logout(session.token, clientIp(request.headers))
  }

  await clearSession()

  return new Response(null, { status: 204 })
}
