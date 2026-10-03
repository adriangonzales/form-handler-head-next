import { describe, expect, it, vi } from 'vitest'
import {
  type RefreshAtBackend,
  RefreshCoordinator,
  type RefreshResultCodec,
  RefreshStoreError,
  RefreshTimeoutError,
} from '../../lib/session/refresh-coordinator'
import { MemoryRefreshStore, type RefreshStore } from '../../lib/session/refresh-store'
import type { TokenSet } from '../../lib/session/token-action'

const fresh: TokenSet = { token: 'new-token', expiresAt: 1_000_000 }

// JSON stands in for the sealing done in production; the coordinator only needs a round trip.
const codec: RefreshResultCodec = {
  seal: async (result) => JSON.stringify({ result }),
  unseal: async (sealed) => JSON.parse(sealed).result,
}

const yieldOnce = () => new Promise<void>((resolve) => setImmediate(resolve))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

function coordinatorOn(store: RefreshStore, now?: () => number) {
  return new RefreshCoordinator(store, codec, { now, pollMs: 1, sleep: yieldOnce })
}

describe('RefreshCoordinator', () => {
  it('shares one refresh between concurrent requests for the same token', async () => {
    const coordinator = coordinatorOn(new MemoryRefreshStore())
    const call = deferred<TokenSet | null>()
    const refreshAtBackend = vi.fn<RefreshAtBackend>(() => call.promise)

    const results = Array.from({ length: 10 }, () =>
      coordinator.refresh('old-token', refreshAtBackend),
    )
    await yieldOnce()
    call.resolve(fresh)

    expect(await Promise.all(results)).toEqual(Array(10).fill(fresh))
    expect(refreshAtBackend).toHaveBeenCalledTimes(1)
  })

  it('shares one refresh between server instances using the same store', async () => {
    const store = new MemoryRefreshStore()
    const instances = [coordinatorOn(store), coordinatorOn(store)]
    const call = deferred<TokenSet | null>()
    const refreshAtBackend = vi.fn<RefreshAtBackend>(() => call.promise)

    const results = instances.flatMap((coordinator) =>
      Array.from({ length: 5 }, () => coordinator.refresh('old-token', refreshAtBackend)),
    )
    await yieldOnce()
    call.resolve(fresh)

    expect(await Promise.all(results)).toEqual(Array(10).fill(fresh))
    expect(refreshAtBackend).toHaveBeenCalledTimes(1)
  })

  it('reuses a finished refresh for late requests still carrying the old token', async () => {
    let now = 0
    const coordinator = coordinatorOn(new MemoryRefreshStore(() => now), () => now)
    const refreshAtBackend = vi.fn<RefreshAtBackend>(async () => fresh)

    await coordinator.refresh('old-token', refreshAtBackend)
    now = 59_000

    expect(await coordinator.wasRefreshed('old-token')).toBe(true)
    expect(await coordinator.refresh('old-token', refreshAtBackend)).toEqual(fresh)
    expect(refreshAtBackend).toHaveBeenCalledTimes(1)
  })

  it('tells a render which token other requests refreshed its token to, without refreshing', async () => {
    const coordinator = coordinatorOn(new MemoryRefreshStore())
    const second: TokenSet = { token: 'newer-token', expiresAt: 2_000_000 }

    expect(await coordinator.refreshedTo('old-token')).toBeNull()

    await coordinator.refresh('old-token', async () => fresh)
    expect(await coordinator.refreshedTo('old-token')).toEqual(fresh)

    // The browser moved on again with the new token: follow the chain to the newest one.
    await coordinator.refresh('new-token', async () => second)
    expect(await coordinator.refreshedTo('old-token')).toEqual(second)

    // A refused refresh ends the chain where it was.
    await coordinator.refresh('newer-token', async () => null)
    expect(await coordinator.refreshedTo('old-token')).toEqual(second)
  })

  it('forgets a refresh after a minute', async () => {
    let now = 0
    const coordinator = coordinatorOn(new MemoryRefreshStore(() => now), () => now)

    await coordinator.refresh('old-token', async () => fresh)
    now = 60_000

    expect(await coordinator.wasRefreshed('old-token')).toBe(false)
  })

  it('remembers a rejected refresh (401), so the old token is not sent again', async () => {
    const coordinator = coordinatorOn(new MemoryRefreshStore())
    const refreshAtBackend = vi.fn<RefreshAtBackend>(async () => null)

    expect(await coordinator.refresh('revoked', refreshAtBackend)).toBeNull()
    expect(await coordinator.refresh('revoked', refreshAtBackend)).toBeNull()
    expect(refreshAtBackend).toHaveBeenCalledTimes(1)
  })

  it("doesn't remember a failed call, so the next request can try again", async () => {
    const coordinator = coordinatorOn(new MemoryRefreshStore())
    const refreshAtBackend = vi
      .fn<RefreshAtBackend>()
      .mockRejectedValueOnce(new Error('Backend down'))
      .mockResolvedValueOnce(fresh)

    await expect(coordinator.refresh('old-token', refreshAtBackend)).rejects.toThrow('Backend down')

    expect(await coordinator.wasRefreshed('old-token')).toBe(false)
    expect(await coordinator.refresh('old-token', refreshAtBackend)).toEqual(fresh)
  })

  it('keeps tokens out of the store: keys are hashes and values are sealed', async () => {
    const store = new MemoryRefreshStore()
    const set = vi.spyOn(store, 'set')
    const setIfAbsent = vi.spyOn(store, 'setIfAbsent')

    await coordinatorOn(store).refresh('old-token', async () => fresh)

    const keys = [...set.mock.calls, ...setIfAbsent.mock.calls].map(([key]) => key)

    expect(keys.join()).not.toContain('old-token')
    expect(set.mock.calls[0]?.[1]).toBe(await codec.seal(fresh))
  })

  it('reports an unreachable store as RefreshStoreError', async () => {
    const store = new MemoryRefreshStore()
    vi.spyOn(store, 'get').mockRejectedValue(new Error('ECONNREFUSED'))
    const coordinator = coordinatorOn(store)

    await expect(coordinator.wasRefreshed('t')).rejects.toBeInstanceOf(RefreshStoreError)
    await expect(coordinator.refresh('t', async () => fresh)).rejects.toBeInstanceOf(
      RefreshStoreError,
    )
  })

  it('gives up waiting when another refresh holds the lock too long', async () => {
    let now = 0
    const store = new MemoryRefreshStore(() => 0)
    const coordinator = new RefreshCoordinator(store, codec, {
      lockTtlMs: 1_000,
      now: () => now,
      sleep: async () => {
        now += 500
      },
    })

    void coordinator.refresh('old-token', () => new Promise(() => {}))
    await yieldOnce()

    await expect(coordinator.refresh('old-token', async () => fresh)).rejects.toBeInstanceOf(
      RefreshTimeoutError,
    )
  })
})
