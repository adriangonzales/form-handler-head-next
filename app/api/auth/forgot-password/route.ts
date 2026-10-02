import { NextResponse } from 'next/server'
import { backendClient, clientIp } from '@/lib/backend/client'
import { backendErrorFrom } from '@/lib/backend/errors'
import { readJson, respond } from '@/lib/http'

/** Asks The Backend to email a reset link. It answers the same whether or not the account exists. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request)
    const { data, error, response } = await backendClient({
      forwardedFor: clientIp(request.headers),
    }).POST('/v1/auth/forgot-password', { body: { email: String(body.email ?? '') } })

    if (!data) throw backendErrorFrom(response, error)

    return NextResponse.json(data)
  })
}
