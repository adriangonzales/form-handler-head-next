import 'server-only'
import { NextResponse } from 'next/server'
import { MissingTokenError } from '@/lib/backend/auth'
import { BackendError } from '@/lib/backend/errors'

/** An error a route handler answers with `{ message }` and its status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const unauthenticated = () => new HttpError(401, 'Unauthenticated.')

/**
 * Runs a route handler, turning thrown errors into the contract's JSON error responses:
 * HttpError and BackendError keep their status (and Retry-After); a network failure reaching
 * The Backend is 502.
 */
export async function respond(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler()
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }

    if (error instanceof BackendError) {
      return NextResponse.json(error.toJSON(), {
        status: error.status,
        headers: error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined,
      })
    }

    if (error instanceof MissingTokenError || isNetworkFailure(error)) {
      return NextResponse.json({ message: 'The Backend could not be reached.' }, { status: 502 })
    }

    throw error
  }
}

/** fetch() rejects with `TypeError: fetch failed` when the other side can't be reached. */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'fetch failed'
}

/** Reads a JSON body, answering 400 when it's missing or not an object. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null)

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Expected a JSON object.')
  }

  return body as Record<string, unknown>
}
