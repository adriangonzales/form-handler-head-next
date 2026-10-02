import 'server-only'
import { sealData, unsealData } from 'iron-session'
import { serverEnv } from '@/lib/env'
import { RefreshCoordinator } from './refresh-coordinator'
import { MemoryRefreshStore, type RefreshStore } from './refresh-store'
import { RedisRefreshStore } from './redis-refresh-store'
import type { TokenSet } from './token-action'

const globalForCoordinator = globalThis as unknown as { refreshCoordinator?: RefreshCoordinator }

/**
 * The process's refresh coordinator: on Redis when REDIS_URL is set (required in production), in
 * memory otherwise. Kept on globalThis so development reloads don't create a second one.
 */
export function refreshCoordinator(): RefreshCoordinator {
  globalForCoordinator.refreshCoordinator ??= createCoordinator()

  return globalForCoordinator.refreshCoordinator
}

function createCoordinator(): RefreshCoordinator {
  const { REDIS_URL, SESSION_SECRET } = serverEnv()
  const store: RefreshStore = REDIS_URL
    ? RedisRefreshStore.connect(REDIS_URL)
    : new MemoryRefreshStore()

  return new RefreshCoordinator(store, {
    seal: (result) => sealData({ result }, { password: SESSION_SECRET, ttl: 120 }),
    unseal: async (sealed) =>
      (
        await unsealData<{ result?: TokenSet | null }>(sealed, {
          password: SESSION_SECRET,
          ttl: 120,
        })
      ).result ?? null,
  })
}
