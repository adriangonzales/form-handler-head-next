import { NextResponse } from 'next/server'
import { backendClient } from '@/lib/backend/client'
import { backendErrorFrom } from '@/lib/backend/errors'
import { HttpError, readJson, respond } from '@/lib/http'
import { clearSession, saveSession, withBackendSession } from '@/lib/session/server'

/** Reloads the signed-in user from The Backend, stores it in the session, and returns it. */
export async function GET(request: Request) {
  return respond(async () => {
    const { result, session } = await withBackendSession(request, (token, forwardedFor) =>
      backendClient({ token, forwardedFor }).GET('/v1/auth/me'),
    )
    const { data, error, response } = result

    if (!data) throw backendErrorFrom(response, error)

    await saveSession({ ...session, user: data.data })

    return NextResponse.json({ user: data.data })
  })
}

/**
 * Updates the user's name or email, and the session's copy of the user, so the dashboard's header
 * shows the change once the page refreshes. Only the fields sent are changed.
 */
export async function PATCH(request: Request) {
  return respond(async () => {
    const body = await readJson(request)
    const changes: { name?: string; email?: string } = {}

    for (const key of ['name', 'email'] as const) {
      const value = body[key]

      if (value === undefined) continue
      if (typeof value !== 'string') throw new HttpError(400, `Expected ${key} to be a string.`)

      changes[key] = value
    }

    const { result, session } = await withBackendSession(request, (token, forwardedFor) =>
      backendClient({ token, forwardedFor }).PATCH('/v1/auth/me', { body: changes }),
    )
    const { data, error, response } = result

    if (!data) throw backendErrorFrom(response, error)

    await saveSession({ ...session, user: data.data })

    return NextResponse.json({ user: data.data })
  })
}

/**
 * Permanently deletes the account and everything it owns, then ends the session. The browser sends
 * the password in the body; the contract takes it as a query parameter, so it only ever appears in
 * this server-to-server request.
 */
export async function DELETE(request: Request) {
  return respond(async () => {
    const { password } = await readJson(request)

    if (typeof password !== 'string') throw new HttpError(400, 'Expected a password.')

    const { result } = await withBackendSession(request, (token, forwardedFor) =>
      backendClient({ token, forwardedFor }).DELETE('/v1/auth/me', {
        params: { query: { password } },
      }),
    )
    const { error, response } = result

    if (response.status !== 204) throw backendErrorFrom(response, error)

    await clearSession()

    return new Response(null, { status: 204 })
  })
}
