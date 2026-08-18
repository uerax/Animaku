import type { PluginSearchResult } from '@animaku/shared'
import { getDatabase, prepareStatement } from '../connection'

export interface PluginSearchCacheRow {
  key: string
  plugin_name: string
  keyword: string
  rule_hash: string
  data: string
  created_at: number
  expires_at: number
  hit_count: number
  updated_at: number
}

export class PluginSearchCacheRepository {
  /**
   * Retrieve cached search result by cache key.
   * Returns null if missing or expired.
   */
  get(key: string): PluginSearchResult | null {
    try {
      const now = Date.now()
      const stmt = prepareStatement(`
        SELECT data, expires_at
        FROM plugin_search_cache
        WHERE key = ? AND expires_at > ?
        LIMIT 1;
      `)
      const row = stmt.get(key, now) as { data: string; expires_at: number } | undefined
      if (!row) return null

      // Bump hit count asynchronously/fire-and-forget
      try {
        const updateStmt = prepareStatement(`
          UPDATE plugin_search_cache
          SET hit_count = hit_count + 1
          WHERE key = ?;
        `)
        updateStmt.run(key)
      } catch {
        /* ignore hit count update error */
      }

      return JSON.parse(row.data) as PluginSearchResult
    } catch (err) {
      console.error('[db:plugin-search] get error:', err)
      return null
    }
  }

  /**
   * Store search result in SQLite with expiration timestamp.
   */
  set(
    key: string,
    pluginName: string,
    keyword: string,
    ruleHash: string,
    data: PluginSearchResult,
    ttlMs: number,
  ): void {
    if (ttlMs <= 0) return
    try {
      const now = Date.now()
      const expiresAt = now + ttlMs
      const serialized = JSON.stringify(data)

      const stmt = prepareStatement(`
        INSERT INTO plugin_search_cache (
          key, plugin_name, keyword, rule_hash, data, created_at, expires_at, hit_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(key) DO UPDATE SET
          plugin_name = excluded.plugin_name,
          keyword = excluded.keyword,
          rule_hash = excluded.rule_hash,
          data = excluded.data,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at;
      `)

      stmt.run(key, pluginName, keyword, ruleHash, serialized, now, expiresAt, now)
    } catch (err) {
      console.error('[db:plugin-search] set error:', err)
    }
  }

  /**
   * Invalidate / delete specific search cache by key.
   */
  delete(key: string): void {
    try {
      const stmt = prepareStatement(`DELETE FROM plugin_search_cache WHERE key = ?;`)
      stmt.run(key)
    } catch (err) {
      console.error('[db:plugin-search] delete error:', err)
    }
  }

  /**
   * Invalidate search cache for a given plugin name, optionally filtered by keyword.
   */
  deleteByPlugin(pluginName: string, keyword?: string): number {
    try {
      if (keyword) {
        const stmt = prepareStatement(`
          DELETE FROM plugin_search_cache
          WHERE plugin_name = ? AND keyword = ?;
        `)
        const res = stmt.run(pluginName, keyword.toLowerCase().trim())
        return Number(res.changes)
      }
      const stmt = prepareStatement(`
        DELETE FROM plugin_search_cache
        WHERE plugin_name = ?;
      `)
      const res = stmt.run(pluginName)
      return Number(res.changes)
    } catch (err) {
      console.error('[db:plugin-search] deleteByPlugin error:', err)
      return 0
    }
  }

  /**
   * Prune expired cache records to keep database size compact.
   */
  clearExpired(): number {
    try {
      const now = Date.now()
      const stmt = prepareStatement(`DELETE FROM plugin_search_cache WHERE expires_at <= ?;`)
      const res = stmt.run(now)
      return Number(res.changes)
    } catch (err) {
      console.error('[db:plugin-search] clearExpired error:', err)
      return 0
    }
  }

  /**
   * Get search cache operational metrics.
   */
  getStats(): { totalEntries: number; validEntries: number; totalHits: number } {
    try {
      const now = Date.now()
      const db = getDatabase()
      const totalRow = db.prepare('SELECT COUNT(*) as count, SUM(hit_count) as hits FROM plugin_search_cache;').get() as { count: number; hits: number | null } | undefined
      const validRow = db.prepare('SELECT COUNT(*) as count FROM plugin_search_cache WHERE expires_at > ?;').get(now) as { count: number } | undefined

      return {
        totalEntries: Number(totalRow?.count ?? 0),
        validEntries: Number(validRow?.count ?? 0),
        totalHits: Number(totalRow?.hits ?? 0),
      }
    } catch (err) {
      console.error('[db:plugin-search] getStats error:', err)
      return { totalEntries: 0, validEntries: 0, totalHits: 0 }
    }
  }
}

export const pluginSearchCache = new PluginSearchCacheRepository()
