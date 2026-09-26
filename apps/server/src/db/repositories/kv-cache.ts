import { prepareStatement, isDatabaseActive } from '../connection'

interface MemoryCacheEntry {
  value: unknown
  expiresAt: number | null
}

export class KvCacheRepository {
  /** 内存降级存储（当数据库未启用时作为进程内轻量 KV 缓存） */
  private memoryStore = new Map<string, Map<string, MemoryCacheEntry>>()

  private getMemoryNamespace(namespace: string): Map<string, MemoryCacheEntry> {
    let ns = this.memoryStore.get(namespace)
    if (!ns) {
      ns = new Map<string, MemoryCacheEntry>()
      this.memoryStore.set(namespace, ns)
    }
    return ns
  }

  /**
   * Get a cached value by namespace and key.
   * Returns null if missing or expired.
   */
  get<T = unknown>(namespace: string, key: string): T | null {
    if (!isDatabaseActive()) {
      const ns = this.memoryStore.get(namespace)
      if (!ns) return null
      const entry = ns.get(key)
      if (!entry) return null
      if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
        ns.delete(key)
        return null
      }
      return entry.value as T
    }

    try {
      const now = Date.now()
      const stmt = prepareStatement(`
        SELECT value, expires_at
        FROM kv_cache
        WHERE namespace = ? AND key = ? AND (expires_at IS NULL OR expires_at > ?)
        LIMIT 1;
      `)
      const row = stmt.get(namespace, key, now) as { value: string; expires_at: number | null } | undefined
      if (!row) return null

      try {
        return JSON.parse(row.value) as T
      } catch {
        return row.value as unknown as T
      }
    } catch (err) {
      console.error(`[db:kv-cache] get error (${namespace}:${key}):`, err)
      return null
    }
  }

  /**
   * Store a value in KV cache with optional TTL.
   */
  set<T = unknown>(namespace: string, key: string, value: T, ttlMs?: number): void {
    if (!isDatabaseActive()) {
      const ns = this.getMemoryNamespace(namespace)
      const expiresAt = typeof ttlMs === 'number' ? Date.now() + ttlMs : null
      ns.set(key, { value, expiresAt })
      return
    }

    try {
      const now = Date.now()
      const expiresAt = typeof ttlMs === 'number' ? now + ttlMs : null
      const serialized = typeof value === 'string' ? value : JSON.stringify(value)

      const stmt = prepareStatement(`
        INSERT INTO kv_cache (namespace, key, value, created_at, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(namespace, key) DO UPDATE SET
          value = excluded.value,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at;
      `)

      stmt.run(namespace, key, serialized, now, expiresAt, now)
    } catch (err) {
      console.error(`[db:kv-cache] set error (${namespace}:${key}):`, err)
    }
  }

  /**
   * Delete a specific key from KV cache.
   */
  delete(namespace: string, key: string): boolean {
    if (!isDatabaseActive()) {
      const ns = this.memoryStore.get(namespace)
      return ns ? ns.delete(key) : false
    }

    try {
      const stmt = prepareStatement(`
        DELETE FROM kv_cache
        WHERE namespace = ? AND key = ?;
      `)
      const res = stmt.run(namespace, key)
      return Number(res.changes) > 0
    } catch (err) {
      console.error(`[db:kv-cache] delete error (${namespace}:${key}):`, err)
      return false
    }
  }

  /**
   * Delete all keys in a given namespace.
   */
  deleteNamespace(namespace: string): number {
    if (!isDatabaseActive()) {
      const ns = this.memoryStore.get(namespace)
      if (!ns) return 0
      const count = ns.size
      this.memoryStore.delete(namespace)
      return count
    }

    try {
      const stmt = prepareStatement(`
        DELETE FROM kv_cache
        WHERE namespace = ?;
      `)
      const res = stmt.run(namespace)
      return Number(res.changes)
    } catch (err) {
      console.error(`[db:kv-cache] deleteNamespace error (${namespace}):`, err)
      return 0
    }
  }

  /**
   * List all valid (unexpired) keys in a namespace.
   */
  keys(namespace: string): string[] {
    if (!isDatabaseActive()) {
      const ns = this.memoryStore.get(namespace)
      if (!ns) return []
      const now = Date.now()
      const result: string[] = []
      for (const [key, entry] of ns.entries()) {
        if (entry.expiresAt === null || now <= entry.expiresAt) {
          result.push(key)
        }
      }
      return result.sort()
    }

    try {
      const now = Date.now()
      const stmt = prepareStatement(`
        SELECT key
        FROM kv_cache
        WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY key ASC;
      `)
      const rows = stmt.all(namespace, now) as Array<{ key: string }>
      return rows.map((r) => r.key)
    } catch (err) {
      console.error(`[db:kv-cache] keys error (${namespace}):`, err)
      return []
    }
  }

  /**
   * Clean up all expired entries in kv_cache.
   */
  clearExpired(): number {
    if (!isDatabaseActive()) {
      const now = Date.now()
      let cleared = 0
      for (const ns of this.memoryStore.values()) {
        for (const [key, entry] of ns.entries()) {
          if (entry.expiresAt !== null && now > entry.expiresAt) {
            ns.delete(key)
            cleared++
          }
        }
      }
      return cleared
    }

    try {
      const now = Date.now()
      const stmt = prepareStatement(`
        DELETE FROM kv_cache
        WHERE expires_at IS NOT NULL AND expires_at <= ?;
      `)
      const res = stmt.run(now)
      return Number(res.changes)
    } catch (err) {
      console.error('[db:kv-cache] clearExpired error:', err)
      return 0
    }
  }
}

export const kvCache = new KvCacheRepository()
