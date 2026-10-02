import 'server-only'
import { Redis } from 'ioredis'
import type { RefreshStore } from './refresh-store'

const deleteIfEqualsScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`

/**
 * Refresh coordination in Redis. Commands sent while the connection is still opening wait for it,
 * but every command gives up after a second, and after one reconnection attempt, so a request
 * fails fast with 503 while Redis is unreachable instead of hanging.
 */
export class RedisRefreshStore implements RefreshStore {
  constructor(private readonly redis: Redis) {}

  static connect(url: string): RedisRefreshStore {
    return new RedisRefreshStore(
      new Redis(url, {
        maxRetriesPerRequest: 1,
        commandTimeout: 1_000,
        connectTimeout: 1_000,
        keyPrefix: 'form-handler:refresh:',
      }).on('error', (error) => console.error(`Redis: ${error.message}`)),
    )
  }

  async get(key: string) {
    return this.redis.get(key)
  }

  disconnect() {
    this.redis.disconnect()
  }

  async set(key: string, value: string, ttlMs: number) {
    await this.redis.set(key, value, 'PX', ttlMs)
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    return (await this.redis.set(key, value, 'PX', ttlMs, 'NX')) === 'OK'
  }

  async deleteIfEquals(key: string, value: string) {
    await this.redis.eval(deleteIfEqualsScript, 1, key, value)
  }
}
