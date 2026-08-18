import type { PluginChapterResult } from '@animaku/shared'
import { getDatabase, prepareStatement } from '../connection'

export interface PluginChaptersCacheRow {
  key: string
  plugin_name: string
  source_url: string
  rule_hash: string
  data: string
  created_at: number
  expires_at: number
  hit_count: number
  updated_at: number
}

export class PluginChaptersCacheRepository {
  /**
   * Retrieve cached chapters result by cache key.
   * Returns null if missing or expired.
   */
  get(key: string): PluginChapterResult | null {
    try {
      const now = Date.now()
      const stmt = prepareStatement(`
        SELECT data, expires_at
        FROM plugin_chapters_cache
        WHERE key = ? AND expires_at > ?
        LIMIT 1;
      `)
      const row = stmt.get(key, now) as { data: string; expires_at: number } | undefined
      if (!row) return null

      // Bump hit count asynchronously / fire-and-forget
      try {
        const updateStmt = prepareStatement(`
          UPDATE plugin_chapters_cache
          SET hit_count = hit_count + 1
          WHERE key = ?;
        `)
        updateStmt.run(key)
      } catch {
        /* ignore hit count update error */
      }

      return JSON.parse(row.data) as PluginChapterResult
    } catch (err) {
      console.error('[db:plugin-chapters] get error:', err)
      return null
    }
  }

  /**
   * Store chapters result in SQLite with expiration timestamp.
   */
  set(
    key: string,
    pluginName: string,
    sourceUrl: string,
    ruleHash: string,
    data: PluginChapterResult,
    ttlMs: number,
  ): void {
    if (ttlMs <= 0) return
    try {
      const now = Date.now()
      const expiresAt = now + ttlMs
      const serialized = JSON.stringify(data)

      const stmt = prepareStatement(`
        INSERT INTO plugin_chapters_cache (
          key, plugin_name, source_url, rule_hash, data, created_at, expires_at, hit_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(key) DO UPDATE SET
          plugin_name = excluded.plugin_name,
          source_url = excluded.source_url,
          rule_hash = excluded.rule_hash,
          data = excluded.data,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at;
      `)

      stmt.run(key, pluginName, sourceUrl, ruleHash, serialized, now, expiresAt, now)
    } catch (err) {
      console.error('[db:plugin-chapters] set error:', err)
    }
  }

  /**
   * Invalidate / delete specific chapters cache by key.
   */
  delete(key: string): void {
    try {
      const stmt = prepareStatement(`DELETE FROM plugin_chapters_cache WHERE key = ?;`)
      stmt.run(key)
    } catch (err) {
      console.error('[db:plugin-chapters] delete error:', err)
    }
  }

  /**
   * Invalidate chapters cache for a given plugin name, optionally filtered by sourceUrl.
   */
  deleteByPlugin(pluginName: string, sourceUrl?: string): number {
    try {
      if (sourceUrl) {
        const stmt = prepareStatement(`
          DELETE FROM plugin_chapters_cache
          WHERE plugin_name = ? AND source_url = ?;
        `)
        const res = stmt.run(pluginName, sourceUrl.trim())
        return Number(res.changes)
      }
      const stmt = prepareStatement(`
        DELETE FROM plugin_chapters_cache
        WHERE plugin_name = ?;
      `)
      const res = stmt.run(pluginName)
      return Number(res.changes)
    } catch (err) {
      console.error('[db:plugin-chapters] deleteByPlugin error:', err)
      return 0
    }
  }

  /**
   * Prune expired cache records to keep database size compact.
   */
  clearExpired(): number {
    try {
      const now = Date.now()
      const stmt = prepareStatement(`DELETE FROM plugin_chapters_cache WHERE expires_at <= ?;`)
      const res = stmt.run(now)
      return Number(res.changes)
    } catch (err) {
      console.error('[db:plugin-chapters] clearExpired error:', err)
      return 0
    }
  }

  /**
   * Get chapters cache operational metrics.
   */
  getStats(): { totalEntries: number; validEntries: number; totalHits: number } {
    try {
      const now = Date.now()
      const db = getDatabase()
      const totalRow = db.prepare('SELECT COUNT(*) as count, SUM(hit_count) as hits FROM plugin_chapters_cache;').get() as { count: number; hits: number | null } | undefined
      const validRow = db.prepare('SELECT COUNT(*) as count FROM plugin_chapters_cache WHERE expires_at > ?;').get(now) as { count: number } | undefined

      return {
        totalEntries: Number(totalRow?.count ?? 0),
        validEntries: Number(validRow?.count ?? 0),
        totalHits: Number(totalRow?.hits ?? 0),
      }
    } catch (err) {
      console.error('[db:plugin-chapters] getStats error:', err)
      return { totalEntries: 0, validEntries: 0, totalHits: 0 }
    }
  }
}

export const pluginChaptersCache = new PluginChaptersCacheRepository()
