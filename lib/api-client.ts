import { loginUrl } from './redirect'

/** A failed request to this app's routes, in the contract's error shape. */
export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never got a response. */
    readonly status: number,
    message: string,
    /** Field errors from a 422, keyed by dot path (`settings.honeypot_name`, `ids.3`). */
    readonly errors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Calls one of this app's routes (`/api/**`) and parses the JSON answer. Throws ApiError for any
 * non-2xx answer, and for a network failure (status 0).
 */
export async function apiRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  const text = await response.text()
  const body: unknown = text ? safeJson(text) : null

  if (!response.ok) throw apiErrorFrom(response.status, body)

  return body as T
}

/**
 * Calls The Backend through the authenticated proxy (`/api/backend/**`). A 401 means the session
 * is over, so the user is sent to the login page with a way back here.
 */
export async function backendRequest<T = unknown>(
  path: `/${string}`,
  init?: RequestInit,
): Promise<T> {
  try {
    return await apiRequest<T>(`/api/backend${path}`, init)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      window.location.assign(
        loginUrl({ reason: 'expired', next: window.location.pathname + window.location.search }),
      )
    }

    throw error
  }
}

function apiErrorFrom(status: number, body: unknown): ApiError {
  const data = (typeof body === 'object' && body !== null ? body : {}) as {
    message?: unknown
    errors?: unknown
  }
  const message =
    typeof data.message === 'string' && data.message !== ''
      ? data.message
      : 'Something went wrong. Please try again.'

  return new ApiError(status, message, isFieldErrors(data.errors) ? data.errors : {})
}

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (messages) => Array.isArray(messages) && messages.every((m) => typeof m === 'string'),
    )
  )
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
