import 'server-only'
import { refreshToken } from '@/lib/backend/auth'
import { serverEnv } from '@/lib/env'
import { refreshCoordinator } from './coordinator'
import { RefreshStoreError, RefreshTimeoutError } from './refresh-coordinator'
import type { Session } from './session'
import { tokenAction } from './token-action'

export type SessionTokenOutcome =
  /** Use `session.token`. When `refreshed`, the caller must save the session cookie. */
  | { kind: 'ok'; session: Session; refreshed: boolean }
  /** The refresh window ended, or The Backend refused to refresh: clear the session. */
  | { kind: 'ended' }
  /** The Backend (502) or the session store (503) couldn't be reached. Keep the session. */
  | { kind: 'unavailable'; status: 502 | 503; message: string }

/**
 * Gets a usable token for a session, refreshing it first when it expires within
 * AUTH_REFRESH_AHEAD_SECONDS, when another request already refreshed it, or when `forceRefresh`
 * is set (after The Backend answered 401).
 */
export async function resolveSessionToken(
  session: Session,
  { forceRefresh = false, forwardedFor }: { forceRefresh?: boolean; forwardedFor?: string } = {},
): Promise<SessionTokenOutcome> {
  const coordinator = refreshCoordinator()

  try {
    const action = tokenAction(session, {
      now: Date.now(),
      refreshAheadMs: serverEnv().AUTH_REFRESH_AHEAD_SECONDS * 1000,
      forceRefresh,
      wasRefreshed: await coordinator.wasRefreshed(session.token),
    })

    if (action === 'expired') return { kind: 'ended' }
    if (action === 'use') return { kind: 'ok', session, refreshed: false }

    const tokens = await coordinator.refresh(session.token, (token) =>
      refreshToken(token, forwardedFor),
    )

    return tokens
      ? { kind: 'ok', session: { ...session, ...tokens }, refreshed: true }
      : { kind: 'ended' }
  } catch (error) {
    if (error instanceof RefreshStoreError || error instanceof RefreshTimeoutError) {
      return {
        kind: 'unavailable',
        status: 503,
        message: 'Service temporarily unavailable. Please try again.',
      }
    }

    return { kind: 'unavailable', status: 502, message: 'The Backend could not be reached.' }
  }
}
