import { prepareStatement } from '../connection'

export class KvCacheRepository {
  /**
   * Get a cached value by namespace and key.
   * Returns null if missing or expired.
   */
  get<T = unknown>(namespace: string, key: string): T | null {
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
    try {
      const now = Date.now()
      const expiresAt = ttlMs && ttlMs > 0 ? now + ttlMs : null
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
