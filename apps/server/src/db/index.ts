import { config } from '../config'
import {
  getDatabase,
  closeDatabase,
  prepareStatement,
  transaction,
  isDatabaseActive,
} from './connection'
import { initSchema } from './schema'
import { pluginSearchCache, PluginSearchCacheRepository } from './repositories/plugin-search-cache'
import { pluginChaptersCache, PluginChaptersCacheRepository } from './repositories/plugin-chapters-cache'
import { kvCache, KvCacheRepository } from './repositories/kv-cache'
import { playStatsRepo, PlayStatsRepository } from './repositories/play-stats'
import { ipAccessRepo, IpAccessRepository } from './repositories/ip-access'
import { BangumiDataRepository, type AnimeBangumiMapping } from './repositories/bangumi-data'

const bangumiDataRepo = new BangumiDataRepository()

let initialized = false
let cleanupTimer: NodeJS.Timeout | null = null

/**
 * Initialize the SQLite database and apply migrations.
 * Safe to call multiple times (idempotent).
 */
export function initDatabase(): void {
  if (initialized) return

  if (!config.dbEnabled) {
    console.log('[db] 数据库持久化未启用 (DB_ENABLED=false)，服务以纯无状态内存模式运行。')
    initialized = true
    return
  }

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
  isDatabaseActive,
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
  bangumiDataRepo,
  BangumiDataRepository,
  type AnimeBangumiMapping,
}
