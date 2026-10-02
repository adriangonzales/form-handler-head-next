import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser, login } from '@/lib/backend/auth'
import { clientIp } from '@/lib/backend/client'
import { HttpError, readJson, respond } from '@/lib/http'
import { startSession } from '@/lib/session/session'
import { saveSession } from '@/lib/session/server'

const credentials = z.object({ email: z.string(), password: z.string() })

/**
 * Exchanges email and password for a token, loads the user, and starts the session. The token
 * stays in the sealed cookie; the browser only receives the user. The Backend's 422 (wrong
 * credentials) and 429 (throttled) are relayed for the login form.
 */
export async function POST(request: Request) {
  return respond(async () => {
    const parsed = credentials.safeParse(await readJson(request))

    if (!parsed.success) throw new HttpError(400, 'Expected an email and a password.')

    const forwardedFor = clientIp(request.headers)
    const tokens = await login(parsed.data, { forwardedFor })
    const user = await currentUser({ token: tokens.token, forwardedFor }).catch(() => {
      throw new HttpError(502, 'Signed in, but the account could not be loaded.')
    })

    await saveSession(startSession(user, tokens))

    return NextResponse.json({ user })
  })
}
