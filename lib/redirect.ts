import type { Route } from 'next'

/**
 * Returns `target` when it is a same-site path, otherwise `fallback`, so a `?next=` value can't
 * send the user to another site (`//evil.example`, `https://…`, `/\evil.example`).
 */
export function safeRedirect(target: unknown, fallback = '/forms'): string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) {
    return fallback
  }

  if (target.includes('\\') || /\p{Cc}/u.test(target)) {
    return fallback
  }

  return target
}

/** Why the user is on the login page, shown as a notice there. */
export const signedOutReasons = {
  expired: 'Your session has expired. Please sign in again.',
  'signed-out': "You've been signed out.",
  'password-reset': 'Password reset. Sign in with your new password.',
  deleted: 'Your account has been deleted.',
} as const

export type SignedOutReason = keyof typeof signedOutReasons

/** The login URL with a reason and a way back to `next`. */
export function loginUrl(options: { next?: string; reason?: SignedOutReason } = {}): Route {
  const params = new URLSearchParams()

  if (options.reason) params.set('reason', options.reason)
  if (options.next && options.next !== '/' && safeRedirect(options.next, '') !== '') {
    params.set('next', options.next)
  }

  const query = params.toString()

  return (query ? `/login?${query}` : '/login') as Route
}
