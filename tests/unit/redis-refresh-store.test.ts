import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  type RefreshAtBackend,
  RefreshCoordinator,
  type RefreshResultCodec,
} from '../../lib/session/refresh-coordinator'
import { RedisRefreshStore } from '../../lib/session/redis-refresh-store'

// Runs against a real Redis when REDIS_URL is set (`pnpm services:up`), and is skipped otherwise.
const url = process.env.REDIS_URL

const codec: RefreshResultCodec = {
  seal: async (result) => JSON.stringify({ result }),
  unseal: async (sealed) => JSON.parse(sealed).result,
}

describe.skipIf(!url)('RedisRefreshStore', () => {
  const stores: RedisRefreshStore[] = []
  const store = () => {
    const created = RedisRefreshStore.connect(url!)

    stores.push(created)

    return created
  }

  afterAll(() => stores.forEach((created) => created.disconnect()))

  it('shares one refresh between two server instances', async () => {
    const token = `token-${Date.now()}-${Math.random()}`
    const instances = [store(), store()].map((s) => new RefreshCoordinator(s, codec, { pollMs: 5 }))
    const refreshAtBackend = vi.fn<RefreshAtBackend>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))

      return { token: 'new-token', expiresAt: 1 }
    })

    const results = await Promise.all(
      instances.flatMap((coordinator) =>
        Array.from({ length: 5 }, () => coordinator.refresh(token, refreshAtBackend)),
      ),
    )

    expect(results).toEqual(Array(10).fill({ token: 'new-token', expiresAt: 1 }))
    expect(refreshAtBackend).toHaveBeenCalledTimes(1)
    expect(await instances[1]!.wasRefreshed(token)).toBe(true)
  })

  it('only releases a lock held by the same owner', async () => {
    const redis = store()
    const key = `lock-test-${Date.now()}`

    expect(await redis.setIfAbsent(key, 'a', 5_000)).toBe(true)
    expect(await redis.setIfAbsent(key, 'b', 5_000)).toBe(false)

    await redis.deleteIfEquals(key, 'b')
    expect(await redis.get(key)).toBe('a')

    await redis.deleteIfEquals(key, 'a')
    expect(await redis.get(key)).toBeNull()
  })
})
