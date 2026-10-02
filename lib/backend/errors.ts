/**
 * A non-2xx answer from The Backend, normalised to the contract's error shape: `message`, field
 * errors keyed by dot path (`settings.honeypot_name`, `ids.3`), and `Retry-After` for 429.
 */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'BackendError'
  }

  /** The JSON body to relay to the browser. */
  toJSON() {
    return Object.keys(this.fieldErrors).length > 0
      ? { message: this.message, errors: this.fieldErrors }
      : { message: this.message }
  }
}

export function backendErrorFrom(response: Response, body: unknown): BackendError {
  const data = (typeof body === 'object' && body !== null ? body : {}) as {
    message?: unknown
    errors?: unknown
  }
  const message =
    typeof data.message === 'string' && data.message !== ''
      ? data.message
      : response.statusText || `The Backend answered ${response.status}.`
  const retryAfter = Number(response.headers.get('retry-after'))

  return new BackendError(
    response.status,
    message,
    isFieldErrors(data.errors) ? data.errors : {},
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  )
}

export function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (messages) => Array.isArray(messages) && messages.every((m) => typeof m === 'string'),
    )
  )
}
