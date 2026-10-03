import { tokenSetFromResponse } from '@/lib/backend/auth'
import { backendClient } from '@/lib/backend/client'
import { backendErrorFrom } from '@/lib/backend/errors'
import { readJson, respond } from '@/lib/http'
import { startSession } from '@/lib/session/session'
import { saveSession, withBackendSession } from '@/lib/session/server'

/**
 * Changes the password. The Backend revokes every token, this session's included, and returns a
 * new one; storing it keeps this browser signed in. The new token starts a new refresh chain, so
 * the session's refresh window starts again too. Other browsers are signed out on their next
 * request.
 */
export async function PUT(request: Request) {
  return respond(async () => {
    const body = await readJson(request)
    const field = (name: string) => (typeof body[name] === 'string' ? body[name] : '')
    const { result, session } = await withBackendSession(request, (token, forwardedFor) =>
      backendClient({ token, forwardedFor }).PUT('/v1/auth/password', {
        body: {
          current_password: field('current_password'),
          password: field('password'),
          password_confirmation: field('password_confirmation'),
        },
      }),
    )
    const { data, error, response } = result

    if (!data) throw backendErrorFrom(response, error)

    await saveSession(startSession(session.user, tokenSetFromResponse(data)))

    return new Response(null, { status: 204 })
  })
}
