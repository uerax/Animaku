import { Hono, type Context } from 'hono'
import { createHash } from 'node:crypto'
import type {
  RecordPlayViewRequest,
  RecordPlayViewResponse,
  AnimePlayStats,
  RecordDeviceActiveRequest,
  RecordDeviceActiveResponse,
} from '@animaku/shared'
import { watchStatsRepo } from '../db'
import { getClientIp, parseClientDevice } from '../lib/logger'
import { clientRemoteAddress } from '../lib/access'
import { setRankingsCdnHeaders } from '../lib/cdn-cache-headers'

export const statsRoutes = new Hono()

const DEVICE_ID_REGEX = /^dev_[0-9a-fA-F]{32}$/
const DEV_TEST_REGEX = /^dev_[a-zA-Z0-9_]{6,64}$/

export function isValidDeviceId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false
  const trimmed = id.trim()
  if (DEVICE_ID_REGEX.test(trimmed)) return true
  // 在非生产环境下（如测试用例或开发环境），允许带 dev_ 前缀的测试标识
  if (process.env.NODE_ENV !== 'production' && DEV_TEST_REGEX.test(trimmed)) return true
  return false
}

export function isCrawlerOrBot(ua?: string | null): boolean {
  if (!ua || !ua.trim()) {
    // 浏览器在生产环境下正常访问 100% 携带 User-Agent；无 UA 请求视为爬虫或裸 socket 脚本
    // 本地单元测试与开发调试中若未模拟 UA 则予以放行
    return process.env.NODE_ENV === 'production'
  }
  const device = parseClientDevice(ua)
  return device.type === 'bot' || device.type === 'script'
}

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
    const deviceId = extractDeviceId(c, body as unknown as Record<string, unknown>)
    const ua = c.req.header('user-agent')

    // 爬虫/自动化脚本过滤，以及非法设备 ID 格式校验过滤（静默成功返回，阻断伪造数据与落库开销）
    if (isCrawlerOrBot(ua) || !isValidDeviceId(deviceId)) {
      const resp: RecordPlayViewResponse = {
        success: true,
        playCount: 1,
        totalPlayCount: 1,
        deduped: true,
      }
      return c.json(resp)
    }

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

async function handlePingActive(c: Context) {
  try {
    // 强制声明绝不缓存该响应（保证无论是 CDN 边缘还是浏览器都不进行缓存）
    c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    c.header('CDN-Cache-Control', 'no-store')
    c.header('Cloudflare-CDN-Cache-Control', 'no-store')

    const body = await c.req
      .json<RecordDeviceActiveRequest & { clientUid?: string; fingerprint?: string }>()
      .catch(() => null)
    const clientIp = resolveIp(c)
    const deviceId = extractDeviceId(c, body as unknown as Record<string, unknown>)
    const ua = c.req.header('user-agent')

    // 爬虫/自动化脚本过滤，以及非法设备 ID 格式校验过滤（静默成功返回，阻断伪造数据与落库开销）
    if (isCrawlerOrBot(ua) || !isValidDeviceId(deviceId)) {
      const resp: RecordDeviceActiveResponse = {
        ok: true,
      }
      return c.json(resp)
    }

    const fingerprint =
      c.req.header('x-browser-fingerprint') ||
      (typeof body?.fingerprint === 'string' ? body.fingerprint : undefined)

    const result = watchStatsRepo.recordDeviceActive({
      deviceId,
      clientIp,
      fingerprint,
    })

    const resp: RecordDeviceActiveResponse = {
      ok: result.success,
    }
    return c.json(resp)
  } catch (err) {
    console.error('[routes:stats] ping active error:', err)
    return c.json({ ok: false }, 500)
  }
}

// Global active device heartbeat endpoint (CDN bypass guaranteed via POST + no-store)
statsRoutes.post('/ping', handlePingActive)
statsRoutes.post('/active', handlePingActive)

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

function handleRankings(
  c: Context,
  fixedType?: 'today' | 'week' | 'month' | 'total',
  defaultLimit = 20,
) {
  const rawType = (fixedType || c.req.query('type') || 'total').toLowerCase()
  const type: 'today' | 'week' | 'month' | 'total' =
    rawType === 'today' || rawType === 'week' || rawType === 'month' ? rawType : 'total'

  const limitParam = c.req.query('limit')
  const limit = Math.min(
    Math.max(limitParam !== undefined ? Number(limitParam) || defaultLimit : defaultLimit, 1),
    100,
  )
  const bypass = c.req.query('refresh') === '1' || c.req.header('cache-control')?.includes('no-cache')
  setRankingsCdnHeaders(c as never, Boolean(bypass))

  const list = watchStatsRepo.getTopRankings(type, limit)
  return c.json({ data: list, type, limit })
}

// Top rankings with support for today, week (7d), month (30d), total
statsRoutes.get('/rank', (c) => handleRankings(c, undefined, 20))
statsRoutes.get('/rank/top', (c) => handleRankings(c, undefined, 20))

// Semantic dedicated top10 shortcuts (defaults to limit=10, customizable via ?limit=N)
statsRoutes.get('/rank/today', (c) => handleRankings(c, 'today', 10))
statsRoutes.get('/rank/day', (c) => handleRankings(c, 'today', 10))
statsRoutes.get('/rank/week', (c) => handleRankings(c, 'week', 10))
statsRoutes.get('/rank/month', (c) => handleRankings(c, 'month', 10))
statsRoutes.get('/rank/total', (c) => handleRankings(c, 'total', 10))
