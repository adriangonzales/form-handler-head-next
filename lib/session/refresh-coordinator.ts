import { createHash, randomUUID } from 'node:crypto'
import type { RefreshStore } from './refresh-store'
import type { TokenSet } from './token-action'

/**
 * Exchanges a token for a new one at The Backend. Resolves `null` when The Backend rejects the
 * token (401: refresh window ended, or revoked), and rejects on anything else (network, 5xx), so a
 * transient failure never signs the user out.
 */
export type RefreshAtBackend = (token: string) => Promise<TokenSet | null>

/** Encrypts results at rest, so the store never holds a usable token. */
export interface RefreshResultCodec {
  seal(result: TokenSet | null): Promise<string>
  unseal(sealed: string): Promise<TokenSet | null>
}

/** The coordinator's store (Redis) couldn't be reached. Requests answer 503 and keep the session. */
export class RefreshStoreError extends Error {
  constructor(cause: unknown) {
    super('The session store could not be reached.', { cause })
  }
}

/** Another request held the refresh lock for too long. Treated like an unreachable store. */
export class RefreshTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for another request to refresh the session.')
  }
}

export interface RefreshCoordinatorOptions {
  /** How long a finished refresh's result is reused for requests still carrying the old token. */
  resultTtlMs?: number
  /** How long a refresh may hold the lock. Longer than a refresh call can take. */
  lockTtlMs?: number
  pollMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Makes sure each token is refreshed at most once, across requests, tabs and server instances.
 *
 * Refreshing invalidates the old token at The Backend, so concurrent requests carrying the same
 * token must share one refresh. The first takes a lock and refreshes; the others wait for its
 * result. The result is kept for a minute under the old token, so requests that arrive later still
 * carrying it (a browser that hasn't stored the new cookie yet) reuse it instead of sending an
 * invalidated token. Keys are hashes of tokens, and results are sealed.
 */
export class RefreshCoordinator {
  private readonly resultTtlMs: number
  private readonly lockTtlMs: number
  private readonly pollMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private readonly store: RefreshStore,
    private readonly codec: RefreshResultCodec,
    options: RefreshCoordinatorOptions = {},
  ) {
    this.resultTtlMs = options.resultTtlMs ?? 60_000
    this.lockTtlMs = options.lockTtlMs ?? 10_000
    this.pollMs = options.pollMs ?? 50
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /** Whether `token` was refreshed recently, so The Backend no longer accepts it. */
  async wasRefreshed(token: string): Promise<boolean> {
    return (await this.storeCall(() => this.store.get(resultKey(token)))) !== null
  }

  async refresh(token: string, refreshAtBackend: RefreshAtBackend): Promise<TokenSet | null> {
    const deadline = this.now() + this.lockTtlMs * 2

    for (;;) {
      const stored = await this.storeCall(() => this.store.get(resultKey(token)))

      if (stored !== null) {
        return this.codec.unseal(stored)
      }

      const owner = randomUUID()
      const locked = await this.storeCall(() =>
        this.store.setIfAbsent(lockKey(token), owner, this.lockTtlMs),
      )

      if (locked) {
        try {
          const result = await refreshAtBackend(token)
          const sealed = await this.codec.seal(result)

          await this.storeCall(() => this.store.set(resultKey(token), sealed, this.resultTtlMs))

          return result
        } finally {
          // A failed refresh isn't remembered, so the next request can try again.
          await this.storeCall(() => this.store.deleteIfEquals(lockKey(token), owner)).catch(
            () => undefined,
          )
        }
      }

      if (this.now() >= deadline) {
        throw new RefreshTimeoutError()
      }

      await this.sleep(this.pollMs)
    }
  }

  private async storeCall<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      throw new RefreshStoreError(error)
    }
  }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

function resultKey(token: string) {
  return `result:${tokenHash(token)}`
}

function lockKey(token: string) {
  return `lock:${tokenHash(token)}`
}
