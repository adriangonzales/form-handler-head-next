export interface TokenSet {
  token: string
  /** When `token` expires, in ms since epoch. */
  expiresAt: number
}

export interface SessionTokens extends TokenSet {
  /** When The Backend stops refreshing this login's token chain, in ms since epoch. */
  refreshableUntil: number
}

/**
 * What to do with a session's token before calling The Backend:
 * - `expired`: the refresh window has ended; the user must sign in again.
 * - `refresh`: refresh first (it expires soon, a refresh was forced after a 401, or another request
 *   already refreshed it, so The Backend no longer accepts it).
 * - `use`: send it as it is.
 */
export function tokenAction(
  tokens: SessionTokens,
  options: { now: number; refreshAheadMs: number; forceRefresh: boolean; wasRefreshed: boolean },
): 'expired' | 'refresh' | 'use' {
  if (options.now >= tokens.refreshableUntil) {
    return 'expired'
  }

  if (
    options.forceRefresh ||
    options.wasRefreshed ||
    tokens.expiresAt - options.now < options.refreshAheadMs
  ) {
    return 'refresh'
  }

  return 'use'
}
