import { Hono, type Context } from 'hono'
import { createHash } from 'node:crypto'
import type { RecordPlayViewRequest, RecordPlayViewResponse, AnimePlayStats } from '@animaku/shared'
import { watchStatsRepo } from '../db'
import { getClientIp } from '../lib/logger'
import { clientRemoteAddress } from '../lib/access'
import { setRankingsCdnHeaders } from '../lib/cdn-cache-headers'

export const statsRoutes = new Hono()

function resolveIp(c: Context): string {
  const ip = getClientIp(c.req)
  if (ip && ip !== '127.0.0.1') return ip
  const sockAddr = clientRemoteAddress(c)
  return sockAddr || ip || '127.0.0.1'
}

function extractDeviceId(c: Context, body?: Record<string, unknown> | null): string {
  // 1. Preferred header identification (X-Device-ID / X-Client-UID)
  const headerId =
    c.req.header('x-device-id') ||
    c.req.header('x-client-uid') ||
    c.req.header('x-client-id')
  if (headerId?.trim()) return headerId.trim()

  // 2. Request body payload (clientUid or deviceId)
  if (body) {
    if (typeof body.deviceId === 'string' && body.deviceId.trim()) {
      return body.deviceId.trim()
    }
    if (typeof body.clientUid === 'string' && body.clientUid.trim()) {
      return body.clientUid.trim()
    }
  }

  // 3. Fallback: browser fingerprint header
  const fp = c.req.header('x-browser-fingerprint')
  if (fp?.trim()) return `fp_${fp.trim()}`

  // 4. Ultimate fallback: deterministic hash of client IP + User-Agent
  const ip = resolveIp(c)
  const ua = c.req.header('user-agent') || 'unknown'
  const fallbackHash = createHash('md5').update(`${ip}::${ua}`).digest('hex').slice(0, 16)
  return `anon_${fallbackHash}`
}

async function handleRecordView(c: Context) {
  try {
    const body = await c.req.json<RecordPlayViewRequest & { deviceId?: string; clientUid?: string; fingerprint?: string }>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'bad_request', message: '无效的请求体' }, 400)
    }

    const bangumiId = Number(body.bangumiId)
    const episode = Math.max(0, Math.trunc(Number(body.episode) || 0))

    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      return c.json({ error: 'bad_request', message: '无效的 bangumiId' }, 400)
    }

    const clientIp = resolveIp(c)
    const deviceId = extractDeviceId(c, body as Record<string, unknown>)
    const fingerprint = c.req.header('x-browser-fingerprint') || (typeof body.fingerprint === 'string' ? body.fingerprint : undefined)

    // Record view in memory buffer (instant microsecond response, 0 DB locking)
    const result = watchStatsRepo.recordPlayView({
      deviceId,
      bangumiId,
      episode,
      fingerprint,
      clientIp,
    })

    const resp: RecordPlayViewResponse = {
      success: result.success,
      playCount: result.totalPlayCount,
      totalPlayCount: result.totalPlayCount,
      deduped: result.deduped,
    }
    return c.json(resp)
  } catch (err) {
    console.error('[routes:stats] record view error:', err)
    return c.json({ error: 'server_error', message: '记录播放统计失败' }, 500)
  }
}

// Single + Plural route alias support (/view & /views)
statsRoutes.post('/view', handleRecordView)
statsRoutes.post('/views', handleRecordView)

statsRoutes.get('/subject/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'bad_request', message: '无效的番剧 ID' }, 400)
  }
  const bypass = c.req.query('refresh') === '1' || c.req.header('cache-control')?.includes('no-cache')
  setRankingsCdnHeaders(c as never, Boolean(bypass))

  const stats = watchStatsRepo.getPlayStats(id)
  const resp: { data: AnimePlayStats } = {
    data: {
      bangumiId: stats.bangumiId,
      totalPlayCount: stats.totalPlayCount,
      episodePlayCounts: {},
    },
  }
  return c.json(resp)
})

function handleRankings(c: Context) {
  const rawType = (c.req.query('type') || 'total').toLowerCase()
  const type: 'today' | 'week' | 'month' | 'total' =
    rawType === 'today' || rawType === 'week' || rawType === 'month' ? rawType : 'total'

  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 20, 1), 100)
  const bypass = c.req.query('refresh') === '1' || c.req.header('cache-control')?.includes('no-cache')
  setRankingsCdnHeaders(c as never, Boolean(bypass))

  const list = watchStatsRepo.getTopRankings(type, limit)
  return c.json({ data: list, type })
}

// Top rankings with support for today, week (7d), month (30d), total
statsRoutes.get('/rank', handleRankings)
statsRoutes.get('/rank/top', handleRankings)
