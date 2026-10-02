import { backendHeaders } from '@/lib/backend/client'
import { isProxyablePath } from '@/lib/backend/proxy-path'
import { serverEnv } from '@/lib/env'
import { HttpError, respond } from '@/lib/http'
import { withBackendToken } from '@/lib/session/server'

/**
 * Authenticated pass-through to The Backend: `/api/backend/**` → `{BACKEND_API_URL}/v1/**` with the
 * session's bearer token. Status, JSON body and Retry-After are relayed unchanged.
 *
 * Auth and account endpoints aren't proxied: they change the session too, so they have their own
 * routes under /api/auth. Webhooks are for The Backend's providers, not for browsers.
 */
async function handler(request: Request, { params }: RouteContext<'/api/backend/[...path]'>) {
  return respond(async () => {
    // Next.js has already decoded each segment, so an encoded `%2e%2e` arrives as `..` here and is
    // rejected rather than normalised away by the URL parser when forwarding.
    const path = (await params).path.join('/')

    if (!isProxyablePath(path)) throw new HttpError(404, 'Not found.')

    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text()
    const search = new URL(request.url).search
    const url = `${serverEnv().BACKEND_API_URL}/v1/${path.split('/').map(encodeURIComponent).join('/')}${search}`

    const { response } = await withBackendToken(request, async (token, forwardedFor) => {
      const headers = backendHeaders({ token, forwardedFor })

      if (body !== undefined) {
        headers['Content-Type'] = request.headers.get('content-type') ?? 'application/json'
      }

      return { response: await fetch(url, { method: request.method, headers, body }) }
    })

    const headers = new Headers()

    for (const name of ['content-type', 'retry-after']) {
      const value = response.headers.get(name)

      if (value) headers.set(name, value)
    }

    return new Response(response.status === 204 ? null : await response.text(), {
      status: response.status,
      headers,
    })
  })
}

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT }
