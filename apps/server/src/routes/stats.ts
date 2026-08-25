import { Hono } from 'hono'
import type { RecordPlayViewRequest, RecordPlayViewResponse, AnimePlayStats } from '@animaku/shared'
import { playStatsRepo } from '../db'
import { getClientIp } from '../lib/logger'
import { clientRemoteAddress } from '../lib/access'

export const statsRoutes = new Hono()

// Deduplication window: 10 minutes (in milliseconds)
const DEDUP_WINDOW_MS = 10 * 60 * 1000

// In-memory cache for fast deduplication: `${clientIp}::${bangumiId}::${episode}` -> { timestamp, playCount, totalPlayCount }
interface DedupEntry {
  timestamp: number
  playCount: number
  totalPlayCount: number
}
const viewDedupCache = new Map<string, DedupEntry>()

// Periodic cleanup of expired deduplication cache every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of viewDedupCache.entries()) {
    if (now - entry.timestamp > DEDUP_WINDOW_MS) {
      viewDedupCache.delete(key)
    }
  }
}, 5 * 60 * 1000)
cleanupTimer.unref()

function resolveIp(c: Parameters<typeof getClientIp>[0] & { req: Parameters<typeof getClientIp>[0]; [key: string]: unknown }): string {
  const ip = getClientIp(c.req)
  if (ip && ip !== '127.0.0.1') return ip
  // @ts-expect-error c is Hono Context
  const sockAddr = clientRemoteAddress(c)
  return sockAddr || ip || '127.0.0.1'
}

statsRoutes.post('/view', async (c) => {
  try {
    const body = await c.req.json<RecordPlayViewRequest>()
    const bangumiId = Number(body.bangumiId)
    const episode = Math.max(0, Math.trunc(Number(body.episode) || 0))

    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      return c.json({ error: 'bad_request', message: '无效的 bangumiId' }, 400)
    }

    const clientIp = resolveIp(c as never)
    const dedupKey = `${clientIp}::${bangumiId}::${episode}`
    const now = Date.now()
    const existing = viewDedupCache.get(dedupKey)

    // 10-minute duplicate check: return 200 with deduped flag without updating DB
    if (existing && now - existing.timestamp < DEDUP_WINDOW_MS) {
      const resp: RecordPlayViewResponse = {
        success: true,
        playCount: existing.playCount,
        totalPlayCount: existing.totalPlayCount,
        deduped: true,
      }
      return c.json(resp)
    }

    // 异步非阻塞执行 SQLite 写入，保证 HTTP 请求 0 延迟即刻返回，防止数据库卡顿影响客户端体验
    setImmediate(() => {
      try {
        const result = playStatsRepo.recordPlay(bangumiId, episode)
        viewDedupCache.set(dedupKey, {
          timestamp: now,
          playCount: result.episodePlayCount,
          totalPlayCount: result.totalPlayCount,
        })
      } catch (e) {
        console.error('[routes:stats] async recordPlay error:', e)
      }
    })

    const estimatedEpCount = (existing?.playCount || 0) + 1
    const estimatedTotalCount = (existing?.totalPlayCount || 0) + 1

    viewDedupCache.set(dedupKey, {
      timestamp: now,
      playCount: estimatedEpCount,
      totalPlayCount: estimatedTotalCount,
    })

    const resp: RecordPlayViewResponse = {
      success: true,
      playCount: estimatedEpCount,
      totalPlayCount: estimatedTotalCount,
    }
    return c.json(resp)
  } catch (err) {
    console.error('[routes:stats] /view error:', err)
    return c.json({ error: 'server_error', message: '记录播放统计失败' }, 500)
  }
})

statsRoutes.get('/subject/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'bad_request', message: '无效的番剧 ID' }, 400)
  }
  const stats: AnimePlayStats = playStatsRepo.getPlayStats(id)
  return c.json({ data: stats })
})

statsRoutes.get('/rank/top', (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 20, 1), 100)
  const list = playStatsRepo.getTopPlayed(limit)
  return c.json({ data: list })
})
