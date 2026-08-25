import { config } from '../../config'
import { getDatabase, prepareStatement } from '../connection'

export interface IpAccessLogRow {
  ip: string
  total_hits: number
  today_hits: number
  last_date: string
  first_seen: number
  last_seen: number
}

/**
 * Format local date YYYY-MM-DD according to configured timezone (default: Asia/Shanghai)
 * Ensures daily PV today_hits resets precisely at local midnight (00:00:00).
 */
export function getLocalTodayDateStr(now = Date.now()): string {
  try {
    return new Date(now).toLocaleDateString('sv-SE', {
      timeZone: config.timezone || 'Asia/Shanghai',
    })
  } catch {
    // Fallback to UTC if timezone string is invalid
    return new Date(now).toISOString().slice(0, 10)
  }
}

/**
 * High-performance, zero-timer IP access logger with process-local micro-batching.
 *
 * Architecture & Tradeoffs:
 * 1. Synchronous SQLite requirement: Relies on node:sqlite (DatabaseSync) synchronous writes
 *    so micro-task callbacks execute atomically without interleaving race conditions.
 * 2. Best-effort statistics: Designed for traffic analytics. In-flight increments are dropped
 *    if the process terminates unexpectedly (e.g. SIGKILL/OOM), which is completely acceptable for telemetry.
 * 3. 0-Timer / 0-Polling: No background intervals; idle state consumes 0 CPU and 0 database IO.
 */
export class IpAccessRepository {
  /** Ephemeral in-flight queue: maps IP -> accumulated request count before next microtask flush */
  private pendingIps = new Map<string, { count: number }>()

  /**
   * Execute atomic UPSERT into SQLite with accumulated batch count.
   */
  recordHitBatchSync(ip: string, increment: number, customDateStr?: string): void {
    if (!ip || increment <= 0) return
    const normalizedIp = ip.trim()
    if (!normalizedIp) return

    const now = Date.now()
    const dateStr = customDateStr || getLocalTodayDateStr(now)

    try {
      const stmt = prepareStatement(`
        INSERT INTO ip_access_logs (
          ip, total_hits, today_hits, last_date, first_seen, last_seen
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET
          total_hits = total_hits + excluded.total_hits,
          today_hits = CASE
            WHEN last_date = excluded.last_date THEN today_hits + excluded.today_hits
            ELSE excluded.today_hits
          END,
          last_date = excluded.last_date,
          last_seen = excluded.last_seen;
      `)
      stmt.run(normalizedIp, increment, increment, dateStr, now, now)
    } catch (err) {
      console.error('[db:ip-access] recordHitBatchSync error (dropped best-effort metric):', err)
    }
  }

  /**
   * Record IP visit with automatic single-tick concurrency micro-batching.
   * Multiple concurrent requests from the same IP within the same tick are collapsed
   * into a single SQLite write operation (+N).
   */
  recordHit(ip: string): void {
    if (!ip || typeof ip !== 'string') return
    const normalizedIp = ip.trim()
    if (!normalizedIp) return

    const existing = this.pendingIps.get(normalizedIp)
    if (existing) {
      // Same IP concurrent request within current microtask queue: increment in-memory count only
      existing.count += 1
      return
    }

    // First request from this IP in current event loop tick
    this.pendingIps.set(normalizedIp, { count: 1 })

    setImmediate(() => {
      const current = this.pendingIps.get(normalizedIp)
      this.pendingIps.delete(normalizedIp)
      if (current && current.count > 0) {
        this.recordHitBatchSync(normalizedIp, current.count)
      }
    })
  }

  /**
   * Query access statistics for a specific IP.
   */
  getIpAccess(ip: string): IpAccessLogRow | null {
    if (!ip) return null
    try {
      const stmt = prepareStatement(`
        SELECT ip, total_hits, today_hits, last_date, first_seen, last_seen
        FROM ip_access_logs
        WHERE ip = ?
        LIMIT 1;
      `)
      const row = stmt.get(ip.trim()) as IpAccessLogRow | undefined
      return row || null
    } catch (err) {
      console.error('[db:ip-access] getIpAccess error:', err)
      return null
    }
  }

  /**
   * Query global site traffic aggregate metrics.
   */
  getGlobalTraffic(): { totalIps: number; totalHits: number; todayHits: number } {
    try {
      const today = getLocalTodayDateStr()
      const db = getDatabase()
      const row = db
        .prepare(`
          SELECT
            COUNT(*) as total_ips,
            SUM(total_hits) as total_hits,
            SUM(CASE WHEN last_date = ? THEN today_hits ELSE 0 END) as today_hits
          FROM ip_access_logs;
        `)
        .get(today) as { total_ips: number; total_hits: number | null; today_hits: number | null } | undefined

      return {
        totalIps: Number(row?.total_ips ?? 0),
        totalHits: Number(row?.total_hits ?? 0),
        todayHits: Number(row?.today_hits ?? 0),
      }
    } catch (err) {
      console.error('[db:ip-access] getGlobalTraffic error:', err)
      return { totalIps: 0, totalHits: 0, todayHits: 0 }
    }
  }
}

export const ipAccessRepo = new IpAccessRepository()
