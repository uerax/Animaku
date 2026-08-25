import { getDatabase, closeDatabase, prepareStatement, transaction } from './connection'
import { initSchema } from './schema'
import { pluginSearchCache, PluginSearchCacheRepository } from './repositories/plugin-search-cache'
import { pluginChaptersCache, PluginChaptersCacheRepository } from './repositories/plugin-chapters-cache'
import { kvCache, KvCacheRepository } from './repositories/kv-cache'
import { playStatsRepo, PlayStatsRepository } from './repositories/play-stats'
import { ipAccessRepo, IpAccessRepository } from './repositories/ip-access'

let initialized = false
let cleanupTimer: NodeJS.Timeout | null = null

/**
 * Initialize the SQLite database and apply migrations.
 * Safe to call multiple times (idempotent).
 */
export function initDatabase(): void {
  if (initialized) return
  const db = getDatabase()
  initSchema(db)
  initialized = true

  // Run initial cleanup of expired records
  try {
    const expiredSearch = pluginSearchCache.clearExpired()
    const expiredChapters = pluginChaptersCache.clearExpired()
    const expiredKv = kvCache.clearExpired()
    if (expiredSearch > 0 || expiredChapters > 0 || expiredKv > 0) {
      console.log(`[db] Initial cleanup: pruned ${expiredSearch} search, ${expiredChapters} chapters, and ${expiredKv} kv expired entries.`)
    }
  } catch (err) {
    console.error('[db] Error during initial expired records cleanup:', err)
  }

  // Periodic cleanup every 1 hour (unref so process can exit cleanly)
  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => {
      try {
        pluginSearchCache.clearExpired()
        pluginChaptersCache.clearExpired()
        kvCache.clearExpired()
      } catch (err) {
        console.error('[db] Periodic cleanup error:', err)
      }
    }, 60 * 60 * 1000)
    cleanupTimer.unref()
  }
}

export {
  getDatabase,
  closeDatabase,
  prepareStatement,
  transaction,
  initSchema,
  pluginSearchCache,
  PluginSearchCacheRepository,
  pluginChaptersCache,
  PluginChaptersCacheRepository,
  kvCache,
  KvCacheRepository,
  playStatsRepo,
  PlayStatsRepository,
  ipAccessRepo,
  IpAccessRepository,
}
