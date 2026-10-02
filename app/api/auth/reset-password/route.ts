import { NextResponse } from 'next/server'
import { backendClient, clientIp } from '@/lib/backend/client'
import { backendErrorFrom } from '@/lib/backend/errors'
import { readJson, respond } from '@/lib/http'

/** Sets a new password from an emailed reset token. The user then signs in again. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request)
    const field = (name: string) => String(body[name] ?? '')
    const { data, error, response } = await backendClient({
      forwardedFor: clientIp(request.headers),
    }).POST('/v1/auth/reset-password', {
      body: {
        token: field('token'),
        email: field('email'),
        password: field('password'),
        password_confirmation: field('password_confirmation'),
      },
    })

    if (!data) throw backendErrorFrom(response, error)

    return NextResponse.json(data)
  })
}
