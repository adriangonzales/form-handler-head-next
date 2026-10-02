import { NextResponse } from 'next/server'
import { backendClient } from '@/lib/backend/client'
import { backendErrorFrom } from '@/lib/backend/errors'
import { respond } from '@/lib/http'
import { getSession, saveSession, withBackendToken } from '@/lib/session/server'

/** Reloads the signed-in user from The Backend, stores it in the session, and returns it. */
export async function GET(request: Request) {
  return respond(async () => {
    const { data, error, response } = await withBackendToken(request, (token, forwardedFor) =>
      backendClient({ token, forwardedFor }).GET('/v1/auth/me'),
    )

    if (!data) throw backendErrorFrom(response, error)

    const session = await getSession()

    if (session) await saveSession({ ...session, user: data.data })

    return NextResponse.json({ user: data.data })
  })
}
