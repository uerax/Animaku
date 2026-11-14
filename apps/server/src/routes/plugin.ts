import { Hono } from 'hono'
import {
  parsePluginRule,
  type PluginRule,
  type PluginSearchResult,
  type PluginChapterResult,
} from '@animaku/shared'
import {
  searchWithRule,
  chaptersWithRule,
  resolvePlay,
} from '../rule-engine'
import {
  PLUGIN_CACHE_TTL,
  PLUGIN_MAX_ENTRIES,
  cacheDelete,
  cacheGet,
  cacheGetOrSet,
  cacheSet,
  pluginCacheKey,
  resolveCacheTtlMs,
  wantsCacheBypass,
} from '../lib/ttl-cache'
import { pluginCircuitBreaker } from '../lib/source/plugin-circuit-breaker'
import {
  guardedOp,
  buildSourceCacheKey,
} from '../lib/source/guarded-ops'
import {
  resolveBuiltinSourceId,
  resolveUpstreamKey,
} from '../lib/source/resolve-builtin-id'
import { resolveIp } from '../lib/ip-rate-limit'
import {
  checkSourceRateLimit,
  SourceRateLimitError,
} from '../lib/source-rate-limit'

export const pluginRoutes = new Hono()

function errStatus(message: string): 400 | 502 | 504 {
  if (/无法访问|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|内网|禁止/i.test(message)) {
    if (/内网|禁止/.test(message)) return 400
    return 504
  }
  if (/缺少|无效|bad/i.test(message)) return 400
  return 502
}

function cacheHeaders(hit: boolean): Record<string, string> {
  return { 'X-Cache': hit ? 'HIT' : 'MISS' }
}

function parseRuleOrThrow(raw: unknown): PluginRule {
  return parsePluginRule(raw)
}

// validate only parses JSON — no network; keep open for settings import
pluginRoutes.post('/validate', async (c) => {
  const body = await c.req.json()
  try {
    const rule = parsePluginRule(body)
    return c.json({ ok: true, rule })
  } catch (e) {
    return c.json({ ok: false, message: (e as Error).message }, 400)
  }
})

// Exec routes allow web clients to query anime sources via server-side fetchPublic
// (Protected by SafeConnector SSRF mitigation, IP rate-limiting, and SQLite caching)
pluginRoutes.post('/search', async (c) => {
  const body = await c.req.json<{
    rule: unknown
    keyword: string
    title?: string
    bangumiId?: number | string
  }>()
  if (!body.keyword?.trim()) {
    return c.json({ error: 'bad_request', message: '缺少 keyword' }, 400)
  }
  if (!body.rule) {
    return c.json({ error: 'bad_request', message: '缺少 rule' }, 400)
  }
  let rule: PluginRule
  try {
    rule = parseRuleOrThrow(body.rule)
  } catch (e) {
    return c.json(
      { error: 'bad_request', message: e instanceof Error ? e.message : '规则无效' },
      400,
    )
  }
  const keyword = body.keyword.trim()
  const sourceId = resolveBuiltinSourceId(rule)
  const upstreamKey = sourceId || resolveUpstreamKey(rule)
  const cacheKey = sourceId
    ? buildSourceCacheKey(sourceId, 'search', keyword.toLowerCase())
    : pluginCacheKey('search', rule, keyword.toLowerCase())
  const bypass = wantsCacheBypass(c)
  const clientIp = resolveIp(c)

  try {
    const { data, hit } = await guardedOp<PluginSearchResult>({
      kind: 'search',
      upstreamKey,
      cacheKey,
      clientIp,
      bypass,
      loader: () => searchWithRule(rule, keyword),
      isEmpty: (res) => !res.items || res.items.length === 0,
      reformatResult: (res) => ({ ...res, pluginName: rule.name }),
    })
    return c.json({ data }, 200, cacheHeaders(hit))
  } catch (e) {
    if (e instanceof SourceRateLimitError) {
      c.header('Retry-After', String(e.retryAfterSec))
      return c.json(
        {
          error: 'source_rate_limited',
          message: e.message,
          retryAfterSec: e.retryAfterSec,
        },
        429,
      )
    }
    const message = e instanceof Error ? e.message : String(e)
    if (/熔断冷却中/.test(message)) {
      return c.json({ error: 'circuit_breaker_tripped', message }, 504)
    }
    console.error('[plugin/search]', message)
    return c.json({ error: 'search_failed', message }, errStatus(message))
  }
})

pluginRoutes.post('/chapters', async (c) => {
  const body = await c.req.json<{
    rule: unknown
    source: string
    title?: string
    bangumiId?: number | string
  }>()
  if (!body.source?.trim() || !body.rule) {
    return c.json({ error: 'bad_request', message: '缺少 rule 或 source' }, 400)
  }
  let rule: PluginRule
  try {
    rule = parseRuleOrThrow(body.rule)
  } catch (e) {
    return c.json(
      { error: 'bad_request', message: e instanceof Error ? e.message : '规则无效' },
      400,
    )
  }
  const source = body.source.trim().replace(/\/+$/, '')
  const sourceId = resolveBuiltinSourceId(rule)
  const upstreamKey = sourceId || resolveUpstreamKey(rule)
  const cacheKey = sourceId
    ? buildSourceCacheKey(sourceId, 'chapters', source)
    : pluginCacheKey('chapters', rule, source)
  const bypass = wantsCacheBypass(c)
  const clientIp = resolveIp(c)

  try {
    const { data, hit } = await guardedOp<PluginChapterResult>({
      kind: 'chapters',
      upstreamKey,
      cacheKey,
      clientIp,
      bypass,
      loader: () => chaptersWithRule(rule, source),
      isEmpty: (res) => !res.roads || res.roads.length === 0,
      reformatResult: (res) => ({ ...res, pluginName: rule.name }),
    })
    return c.json({ data }, 200, cacheHeaders(hit))
  } catch (e) {
    if (e instanceof SourceRateLimitError) {
      c.header('Retry-After', String(e.retryAfterSec))
      return c.json(
        {
          error: 'source_rate_limited',
          message: e.message,
          retryAfterSec: e.retryAfterSec,
        },
        429,
      )
    }
    const message = e instanceof Error ? e.message : String(e)
    if (/熔断冷却中/.test(message)) {
      return c.json({ error: 'circuit_breaker_tripped', message }, 504)
    }
    console.error('[plugin/chapters]', message)
    return c.json({ error: 'chapter_failed', message }, errStatus(message))
  }
})

pluginRoutes.post('/resolve', async (c) => {
  const body = await c.req.json<{
    rule: unknown
    pageUrl: string
    title?: string
    episode?: number | string
    bangumiId?: number | string
  }>()
  if (!body.pageUrl?.trim() || !body.rule) {
    return c.json({ error: 'bad_request', message: '缺少 rule 或 pageUrl' }, 400)
  }
  let rule: PluginRule
  try {
    rule = parseRuleOrThrow(body.rule)
  } catch (e) {
    return c.json(
      { error: 'bad_request', message: e instanceof Error ? e.message : '规则无效' },
      400,
    )
  }
  const pageUrl = body.pageUrl.trim()
  const key = pluginCacheKey('resolve', rule, pageUrl.replace(/\/+$/, ''))
  const bypass = wantsCacheBypass(c)
  try {
    if (!bypass) {
      const cached = cacheGet<Awaited<ReturnType<typeof resolvePlay>>>(key)
      if (cached) return c.json({ data: cached }, 200, cacheHeaders(true))
    }

    // 缓存未命中或请求 bypass 时对解析请求计次限频
    const sourceId = resolveBuiltinSourceId(rule)
    const upstreamKey = sourceId || resolveUpstreamKey(rule)
    const clientIp = resolveIp(c)
    const limitCheck = checkSourceRateLimit(clientIp, upstreamKey, 'resolve')
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

    // 限频通过后：若为 bypass 请求才删除旧缓存
    if (bypass) {
      cacheDelete(key)
    }

    // Single-flight: concurrent resolves for same page share one upstream parse.
    // Store with ttl=0 inside getOrSet (no write); classify + cacheSet after.
    const { value, hit: flightHit } = await cacheGetOrSet(
      key,
      0,
      () => resolvePlay(rule, pageUrl),
      { bypass: false, maxEntries: PLUGIN_MAX_ENTRIES },
    )
    // Another waiter may have populated after classify; treat as miss for header
    // only when we were the loader path without a prior HIT above.
    if (!flightHit) {
      const ttl = resolveCacheTtlMs(value)
      if (ttl > 0) cacheSet(key, value, ttl, PLUGIN_MAX_ENTRIES)
    }
    return c.json({ data: value }, 200, cacheHeaders(false))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[plugin/resolve]', message)
    // 502 = upstream / parse ceiling (not a bug in the route itself)
    return c.json(
      {
        error: 'resolve_failed',
        message,
        // Client can surface this as "换规则" guidance
        hint:
          'Web 端仅静态解析 HTML；需 JS/WebView 的源会失败，属能力上限而非媒体文件本身损坏。',
      },
      errStatus(message),
    )
  }
})
