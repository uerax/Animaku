import { Hono } from 'hono'
import { sourceRegistry } from '../lib/source/source-registry'
import { guardedOp, buildSourceCacheKey } from '../lib/source/guarded-ops'
import { resolveIp } from '../lib/ip-rate-limit'
import { wantsCacheBypass } from '../lib/ttl-cache'
import {
  checkSourceRateLimit,
  SourceRateLimitError,
} from '../lib/source-rate-limit'
import type { PluginSearchResult, PluginChapterResult } from '@animaku/shared'

export const sourceRoutes = new Hono()

// 违规网络参数注入黑名单
const FORBIDDEN_NETWORK_KEYS = [
  'baseURL',
  'baseUrl',
  'searchURL',
  'searchUrl',
  'headers',
  'header',
  'cookies',
  'cookie',
  'customHost',
  'custom_host',
  'rule',
  'rules',
] as const

/**
 * 严格审查请求体，严防外部网络配置或动态规则参数注入
 */
function assertNoForbiddenParams(body: Record<string, unknown>): void {
  for (const key of FORBIDDEN_NETWORK_KEYS) {
    if (key in body && body[key] !== undefined && body[key] !== null) {
      throw new Error(
        `Security violation: parameter "${key}" is prohibited on controlled source endpoints`,
      )
    }
  }
}

function errStatus(message: string): 400 | 502 | 504 {
  if (
    /无法访问|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(
      message,
    )
  ) {
    return 504
  }
  if (
    /缺少|无效|bad|Security violation|Prohibited|prohibited|Unknown source|Egress policy/i.test(
      message,
    )
  ) {
    return 400
  }
  return 502
}

function cacheHeaders(hit: boolean): Record<string, string> {
  return { 'X-Cache': hit ? 'HIT' : 'MISS' }
}

/**
 * 获取固化视频源列表
 */
sourceRoutes.get('/list', async (c) => {
  const list = sourceRegistry.listSources()
  return c.json({ data: list })
})

/**
 * 视频源搜索
 */
sourceRoutes.post('/search', async (c) => {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: 'bad_request', message: '请求体必须为合法 JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'bad_request', message: '请求体必须为 JSON 对象' }, 400)
  }

  try {
    assertNoForbiddenParams(body)
  } catch (err) {
    return c.json(
      { error: 'forbidden_params', message: (err as Error).message },
      400,
    )
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''

  if (!source) {
    return c.json({ error: 'bad_request', message: '缺少 source 参数' }, 400)
  }
  if (!keyword) {
    return c.json({ error: 'bad_request', message: '缺少 keyword 参数' }, 400)
  }

  const adapter = sourceRegistry.getAdapter(source)
  if (!adapter) {
    return c.json({ error: 'bad_request', message: `Unknown source: ${source}` }, 400)
  }

  const sourceId = adapter.id
  const upstreamKey = sourceId
  const cacheKey = buildSourceCacheKey(sourceId, 'search', keyword.toLowerCase())
  const bypass = wantsCacheBypass(c)
  const clientIp = resolveIp(c)

  try {
    const { data, hit } = await guardedOp<PluginSearchResult>({
      kind: 'search',
      upstreamKey,
      cacheKey,
      clientIp,
      bypass,
      loader: () => sourceRegistry.search(sourceId, keyword),
      isEmpty: (res) => !res.items || res.items.length === 0,
      reformatResult: (res) => ({ ...res, pluginName: adapter.name || sourceId }),
    })
    return c.json({ data }, 200, cacheHeaders(hit))
  } catch (err) {
    if (err instanceof SourceRateLimitError) {
      c.header('Retry-After', String(err.retryAfterSec))
      return c.json(
        {
          error: 'source_rate_limited',
          message: err.message,
          retryAfterSec: err.retryAfterSec,
        },
        429,
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    if (/熔断冷却中/.test(message)) {
      return c.json({ error: 'circuit_breaker_tripped', message }, 504)
    }
    return c.json({ error: 'search_failed', message }, errStatus(message))
  }
})

/**
 * 视频源分集与线路获取
 */
sourceRoutes.post('/chapters', async (c) => {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: 'bad_request', message: '请求体必须为合法 JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'bad_request', message: '请求体必须为 JSON 对象' }, 400)
  }

  try {
    assertNoForbiddenParams(body)
  } catch (err) {
    return c.json(
      { error: 'forbidden_params', message: (err as Error).message },
      400,
    )
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const url =
    typeof body.url === 'string'
      ? body.url.trim()
      : typeof body.sourceUrl === 'string'
        ? body.sourceUrl.trim()
        : ''

  if (!source) {
    return c.json({ error: 'bad_request', message: '缺少 source 参数' }, 400)
  }
  if (!url) {
    return c.json({ error: 'bad_request', message: '缺少 url 参数' }, 400)
  }

  const adapter = sourceRegistry.getAdapter(source)
  if (!adapter) {
    return c.json({ error: 'bad_request', message: `Unknown source: ${source}` }, 400)
  }

  const sourceId = adapter.id
  const upstreamKey = sourceId
  const cacheKey = buildSourceCacheKey(sourceId, 'chapters', url.replace(/\/+$/, ''))
  const bypass = wantsCacheBypass(c)
  const clientIp = resolveIp(c)

  try {
    const { data, hit } = await guardedOp<PluginChapterResult>({
      kind: 'chapters',
      upstreamKey,
      cacheKey,
      clientIp,
      bypass,
      loader: () => sourceRegistry.chapters(sourceId, url),
      isEmpty: (res) => !res.roads || res.roads.length === 0,
      reformatResult: (res) => ({ ...res, pluginName: adapter.name || sourceId }),
    })
    return c.json({ data }, 200, cacheHeaders(hit))
  } catch (err) {
    if (err instanceof SourceRateLimitError) {
      c.header('Retry-After', String(err.retryAfterSec))
      return c.json(
        {
          error: 'source_rate_limited',
          message: err.message,
          retryAfterSec: err.retryAfterSec,
        },
        429,
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    if (/熔断冷却中/.test(message)) {
      return c.json({ error: 'circuit_breaker_tripped', message }, 504)
    }
    return c.json({ error: 'chapters_failed', message }, errStatus(message))
  }
})

/**
 * 视频源播放直链解析并注册 PlaybackAsset
 */
sourceRoutes.post('/resolve', async (c) => {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: 'bad_request', message: '请求体必须为合法 JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'bad_request', message: '请求体必须为 JSON 对象' }, 400)
  }

  try {
    assertNoForbiddenParams(body)
  } catch (err) {
    return c.json(
      { error: 'forbidden_params', message: (err as Error).message },
      400,
    )
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.trim() : ''

  if (!source) {
    return c.json({ error: 'bad_request', message: '缺少 source 参数' }, 400)
  }
  if (!pageUrl) {
    return c.json({ error: 'bad_request', message: '缺少 pageUrl 参数' }, 400)
  }

  const adapter = sourceRegistry.getAdapter(source)
  if (!adapter) {
    return c.json({ error: 'bad_request', message: `Unknown source: ${source}` }, 400)
  }

  const sourceId = adapter.id
  const clientIp = resolveIp(c)
  const limitCheck = checkSourceRateLimit(clientIp, sourceId, 'resolve')
  if (!limitCheck.allowed) {
    c.header('Retry-After', String(limitCheck.retryAfterSec))
    return c.json(
      {
        error: 'source_rate_limited',
        message: `该视频源请求过于频繁，请 ${limitCheck.retryAfterSec} 秒后重试`,
        retryAfterSec: limitCheck.retryAfterSec,
      },
      429,
    )
  }

  try {
    const data = await sourceRegistry.resolveAndRegister(sourceId, pageUrl)
    return c.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'resolve_failed', message }, errStatus(message))
  }
})
