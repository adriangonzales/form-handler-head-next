/**
 * Whether a decoded `/api/backend/**` path may be forwarded to The Backend. Rejects empty and dot
 * segments, and the auth and webhook endpoints, which must not be reachable through the proxy.
 */
export function isProxyablePath(path: string): boolean {
  const segments = path.split('/')

  return (
    path.length > 0 &&
    !segments.some((segment) => segment === '' || segment === '.' || segment === '..') &&
    segments[0] !== 'auth' &&
    segments[0] !== 'webhooks'
  )
}
