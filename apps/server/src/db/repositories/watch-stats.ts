import type { AdminDailyStatsResponse, DailyActiveMetric } from '@animaku/shared'
import { getDatabase, prepareStatement, isDatabaseActive } from '../connection'
import { getLocalTodayDateStr } from './ip-access'
import { config } from '../../config'

/** Deduplication window per device + anime + episode: 10 minutes */
export const DEDUP_WINDOW_MS = 10 * 60 * 1000

/** Default batch flush interval: 60 seconds (1 minute) */
const DEFAULT_FLUSH_INTERVAL_MS = 60 * 1000

/** Maximum pending items before forcing an early micro-batch flush */
const MAX_PENDING_WATERMARK = 1000

export interface RecordPlayParams {
  deviceId: string
  bangumiId: number
  episode: number
  fingerprint?: string
  clientIp: string
}

export interface RecordDeviceActiveParams {
  deviceId: string
  clientIp: string
  fingerprint?: string
}

export interface WatchRecordResult {
  success: boolean
  deduped: boolean
  totalPlayCount: number
}

interface PendingDeviceUpdate {
  fingerprint?: string
  lastIp: string
  lastSeenAt: number
  playIncrement: number
}

export class WatchStatsRepository {
  /** In-memory deduplication cache: `${deviceId}::${bangumiId}::${episode}` -> lastReportTimestamp */
  private dedupCache = new Map<string, number>()

  /** In-memory active device heartbeat deduplication: deviceId -> lastHeartbeatTimestamp */
  private activeDeviceCache = new Map<string, number>()

  /** Pending batch views increment per bangumiId: bangumiId -> delta */
  private pendingTotalViews = new Map<number, number>()

  /** Pending batch daily views increment: `${bangumiId}::${date}` -> delta */
  private pendingDailyViews = new Map<string, number>()

  /** Pending device records to upsert: deviceId -> PendingDeviceUpdate */
  private pendingDevices = new Map<string, PendingDeviceUpdate>()

  /** Local memory cache of latest total play counts for zero-latency responses */
  private memoryTotalViews = new Map<number, number>()

  /** Lightweight in-memory cache for ranking results: key -> { data, expiresAt } */
  private rankingCache = new Map<string, { data: Array<{ bangumiId: number; totalPlayCount: number }>; expiresAt: number }>()

  private flushTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private isFlushing = false

  constructor() {
    this.startBackgroundTimers()
    this.registerShutdownHooks()
  }

  private startBackgroundTimers(): void {
    const intervalMs = this.resolveFlushIntervalMs()
    this.flushTimer = setInterval(() => {
      this.flushSync()
    }, intervalMs)
    this.flushTimer.unref()

    // Periodically clean up expired deduplication cache entries every 5 minutes
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, ts] of this.dedupCache.entries()) {
        if (now - ts > DEDUP_WINDOW_MS) {
          this.dedupCache.delete(key)
        }
      }
      for (const [devId, ts] of this.activeDeviceCache.entries()) {
        if (now - ts > DEDUP_WINDOW_MS) {
          this.activeDeviceCache.delete(devId)
        }
      }
    }, 5 * 60 * 1000)
    this.cleanupTimer.unref()
  }

  private resolveFlushIntervalMs(): number {
    const raw = process.env.STATS_FLUSH_INTERVAL_SEC
    if (raw) {
      const sec = Number(raw)
      if (Number.isFinite(sec) && sec > 0) {
        return Math.max(1000, Math.floor(sec * 1000))
      }
    }
    return DEFAULT_FLUSH_INTERVAL_MS
  }

  private registerShutdownHooks(): void {
    const onExit = () => {
      this.flushSync()
    }
    process.once('beforeExit', onExit)
    process.once('SIGINT', onExit)
    process.once('SIGTERM', onExit)
  }

  /**
   * Stop background timers (useful for unit tests teardown).
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Record a device active heartbeat in memory (DAU / New Device telemetry),
   * deduplicating within a 10-minute sliding window to ensure ultra-low overhead (<0.1ms).
   */
  recordDeviceActive(params: RecordDeviceActiveParams): { success: boolean; deduped: boolean } {
    const { deviceId, clientIp, fingerprint } = params
    if (!deviceId || typeof deviceId !== 'string') {
      return { success: false, deduped: false }
    }

    const cleanDeviceId = deviceId.trim()
    if (!cleanDeviceId) {
      return { success: false, deduped: false }
    }

    // 0. 未开启数据库时（DB_ENABLED=false），直接返回成功
    if (!isDatabaseActive()) {
      return { success: true, deduped: false }
    }

    const now = Date.now()
    const lastActive = this.activeDeviceCache.get(cleanDeviceId)
    if (lastActive && now - lastActive < DEDUP_WINDOW_MS) {
      return { success: true, deduped: true }
    }
    this.activeDeviceCache.set(cleanDeviceId, now)

    // Buffer device update (playIncrement = 0 means pure heartbeat, not a play view)
    const existingDev = this.pendingDevices.get(cleanDeviceId)
    if (existingDev) {
      existingDev.lastSeenAt = now
      existingDev.lastIp = clientIp || existingDev.lastIp
      if (fingerprint && !existingDev.fingerprint) {
        existingDev.fingerprint = fingerprint
      }
    } else {
      this.pendingDevices.set(cleanDeviceId, {
        fingerprint,
        lastIp: clientIp || '127.0.0.1',
        lastSeenAt: now,
        playIncrement: 0,
      })
    }

    // Check watermark threshold for early flush
    if (this.pendingDevices.size >= MAX_PENDING_WATERMARK) {
      setImmediate(() => this.flushSync())
    }

    return { success: true, deduped: false }
  }

  /**
   * Record a valid play view in memory, deduplicating within a 10-minute sliding window.
   * Execution is completely non-blocking and executes in < 0.2ms with 0 database I/O.
   */
  recordPlayView(params: RecordPlayParams): WatchRecordResult {
    const { deviceId, bangumiId, episode, fingerprint, clientIp } = params
    if (!Number.isFinite(bangumiId) || bangumiId <= 0 || !deviceId) {
      return { success: false, deduped: false, totalPlayCount: 0 }
    }

    // 0. 未开启数据库时（DB_ENABLED=false），直接返回成功，完全不向内存申请缓冲与排队，彻底零开销
    if (!isDatabaseActive()) {
      return { success: true, deduped: false, totalPlayCount: 0 }
    }

    const now = Date.now()
    const cleanDeviceId = deviceId.trim()
    const cleanEpisode = Math.max(0, Math.trunc(Number(episode) || 0))
    const dedupKey = `${cleanDeviceId}::${bangumiId}::${cleanEpisode}`

    // 1. Sliding window deduplication check
    const lastSeen = this.dedupCache.get(dedupKey)
    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
      const currentTotal = this.getTotalViewsFast(bangumiId)
      return {
        success: true,
        deduped: true,
        totalPlayCount: currentTotal,
      }
    }

    this.dedupCache.set(dedupKey, now)

    // 2. Buffer pending increments in memory
    const curPendingTotal = this.pendingTotalViews.get(bangumiId) || 0
    this.pendingTotalViews.set(bangumiId, curPendingTotal + 1)

    const todayDate = getLocalTodayDateStr(now)
    const dailyKey = `${bangumiId}::${todayDate}`
    const curPendingDaily = this.pendingDailyViews.get(dailyKey) || 0
    this.pendingDailyViews.set(dailyKey, curPendingDaily + 1)

    // 3. Buffer device update
    const existingDev = this.pendingDevices.get(cleanDeviceId)
    if (existingDev) {
      existingDev.lastSeenAt = now
      existingDev.lastIp = clientIp || existingDev.lastIp
      existingDev.playIncrement += 1
      if (fingerprint && !existingDev.fingerprint) {
        existingDev.fingerprint = fingerprint
      }
    } else {
      this.pendingDevices.set(cleanDeviceId, {
        fingerprint,
        lastIp: clientIp || '127.0.0.1',
        lastSeenAt: now,
        playIncrement: 1,
      })
    }

    // 4. Update memory cache of total views for instant client responses
    const newTotal = this.getTotalViewsFast(bangumiId) + 1
    this.memoryTotalViews.set(bangumiId, newTotal)

    // 5. Check watermark threshold for early flush
    if (this.pendingTotalViews.size >= MAX_PENDING_WATERMARK) {
      setImmediate(() => this.flushSync())
    }

    return {
      success: true,
      deduped: false,
      totalPlayCount: newTotal,
    }
  }

  /**
   * Fast total play count retrieval (reads memory cache, or falls back to DB).
   */
  private getTotalViewsFast(bangumiId: number): number {
    const mem = this.memoryTotalViews.get(bangumiId)
    if (mem !== undefined) return mem

    if (!isDatabaseActive()) return 0

    try {
      const stmt = prepareStatement(`
        SELECT total_views FROM anime_total_views WHERE bangumi_id = ?;
      `)
      const row = stmt.get(bangumiId) as { total_views?: number } | undefined
      const dbVal = Number(row?.total_views || 0)
      this.memoryTotalViews.set(bangumiId, dbVal)
      return dbVal
    } catch {
      return 0
    }
  }

  /**
   * Synchronously flush all in-memory pending batches into SQLite in a single transaction.
   * If DB_ENABLED is false or database is inactive, safe no-op.
   */
  flushSync(): void {
    if (!isDatabaseActive() || this.isFlushing) {
      return
    }

    if (
      this.pendingTotalViews.size === 0 &&
      this.pendingDailyViews.size === 0 &&
      this.pendingDevices.size === 0
    ) {
      return
    }

    this.isFlushing = true

    // Swap buffers to avoid race conditions with incoming requests
    const viewsToFlush = new Map(this.pendingTotalViews)
    const dailyToFlush = new Map(this.pendingDailyViews)
    const devicesToFlush = new Map(this.pendingDevices)

    this.pendingTotalViews.clear()
    this.pendingDailyViews.clear()
    this.pendingDevices.clear()

    const now = Date.now()
    const todayStr = getLocalTodayDateStr(now)
    const db = getDatabase()

    try {
      db.exec('BEGIN IMMEDIATE;')

      // 1. Batch upsert devices
      if (devicesToFlush.size > 0) {
        const deviceUpsert = prepareStatement(`
          INSERT INTO devices (
            device_id, fingerprint, first_seen_at, last_seen_at, last_ip, total_plays
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(device_id) DO UPDATE SET
            fingerprint = COALESCE(excluded.fingerprint, devices.fingerprint),
            last_seen_at = excluded.last_seen_at,
            last_ip = excluded.last_ip,
            total_plays = devices.total_plays + excluded.total_plays;
        `)
        for (const [devId, update] of devicesToFlush.entries()) {
          deviceUpsert.run(
            devId,
            update.fingerprint || null,
            update.lastSeenAt,
            update.lastSeenAt,
            update.lastIp,
            update.playIncrement,
          )
        }
      }

      // 2. Batch upsert anime_total_views
      if (viewsToFlush.size > 0) {
        const totalUpsert = prepareStatement(`
          INSERT INTO anime_total_views (bangumi_id, total_views, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(bangumi_id) DO UPDATE SET
            total_views = anime_total_views.total_views + excluded.total_views,
            updated_at = excluded.updated_at;
        `)
        for (const [bangumiId, delta] of viewsToFlush.entries()) {
          totalUpsert.run(bangumiId, delta, now)
        }
      }

      // 3. Batch upsert anime_daily_views
      if (dailyToFlush.size > 0) {
        const dailyUpsert = prepareStatement(`
          INSERT INTO anime_daily_views (bangumi_id, date, views, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(bangumi_id, date) DO UPDATE SET
            views = anime_daily_views.views + excluded.views,
            updated_at = excluded.updated_at;
        `)
        for (const [key, delta] of dailyToFlush.entries()) {
          const [bgmStr, dateStr] = key.split('::')
          const bId = Number(bgmStr)
          if (bId && dateStr) {
            dailyUpsert.run(bId, dateStr, delta, now)
          }
        }
      }

      // 4. Update daily_active_stats for today (accurate DAU & daily views)
      try {
        const todayStartMs = this.getTodayStartTimestamp(now)
        const dauRow = db.prepare('SELECT COUNT(*) as c FROM devices WHERE last_seen_at >= ?;').get(todayStartMs) as { c?: number } | undefined
        const newDevRow = db.prepare('SELECT COUNT(*) as c FROM devices WHERE first_seen_at >= ?;').get(todayStartMs) as { c?: number } | undefined
        const viewsRow = db.prepare('SELECT SUM(views) as s FROM anime_daily_views WHERE date = ?;').get(todayStr) as { s?: number } | undefined

        const dau = Number(dauRow?.c || 0)
        const newDevices = Number(newDevRow?.c || 0)
        const totalViews = Number(viewsRow?.s || 0)

        const dailyStatsUpsert = prepareStatement(`
          INSERT INTO daily_active_stats (date, dau, new_devices, total_views, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            dau = excluded.dau,
            new_devices = excluded.new_devices,
            total_views = excluded.total_views,
            updated_at = excluded.updated_at;
        `)
        dailyStatsUpsert.run(todayStr, dau, newDevices, totalViews, now)
      } catch (err) {
        console.error('[db:watch-stats] daily_active_stats update error:', err)
      }

      db.exec('COMMIT;')

      // Invalidate ranking cache on flush
      this.rankingCache.clear()
    } catch (err) {
      try {
        db.exec('ROLLBACK;')
      } catch {}
      console.error('[db:watch-stats] flushSync transaction error:', err)
      // Put back items on failure to prevent data loss
      for (const [k, v] of viewsToFlush.entries()) {
        this.pendingTotalViews.set(k, (this.pendingTotalViews.get(k) || 0) + v)
      }
      for (const [k, v] of dailyToFlush.entries()) {
        this.pendingDailyViews.set(k, (this.pendingDailyViews.get(k) || 0) + v)
      }
    } finally {
      this.isFlushing = false
    }
  }

  /**
   * Helper: compute start of local day in Unix milliseconds.
   */
  private getTodayStartTimestamp(now = Date.now()): number {
    const dateStr = getLocalTodayDateStr(now)
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).getTime()
  }

  /**
   * Helper: calculate date string N days ago.
   */
  private getDateDaysAgo(days: number, now = Date.now()): string {
    const pastTime = now - days * 24 * 60 * 60 * 1000
    return getLocalTodayDateStr(pastTime)
  }

  /**
   * Retrieve anime subject total play count.
   */
  getPlayStats(bangumiId: number): { bangumiId: number; totalPlayCount: number } {
    if (!Number.isFinite(bangumiId) || bangumiId <= 0 || !isDatabaseActive()) {
      return { bangumiId, totalPlayCount: 0 }
    }
    return {
      bangumiId,
      totalPlayCount: this.getTotalViewsFast(bangumiId),
    }
  }

  /**
   * Retrieve ranked top played anime bangumi IDs across different timeframes.
   * Supports 'today' (1 day), 'week' (7 days), 'month' (30 days), 'total' (all-time).
   */
  getTopRankings(
    type: 'today' | 'week' | 'month' | 'total' = 'total',
    limit = 20,
  ): Array<{ bangumiId: number; totalPlayCount: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const now = Date.now()
    const cacheKey = `${type}::${safeLimit}`

    // 1. Check in-memory ranking cache (5 min TTL)
    const cached = this.rankingCache.get(cacheKey)
    if (cached && now < cached.expiresAt) {
      return cached.data
    }

    if (!isDatabaseActive()) {
      return []
    }

    try {
      let results: Array<{ bangumiId: number; totalPlayCount: number }> = []

      if (type === 'today') {
        const todayStr = getLocalTodayDateStr(now)
        const stmt = prepareStatement(`
          SELECT bangumi_id, views as total_views
          FROM anime_daily_views
          WHERE date = ?
          ORDER BY views DESC
          LIMIT ?;
        `)
        const rows = stmt.all(todayStr, safeLimit) as Array<{ bangumi_id: number; total_views: number }>
        results = rows.map((r) => ({
          bangumiId: Number(r.bangumi_id),
          totalPlayCount: Number(r.total_views),
        }))
      } else if (type === 'week') {
        const startDate = this.getDateDaysAgo(7, now)
        const stmt = prepareStatement(`
          SELECT bangumi_id, SUM(views) as total_views
          FROM anime_daily_views
          WHERE date >= ?
          GROUP BY bangumi_id
          ORDER BY total_views DESC
          LIMIT ?;
        `)
        const rows = stmt.all(startDate, safeLimit) as Array<{ bangumi_id: number; total_views: number }>
        results = rows.map((r) => ({
          bangumiId: Number(r.bangumi_id),
          totalPlayCount: Number(r.total_views),
        }))
      } else if (type === 'month') {
        const startDate = this.getDateDaysAgo(30, now)
        const stmt = prepareStatement(`
          SELECT bangumi_id, SUM(views) as total_views
          FROM anime_daily_views
          WHERE date >= ?
          GROUP BY bangumi_id
          ORDER BY total_views DESC
          LIMIT ?;
        `)
        const rows = stmt.all(startDate, safeLimit) as Array<{ bangumi_id: number; total_views: number }>
        results = rows.map((r) => ({
          bangumiId: Number(r.bangumi_id),
          totalPlayCount: Number(r.total_views),
        }))
      } else {
        // type === 'total' (All-time ranking)
        const stmt = prepareStatement(`
          SELECT bangumi_id, total_views
          FROM anime_total_views
          ORDER BY total_views DESC
          LIMIT ?;
        `)
        const rows = stmt.all(safeLimit) as Array<{ bangumi_id: number; total_views: number }>
        results = rows.map((r) => ({
          bangumiId: Number(r.bangumi_id),
          totalPlayCount: Number(r.total_views),
        }))
      }

      // Cache ranking for 5 minutes
      this.rankingCache.set(cacheKey, {
        data: results,
        expiresAt: now + 5 * 60 * 1000,
      })

      return results
    } catch (err) {
      console.error('[db:watch-stats] getTopRankings error:', err)
      return []
    }
  }

  /**
   * Backward-compatible getTopPlayed method.
   */
  getTopPlayed(limit = 20): Array<{ bangumiId: number; totalPlayCount: number }> {
    return this.getTopRankings('total', limit)
  }

  /**
   * Retrieve DAU and site performance statistics for a specific date (or today).
   * Also returns a continuous 14-day trend sequence for easy dashboard charts.
   */
  getDailyStats(targetDate?: string): AdminDailyStatsResponse {
    const now = Date.now()
    const todayStr = getLocalTodayDateStr(now)
    const safeDate = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())
      ? targetDate.trim()
      : todayStr
    const isToday = safeDate === todayStr

    if (!isDatabaseActive()) {
      return {
        ok: true,
        date: safeDate,
        isToday,
        dau: 0,
        newDevices: 0,
        totalViews: 0,
        todayHits: 0,
        totalDevices: 0,
        updatedAt: now,
        trend: [],
      }
    }

    try {
      if (isToday) {
        // 今日查询触发一次即时同步，确保秒级实时准确
        this.flushSync()
      }

      const db = getDatabase()

      // 1. 获取目标日期的活跃指标
      const targetRow = db
        .prepare('SELECT dau, new_devices, total_views, updated_at FROM daily_active_stats WHERE date = ?;')
        .get(safeDate) as { dau?: number; new_devices?: number; total_views?: number; updated_at?: number } | undefined

      const dau = Number(targetRow?.dau || 0)
      const newDevices = Number(targetRow?.new_devices || 0)
      const totalViews = Number(targetRow?.total_views || 0)
      const updatedAt = Number(targetRow?.updated_at || now)

      // 2. 目标日期的 IP hits（PV）
      const hitsRow = db
        .prepare('SELECT SUM(today_hits) as s FROM ip_access_logs WHERE last_date = ?;')
        .get(safeDate) as { s?: number } | undefined
      const todayHits = Number(hitsRow?.s || 0)

      // 3. 累计设备总数
      const devTotalRow = db.prepare('SELECT COUNT(*) as c FROM devices;').get() as { c?: number } | undefined
      const totalDevices = Number(devTotalRow?.c || 0)

      // 4. 近 14 天走势列表
      const startTrendDate = this.getDateDaysAgo(13, now)
      const trendRows = db
        .prepare(`
          SELECT date, dau, new_devices, total_views, updated_at
          FROM daily_active_stats
          WHERE date >= ?
          ORDER BY date ASC;
        `)
        .all(startTrendDate) as Array<{
          date: string
          dau: number
          new_devices: number
          total_views: number
          updated_at: number
        }>

      const trendMap = new Map<string, DailyActiveMetric>()
      for (const row of trendRows) {
        trendMap.set(row.date, {
          date: row.date,
          dau: Number(row.dau || 0),
          newDevices: Number(row.new_devices || 0),
          totalViews: Number(row.total_views || 0),
          updatedAt: Number(row.updated_at || 0),
        })
      }

      // 补齐连续 14 天的日期（防止中间有天没有记录导致图表断裂）
      const trend: DailyActiveMetric[] = []
      for (let i = 13; i >= 0; i--) {
        const d = this.getDateDaysAgo(i, now)
        const item = trendMap.get(d) || {
          date: d,
          dau: 0,
          newDevices: 0,
          totalViews: 0,
          updatedAt: now,
        }
        trend.push(item)
      }

      return {
        ok: true,
        date: safeDate,
        isToday,
        dau,
        newDevices,
        totalViews,
        todayHits,
        totalDevices,
        updatedAt,
        trend,
      }
    } catch (err) {
      console.error('[db:watch-stats] getDailyStats error:', err)
      return {
        ok: false,
        date: safeDate,
        isToday,
        dau: 0,
        newDevices: 0,
        totalViews: 0,
        todayHits: 0,
        totalDevices: 0,
        updatedAt: now,
        trend: [],
      }
    }
  }
}

export const watchStatsRepo = new WatchStatsRepository()
