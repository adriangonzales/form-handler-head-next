/**
 * Shared storage for the refresh coordinator. Redis in production, so every server instance sees
 * the same locks and results; memory for tests and a single development server.
 */
export interface RefreshStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlMs: number): Promise<void>
  /** Sets `key` only if it doesn't exist. Resolves whether it was set. */
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>
  /** Deletes `key` only if it still holds `value`, so a lock is only released by its owner. */
  deleteIfEquals(key: string, value: string): Promise<void>
}

/** In-process store. Each method checks and changes the map synchronously, so `setIfAbsent` is atomic. */
export class MemoryRefreshStore implements RefreshStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string) {
    return this.read(key)
  }

  async set(key: string, value: string, ttlMs: number) {
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs })
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    if (this.read(key) !== null) return false

    this.entries.set(key, { value, expiresAt: this.now() + ttlMs })

    return true
  }

  async deleteIfEquals(key: string, value: string) {
    if (this.read(key) === value) this.entries.delete(key)
  }

  private read(key: string): string | null {
    const entry = this.entries.get(key)

    if (!entry) return null

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)

      return null
    }

    return entry.value
  }
}
