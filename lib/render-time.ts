import 'server-only'

/**
 * When a Server Component rendered, passed to client components that show time-dependent labels
 * so the browser's first render matches the server's. A Server Component renders once per request,
 * so reading the clock there is safe.
 */
export function renderTime(): number {
  return Date.now()
}
