import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import {
  parseBangumiItem,
  fromBangumiCollectionType,
  toBangumiCollectionType,
  type BangumiItem,
  type BangumiEpisode,
  type BangumiCollectionEntry,
  type CollectType,
  type BangumiUser,
  type BangumiRecommendationItem,
  type BangumiRecommendationsRequest,
  type BangumiRecommendationsPayload,
  type CommentItem,
  type CommentPagePayload,
  commentFilters,
} from '@animaku/shared'
import { config } from '../config'
import { bangumiFetch, getBearerToken } from '../lib/http'
import { setCommentsCdnHeaders } from '../lib/cdn-cache-headers'
import {
  BANGUMI_CACHE_TTL,
  cacheDelete,
  cacheGet,
  cacheSet,
  wantsCacheBypass,
} from '../lib/ttl-cache'

export const bangumiRoutes = new Hono()

function tokenFrom(c: { req: { header: (n: string) => string | undefined } }) {
  return getBearerToken(c.req.header('Authorization'))
}

async function getUsernameForToken(token: string): Promise<string | null> {
  const cacheKey = `bangumi:token-user:${createHash('sha256').update(token).digest('hex')}`
  const cached = cacheGet<string>(cacheKey)
  if (cached) return cached

  const meRes = await bangumiFetch(`${apiUrl}/v0/me`, { token })
  if (!meRes.ok) return null
  const me = (await meRes.json()) as { username?: string; id?: number }
  const username = me.username || (me.id ? String(me.id) : null)
  if (username) {
    // 缓存 1 小时，避免频繁请求 /v0/me
    cacheSet(cacheKey, username, 60 * 60_000)
  }
  return username
}

/** Drop heavy fields for list UIs (calendar / trending / search cards). */
function slimItem(item: BangumiItem): BangumiItem {
  return {
    ...item,
    summary: '',
    tags: item.tags?.slice(0, 6) ?? [],
    alias: [],
  }
}

function cacheHeaders(hit: boolean): Record<string, string> {
  return { 'X-Cache': hit ? 'HIT' : 'MISS' }
}

const apiUrl = config.bangumiApi
const apiHost = config.bangumiApiHost

bangumiRoutes.get('/calendar', async (c) => {
  const key = `bangumi:${apiHost}:calendar`
  const bypass = wantsCacheBypass(c)
  if (bypass) cacheDelete(key)
  else {
    const hit = cacheGet<{ data: BangumiItem[][] }>(key)
    if (hit) return c.json(hit, 200, cacheHeaders(true))
  }

  // Determine candidate URLs based on target host
  const tryUrls: string[] = []
  if (apiHost.includes('api.bgm.tv')) {
    tryUrls.push(`${config.bangumiNextApi}/p1/calendar`, `${apiUrl}/calendar`)
  } else {
    tryUrls.push(`${apiUrl}/calendar`, `${config.bangumiNextApi}/p1/calendar`)
  }

  let res: Response | null = null
  let lastError = 'upstream'
  for (const u of tryUrls) {
    try {
      const r = await bangumiFetch(u)
      if (r.ok) {
        res = r
        break
      } else {
        lastError = await r.text()
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!res || !res.ok) {
    return c.json({ error: 'upstream', message: lastError }, 502)
  }

  const json = (await res.json()) as unknown
  const days: BangumiItem[][] = []

  if (Array.isArray(json)) {
    // Array shape: [{ weekday: { id: 1, ... }, items: [{...}] }, ...]
    const byWeekday = new Map<number, unknown[]>()
    for (const dayEntry of json) {
      if (dayEntry && typeof dayEntry === 'object') {
        const d = dayEntry as { weekday?: { id?: number }; items?: unknown[] }
        const id = Number(d.weekday?.id ?? 0)
        if (id >= 1 && id <= 7 && Array.isArray(d.items)) {
          byWeekday.set(id, d.items)
        }
      }
    }
    for (let i = 1; i <= 7; i++) {
      const list = byWeekday.get(i) || []
      const items: BangumiItem[] = []
      for (const entry of list) {
        try {
          const e = entry as Record<string, unknown>
          const subject = (e.subject as Record<string, unknown>) || e
          items.push(slimItem(parseBangumiItem(subject)))
        } catch {
          /* skip */
        }
      }
      days.push(items)
    }
  } else if (json && typeof json === 'object') {
    // Object shape: { "1": [{ subject: {...} }, ...], ... }
    const record = json as Record<string, unknown>
    for (let i = 1; i <= 7; i++) {
      const list = (record[String(i)] as unknown[]) || []
      const items: BangumiItem[] = []
      for (const entry of list) {
        try {
          const e = entry as Record<string, unknown>
          const subject = (e.subject as Record<string, unknown>) || e
          items.push(slimItem(parseBangumiItem(subject)))
        } catch {
          /* skip */
        }
      }
      days.push(items)
    }
  }

  const payload = { data: days }
  cacheSet(key, payload, BANGUMI_CACHE_TTL.calendar)
  return c.json(payload, 200, cacheHeaders(false))
})

function getCurrentSeasonAirDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  const seasonMonth = Math.floor((month - 1) / 3) * 3 + 1
  const padMonth = String(seasonMonth).padStart(2, '0')
  return `${year}-${padMonth}-01`
}

bangumiRoutes.get('/trending', async (c) => {
  const limit = c.req.query('limit') || '24'
  const offset = c.req.query('offset') || '0'
  const type = c.req.query('type') || '2'
  const key = `bangumi:${apiHost}:trending:${type}:${limit}:${offset}`
  const bypass = wantsCacheBypass(c)
  if (bypass) cacheDelete(key)
  else {
    const hit = cacheGet<{ data: BangumiItem[] }>(key)
    if (hit) return c.json(hit, 200, cacheHeaders(true))
  }

  let items: BangumiItem[] = []
  let success = false
  let lastError = 'upstream'

  // Attempt 1: p1/trending/subjects (provided by next.bgm.tv)
  try {
    const url = new URL(`${config.bangumiNextApi}/p1/trending/subjects`)
    url.searchParams.set('type', type)
    url.searchParams.set('limit', limit)
    url.searchParams.set('offset', offset)
    const res = await bangumiFetch(url.toString())
    if (res.ok) {
      const json = (await res.json()) as { data?: unknown[] }
      if (Array.isArray(json.data) && json.data.length > 0) {
        for (const entry of json.data) {
          try {
            const e = entry as Record<string, unknown>
            const subject = (e.subject as Record<string, unknown>) || e
            items.push(slimItem(parseBangumiItem(subject)))
          } catch {
            /* skip */
          }
        }
        if (items.length > 0) {
          success = true
        }
      }
    } else {
      lastError = await res.text()
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  }

  // Attempt 2: Fallback to /v0/search/subjects filtered by current season and sorted by heat
  if (!success) {
    try {
      const seasonStart = getCurrentSeasonAirDate()
      const searchUrl = `${apiUrl}/v0/search/subjects?limit=${limit}&offset=${offset}`
      const res = await bangumiFetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sort: 'heat',
          filter: {
            type: [Number(type) || 2],
            nsfw: false,
            air_date: [`>=${seasonStart}`],
          },
        }),
      })
      if (res.ok) {
        const json = (await res.json()) as { data?: unknown[] }
        items = []
        for (const entry of json.data || []) {
          try {
            items.push(slimItem(parseBangumiItem(entry as Record<string, unknown>)))
          } catch {
            /* skip */
          }
        }
        if (items.length > 0) {
          success = true
        }
      } else {
        lastError = await res.text()
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!success) {
    return c.json({ error: 'upstream', message: lastError }, 502)
  }

  const payload = { data: items }
  cacheSet(key, payload, BANGUMI_CACHE_TTL.trending)
  return c.json(payload, 200, cacheHeaders(false))
})

/** Bangumi /v0/search/subjects sort values we expose. */
const SEARCH_SORTS = new Set(['match', 'heat', 'rank', 'score'])

/** Only allow Bangumi-style air_date comparisons (blocks injection-y strings). */
const AIR_DATE_EXPR = /^(>=|<=|>|<)?\d{4}-\d{2}-\d{2}$/

/**
 * Browse / search anime subjects.
 * Supports keyword, tags, year / airDate (season quarters), and sort.
 * `sort: 'date'` is not a Bangumi upstream value — we use heat + optional year
 * filter, then order the page by airDate (desc) for 放送时间 UX.
 * NSFW is always filtered out (`nsfw: false`); no client override.
 */
type SearchPayload = {
  data: BangumiItem[]
  total?: number
  limit: number
  offset: number
  sort: string
}

/** Stable cache key from normalized search inputs (public lists only). */
function browseCacheKey(parts: {
  apiHost: string
  keyword: string
  sort: string
  tags: string[]
  types: number[]
  airDate: string[]
  limit: number
  offset: number
}): string {
  const tags = [...parts.tags].sort().join(',')
  const types = [...parts.types].sort().join(',')
  const air = [...parts.airDate].sort().join(',')
  return `bangumi:${parts.apiHost}:browse:${parts.keyword}\0${parts.sort}\0${tags}\0${types}\0${air}\0${parts.limit}\0${parts.offset}`
}

bangumiRoutes.post('/search', async (c) => {
  const body = await c.req.json<{
    keyword?: string
    limit?: number
    offset?: number
    sort?: string
    tags?: string[]
    /** Subject type filter (e.g. 2 for anime, 6 for real/tv/movie). Defaults to [2, 6] */
    type?: number[] | number
    /** Calendar year, e.g. 2024 — maps to air_date [>=Y-01-01, <Y+1-01-01] */
    year?: number | null
    /** Explicit air_date filter expressions, e.g. [">=2020-01-01", "<2021-01-01"] */
    airDate?: string[]
  }>()
  const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50)
  const offset = Math.max(Number(body.offset) || 0, 0)
  const requestedSort = (body.sort || 'heat').toLowerCase()
  const sortByDate = requestedSort === 'date' || requestedSort === 'airdate'
  const upstreamSort = sortByDate
    ? 'heat'
    : SEARCH_SORTS.has(requestedSort)
      ? requestedSort
      : 'heat'
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
    : []

  const airDate: string[] = []
  if (Array.isArray(body.airDate)) {
    for (const expr of body.airDate) {
      if (typeof expr !== 'string') continue
      const s = expr.trim()
      if (AIR_DATE_EXPR.test(s)) airDate.push(s)
    }
  }
  const year =
    body.year != null && Number.isFinite(Number(body.year))
      ? Math.trunc(Number(body.year))
      : null
  if (year != null && year >= 1900 && year <= 2100 && airDate.length === 0) {
    airDate.push(`>=${year}-01-01`, `<${year + 1}-01-01`)
  }

  const rawTypes = Array.isArray(body.type)
    ? body.type
    : body.type != null && Number(body.type) > 0
      ? [Number(body.type)]
      : [2, 6]
  const types = rawTypes
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  const finalTypes = types.length > 0 ? types : [2, 6]

  const keyword = body.keyword || ''
  const resultSort = sortByDate ? 'date' : upstreamSort
  const key = browseCacheKey({
    apiHost,
    keyword,
    sort: resultSort,
    tags,
    types: finalTypes,
    airDate,
    limit,
    offset,
  })
  const bypass = wantsCacheBypass(c)
  if (bypass) cacheDelete(key)
  else {
    const hit = cacheGet<SearchPayload>(key)
    if (hit) return c.json(hit, 200, cacheHeaders(true))
  }

  const filter: Record<string, unknown> = {
    type: finalTypes,
    // Always exclude NSFW — not client-configurable
    nsfw: false,
  }
  if (tags.length) filter.tag = tags
  if (airDate.length) filter.air_date = airDate
  // rank sort needs ranked subjects; score sort also benefits from ranked set
  if (upstreamSort === 'rank' || upstreamSort === 'score') {
    filter.rank = ['>0', '<=99999']
  } else {
    filter.rank = ['>=0', '<=99999']
  }

  const params = {
    keyword,
    sort: upstreamSort,
    filter,
  }
  const url = `${apiUrl}/v0/search/subjects?limit=${limit}&offset=${offset}`
  const res = await bangumiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    return c.json({ error: 'upstream', message: await res.text() }, 502)
  }
  const json = (await res.json()) as { data?: unknown[]; total?: number }
  let items: BangumiItem[] = []
  for (const entry of json.data || []) {
    try {
      items.push(slimItem(parseBangumiItem(entry as Record<string, unknown>)))
    } catch {
      /* skip */
    }
  }
  if (sortByDate) {
    items = items.slice().sort((a, b) => {
      const da = a.airDate || ''
      const db = b.airDate || ''
      if (da === db) return 0
      // empty dates last
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    })
  }
  const payload: SearchPayload = {
    data: items,
    total: json.total,
    limit,
    offset,
    sort: resultSort,
  }
  cacheSet(key, payload, BANGUMI_CACHE_TTL.browse)
  return c.json(payload, 200, cacheHeaders(false))
})

bangumiRoutes.get('/subjects/:id', async (c) => {
  const id = c.req.param('id')
  const key = `bangumi:${apiHost}:subject:${id}`
  const bypass = wantsCacheBypass(c)
  if (bypass) cacheDelete(key)
  else {
    const hit = cacheGet<{ data: BangumiItem }>(key)
    if (hit) return c.json(hit, 200, cacheHeaders(true))
  }

  const res = await bangumiFetch(`${apiUrl}/v0/subjects/${id}`)
  if (!res.ok) {
    return c.json(
      { error: 'upstream', message: await res.text() },
      res.status as 404,
    )
  }
  const json = (await res.json()) as Record<string, unknown>
  // Full item (not slimItem): watch needs summary / alias / tags for keywords
  const payload = { data: parseBangumiItem(json) }
  cacheSet(key, payload, BANGUMI_CACHE_TTL.subject)
  return c.json(payload, 200, cacheHeaders(false))
})

bangumiRoutes.get('/subjects/:id/episodes', async (c) => {
  const id = c.req.param('id')
  const url = new URL(`${apiUrl}/v0/episodes`)
  url.searchParams.set('subject_id', id)
  url.searchParams.set('limit', c.req.query('limit') || '200')
  url.searchParams.set('offset', c.req.query('offset') || '0')
  if (c.req.query('type')) {
    url.searchParams.set('type', c.req.query('type')!)
  }
  const res = await bangumiFetch(url.toString())
  if (!res.ok) {
    return c.json({ error: 'upstream', message: await res.text() }, 502)
  }
  const json = (await res.json()) as { data?: Record<string, unknown>[]; total?: number }
  const episodes: BangumiEpisode[] = (json.data || []).map((e) => ({
    id: Number(e.id),
    type: Number(e.type ?? 0),
    sort: Number(e.sort ?? e.ep ?? 0),
    name: String(e.name ?? ''),
    nameCn: String(e.name_cn ?? ''),
    airdate: String(e.airdate ?? ''),
    ep: e.ep != null ? Number(e.ep) : undefined,
    duration_seconds: Number(e.duration_seconds ?? 0),
  }))
  return c.json({ data: episodes, total: json.total })
})

bangumiRoutes.get('/me', async (c) => {
  const token = tokenFrom(c)
  if (!token) return c.json({ error: 'unauthorized', message: '缺少 Access Token' }, 401)
  const res = await bangumiFetch(`${apiUrl}/v0/me`, { token })
  if (!res.ok) {
    return c.json({ error: 'upstream', message: await res.text() }, res.status as 401)
  }
  const json = (await res.json()) as Record<string, unknown>
  const user: BangumiUser = {
    id: Number(json.id),
    username: String(json.username ?? json.nickname ?? ''),
    nickname: String(json.nickname ?? json.username ?? ''),
    avatar: (json.avatar as Record<string, string>) || undefined,
  }
  return c.json({ data: user })
})

bangumiRoutes.get('/collections', async (c) => {
  const token = tokenFrom(c)
  if (!token) return c.json({ error: 'unauthorized', message: '缺少 Access Token' }, 401)
  const username = await getUsernameForToken(token)
  if (!username) {
    return c.json({ error: 'unauthorized', message: '无法获取用户信息或 Access Token 无效' }, 401)
  }

  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 24, 1), 50)
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
  const type = c.req.query('type') // bangumi collection type filter optional
  const url = new URL(
    `${apiUrl}/v0/users/${encodeURIComponent(username)}/collections`,
  )
  url.searchParams.set('subject_type', '2')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))
  if (type) url.searchParams.set('type', type)

  const res = await bangumiFetch(url.toString(), { token })
  if (!res.ok) {
    return c.json({ error: 'upstream', message: await res.text() }, 502)
  }
  const json = (await res.json()) as { data?: Record<string, unknown>[]; total?: number }
  const data: BangumiCollectionEntry[] = (json.data || []).map((row) => {
    const subject = row.subject as Record<string, unknown> | undefined
    return {
      subjectId: Number(row.subject_id ?? subject?.id ?? 0),
      type: fromBangumiCollectionType(Number(row.type ?? 0)),
      updatedAt: String(row.updated_at ?? ''),
      epStatus: row.ep_status != null ? Number(row.ep_status) : undefined,
      rate: row.rate != null ? Number(row.rate) : undefined,
      comment: row.comment != null ? String(row.comment) : undefined,
      subject: subject ? parseBangumiItem(subject) : undefined,
    }
  })
  return c.json({ data, total: json.total, limit, offset })
})

bangumiRoutes.put('/collections/:subjectId', async (c) => {
  const token = tokenFrom(c)
  if (!token) return c.json({ error: 'unauthorized', message: '缺少 Access Token' }, 401)
  const subjectId = c.req.param('subjectId')
  const body = await c.req.json<{ type: CollectType }>()
  const bgmType = toBangumiCollectionType(body.type)
  if (bgmType == null) {
    return c.json({ error: 'bad_request', message: '无效收藏类型' }, 400)
  }
  const res = await bangumiFetch(
    `${apiUrl}/v0/users/-/collections/${subjectId}`,
    {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: bgmType }),
    },
  )
  // Bangumi returns 204 on success for some versions, 200 with body for others
  if (!res.ok && res.status !== 204) {
    // try PATCH for update
    const res2 = await bangumiFetch(
      `${apiUrl}/v0/users/-/collections/${subjectId}`,
      {
        method: 'PATCH',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: bgmType }),
      },
    )
    if (!res2.ok && res2.status !== 204) {
      return c.json(
        { error: 'upstream', message: await res2.text() },
        res2.status as 400,
      )
    }
  }
  return c.json({ ok: true, type: body.type })
})

bangumiRoutes.get('/collections/:subjectId', async (c) => {
  const token = tokenFrom(c)
  if (!token) return c.json({ error: 'unauthorized', message: '缺少 Access Token' }, 401)
  const subjectId = c.req.param('subjectId')
  const username = await getUsernameForToken(token)
  if (!username) {
    return c.json({ error: 'unauthorized', message: '无法获取用户信息或 Access Token 无效' }, 401)
  }
  const res = await bangumiFetch(
    `${apiUrl}/v0/users/${encodeURIComponent(username)}/collections/${subjectId}`,
    { token },
  )
  if (res.status === 404) {
    return c.json({ data: null })
  }
  if (!res.ok) {
    return c.json({ error: 'upstream', message: await res.text() }, 502)
  }
  const row = (await res.json()) as Record<string, unknown>
  const entry: BangumiCollectionEntry = {
    subjectId: Number(row.subject_id ?? subjectId),
    type: fromBangumiCollectionType(Number(row.type ?? 0)),
    updatedAt: String(row.updated_at ?? ''),
    epStatus: row.ep_status != null ? Number(row.ep_status) : undefined,
    rate: row.rate != null ? Number(row.rate) : undefined,
    comment: row.comment != null ? String(row.comment) : undefined,
  }
  return c.json({ data: entry })
})

const DEFAULT_RECOMMENDATION_LIMIT = 6
const BANGUMI_MAX_SEARCH_WINDOW = 1000

export interface SamplePlan {
  offset: number
  limit: number
}

/**
 * 自适应分桶采样计划生成器：
 * 1. 物理视窗安全截断：Bangumi 官方搜索引擎底层限制 max_result_window = 1000；
 * 2. 闭区间映射 [floor(i*M/K), floor((i+1)*M/K)]：彻底消除整除余数遗漏与跨象限重叠；
 * 3. 动态自适应 K 值 (K <= maxRequests)：小规模单次拉全量，中规模降为 2~3 象限，大规模 4 象限。
 */
export function buildAdaptiveSamplePlan(
  total: number,
  opts?: {
    maxRequests?: number
    limitPerBucket?: number
  },
): SamplePlan[] {
  const maxRequests = Math.max(1, opts?.maxRequests ?? 4)
  const limitPerBucket = Math.max(1, opts?.limitPerBucket ?? 15)

  const safeTotal = Math.max(0, Math.min(total, BANGUMI_MAX_SEARCH_WINDOW))
  if (safeTotal === 0) return []

  // 小规模场景 (total <= 30)：单次全量精准拉回，0 遗漏
  if (safeTotal <= 30) {
    return [{ offset: 0, limit: safeTotal }]
  }

  // 根据总数自适应推导象限数量，并受 maxRequests 参数硬上限约束
  let naturalBuckets = 4
  if (safeTotal < limitPerBucket * 3) {
    naturalBuckets = 2 // 31 ~ 44 部
  } else if (safeTotal < limitPerBucket * 5) {
    naturalBuckets = 3 // 45 ~ 74 部
  }

  const bucketCount = Math.min(maxRequests, naturalBuckets)
  const plans: SamplePlan[] = []

  for (let i = 0; i < bucketCount; i++) {
    const rangeStart = Math.floor((i * safeTotal) / bucketCount)
    const rangeEnd = Math.floor(((i + 1) * safeTotal) / bucketCount)
    const rangeWidth = rangeEnd - rangeStart

    const actualLimit = Math.min(limitPerBucket, rangeWidth)
    const maxOffset = Math.max(rangeStart, rangeEnd - actualLimit)

    // 当 rangeWidth <= actualLimit 时，maxOffset === rangeStart，象限退化为全量覆盖拉取（自由度为 0）
    const randomOffset =
      maxOffset > rangeStart
        ? rangeStart + Math.floor(Math.random() * (maxOffset - rangeStart + 1))
        : rangeStart

    plans.push({
      offset: randomOffset,
      limit: actualLimit,
    })
  }

  return plans
}

const NOISE_TIME_REGEX =
  /^(\d{4}年?(\d{1,2}月)?|\d{1,2}月|\d{4}s|\d{2}年代|\d{4}(春|夏|秋|冬)|(春|夏|秋|冬)季番|\d{4})$/i

const NOISE_TAGS = new Set([
  '日本',
  'TV',
  '日本动画',
  'TV动画',
  'WEB',
  'web',
  'ONA',
  'OVA',
  'OAD',
  '动画',
  '国产',
  '中国',
  '欧美',
  '韩国',
  '漫画改',
  '小说改',
  '轻小说改',
  '漫改',
  '轻改',
  '原创',
  '续作',
  '第二季',
  '第三季',
  '游戏改',
  '神作',
  '补番',
  '烂尾',
  '弃坑',
  '待看',
  '经典',
  '推荐',
  '名作',
  '剧场版',
  '动画电影',
  '电影',
])

const FALLBACK_GENRE_TAGS = [
  '日常',
  '搞笑',
  '奇幻',
  '热血',
  '战斗',
  '科幻',
  '治愈',
  '恋爱',
  '校园',
  '悬疑',
  '冒险',
  '青春',
]

function cleanAndPickTags(
  rawTags: string[],
  isMovie?: boolean,
  country: string = '日本',
): { pickedTags: string[]; searchTags: string[] } {
  const cleaned: string[] = []
  for (const raw of rawTags) {
    const t = String(raw || '').trim()
    if (!t) continue
    if (NOISE_TIME_REGEX.test(t)) continue
    if (NOISE_TAGS.has(t)) continue
    if (!cleaned.includes(t)) cleaned.push(t)
  }
  // Random shuffle for fresh exploration per cycle
  const shuffled = cleaned.slice().sort(() => 0.5 - Math.random())
  const picked = shuffled.slice(0, 2)

  // 若有效 Tag 不足 2 个，从通用主流题材池中随机补充保底
  if (picked.length < 2) {
    const available = FALLBACK_GENRE_TAGS.filter((t) => !picked.includes(t))
    const randomFallbacks = available.sort(() => 0.5 - Math.random())
    while (picked.length < 2 && randomFallbacks.length > 0) {
      picked.push(randomFallbacks.pop()!)
    }
  }

  const search = [country, ...picked]
  if (isMovie && !search.includes('剧场版')) {
    search.push('剧场版')
  }
  return { pickedTags: picked, searchTags: search }
}

function extractYear(airDate?: string): string {
  if (!airDate) return ''
  const m = /^(\d{4})/.exec(airDate.trim())
  return m ? m[1] : ''
}

function formatEpsLabel(item: {
  eps?: number
  total_episodes?: number
  totalEpisodes?: number
}): string {
  const total = item.totalEpisodes || item.total_episodes || item.eps || 0
  if (total > 0) return `全${total}话`
  return ''
}

bangumiRoutes.post('/recommendations', async (c) => {
  const body = await c.req.json<BangumiRecommendationsRequest>()
  const subjectId = Number(body.subjectId)
  if (!Number.isFinite(subjectId) || subjectId <= 0) {
    return c.json({ error: 'bad_request', message: '无效的 subjectId' }, 400)
  }

  const key = `bangumi:${apiHost}:rec:${subjectId}`
  const bypass = wantsCacheBypass(c)
  if (bypass) {
    cacheDelete(key)
  } else {
    const hit = cacheGet<BangumiRecommendationsPayload>(key)
    if (hit) {
      return c.json({ data: hit }, 200, cacheHeaders(true))
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  // 1. Fetch relations for Slot 0 determination (type: 2 anime only)
  let slot0: BangumiRecommendationItem | null = null
  const seenSubjectIds = new Set<number>([subjectId])

  try {
    const relRes = await bangumiFetch(`${apiUrl}/v0/subjects/${subjectId}/subjects`)
    if (relRes.ok) {
      const relJson = (await relRes.json()) as Array<{
        id: number
        type: number
        name?: string
        name_cn?: string
        relation?: string
        images?: Record<string, string>
        rating?: { score?: number }
        date?: string
        eps?: number
        total_episodes?: number
      }>
      if (Array.isArray(relJson)) {
        const animeRelations = relJson.filter((r) => Number(r.type) === 2 && r.id > 0)

        // Priority 1: Next / Sequel
        const nextRel = animeRelations.find(
          (r) =>
            r.relation === '续集' ||
            r.relation === '主线故事' ||
            r.relation === '不同演绎',
        )
        // Priority 2: Prequel (when current is final season / latest)
        const prevRel = !nextRel
          ? animeRelations.find((r) => r.relation === '前传')
          : undefined

        const chosenRel = nextRel || prevRel
        if (chosenRel) {
          const rawImages = chosenRel.images || {}
          let rawCover =
            rawImages.medium ||
            rawImages.common ||
            rawImages.large ||
            rawImages.small ||
            rawImages.grid ||
            ''

          let score = 0
          let airDate = ''
          let totalEps = 0

          // Bangumi /subjects/:id/subjects (relations endpoint) only returns shallow fields (no date, eps, score).
          // Fetch the full subject detail for Slot 0 (1 single light fetch, backed by subject TTL cache).
          try {
            const detailCacheKey = `bangumi:${apiHost}:subject:${chosenRel.id}`
            const cachedDetail = cacheGet<{ data: BangumiItem }>(detailCacheKey)
            if (cachedDetail?.data) {
              const d = cachedDetail.data
              score = d.ratingScore || 0
              airDate = d.airDate || ''
              totalEps = d.totalEpisodes || d.eps || 0
              if (!rawCover) {
                rawCover =
                  d.images?.medium || d.images?.common || d.images?.large || ''
              }
            } else {
              const detailRes = await bangumiFetch(
                `${apiUrl}/v0/subjects/${chosenRel.id}`,
              )
              if (detailRes.ok) {
                const detailJson =
                  (await detailRes.json()) as Record<string, unknown>
                const parsedItem = parseBangumiItem(detailJson)
                cacheSet(
                  detailCacheKey,
                  { data: parsedItem },
                  BANGUMI_CACHE_TTL.subject,
                )
                score = parsedItem.ratingScore || 0
                airDate = parsedItem.airDate || ''
                totalEps = parsedItem.totalEpisodes || parsedItem.eps || 0
                if (!rawCover) {
                  rawCover =
                    parsedItem.images?.medium ||
                    parsedItem.images?.common ||
                    parsedItem.images?.large ||
                    ''
                }
              }
            }
          } catch {
            /* ignore detail fetch error */
          }

          const isFutureAnime = airDate && airDate.trim().slice(0, 10) > todayStr
          if (!isFutureAnime) {
            const isMovieTitle =
              (chosenRel.name_cn || chosenRel.name || '').includes('剧场版') ||
              (chosenRel.name_cn || chosenRel.name || '').includes('电影')

            let relationBadge: BangumiRecommendationItem['relationBadge'] = '续作'
            if (nextRel) {
              relationBadge = isMovieTitle ? '剧场版' : '续作'
            } else if (prevRel) {
              relationBadge = '前作'
            }

            slot0 = {
              id: chosenRel.id,
              name: String(chosenRel.name ?? ''),
              nameCn: String(chosenRel.name_cn || chosenRel.name || ''),
              cover: rawCover,
              score: Number(score.toFixed(1)),
              year: extractYear(airDate),
              epsLabel: totalEps > 0 ? `全${totalEps}话` : '',
              relationBadge,
            }
            seenSubjectIds.add(chosenRel.id)
          }
        }
      }
    }
  } catch {
    /* ignore relations fetch error, fallback to all similar */
  }

  // 2. Pick 2 random feature tags from client tags & combine with country tag
  const country = String(body.country || '').trim() || '日本'
  const rawTags = Array.isArray(body.tags) ? body.tags : []
  const { pickedTags, searchTags } = cleanAndPickTags(
    rawTags,
    body.isMovie,
    country,
  )

  // 3. Search candidate pool using adaptive multi-bucket sampling
  const targetSimilarCount = slot0
    ? DEFAULT_RECOMMENDATION_LIMIT - 1
    : DEFAULT_RECOMMENDATION_LIMIT

  type SearchCandidate = {
    id: number
    name: string
    name_cn?: string
    images?: Record<string, string>
    rating?: { score?: number }
    air_date?: string
    date?: string
    eps?: number
    total_episodes?: number
  }

  const querySearch = async (
    tags: string[],
    limit: number,
    offset = 0,
  ): Promise<{ data: SearchCandidate[]; total: number }> => {
    try {
      const searchUrl = `${apiUrl}/v0/search/subjects?limit=${limit}&offset=${offset}`
      const res = await bangumiFetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sort: 'match',
          filter: {
            type: [2],
            tag: tags.length > 0 ? tags : undefined,
            air_date: [`<=${todayStr}`],
            nsfw: false,
          },
        }),
      })
      if (res.ok) {
        const json = (await res.json()) as { data?: SearchCandidate[]; total?: number }
        return {
          data: json.data || [],
          total: Number(json.total ?? 0),
        }
      }
    } catch {
      /* ignore */
    }
    return { data: [], total: 0 }
  }

  // Fetch candidates using adaptive multi-bucket plan
  const fetchSampledPool = async (tags: string[]): Promise<SearchCandidate[]> => {
    // 1. Probe total with limit 1
    const probe = await querySearch(tags, 1, 0)
    const total = probe.total
    if (total <= 0) return []

    // 2. Build adaptive plan (auto scale 1~4 buckets, clean range mapping)
    const plans = buildAdaptiveSamplePlan(total, { maxRequests: 4, limitPerBucket: 15 })
    if (plans.length === 0) return []

    // 3. Concurrent fetch all plan buckets via Promise.all
    const chunkPromises = plans.map((p) => querySearch(tags, p.limit, p.offset))
    const chunks = await Promise.all(chunkPromises)
    return chunks.flatMap((c) => c.data)
  }

  let candidatePool: SearchCandidate[] = []

  // Attempt 1: search with country + picked 2 tags (+ movie tag if applicable)
  candidatePool = await fetchSampledPool(searchTags)

  // Attempt 2: fallback to country + 1st tag if results < target
  if (candidatePool.length < targetSimilarCount && pickedTags.length > 1) {
    const fallbackTags = [country, pickedTags[0]]
    if (body.isMovie) fallbackTags.push('剧场版')
    const fallbackList = await fetchSampledPool(fallbackTags)
    if (fallbackList.length > candidatePool.length) {
      candidatePool = fallbackList
    }
  }

  // Attempt 3: fallback to country (+ movie tag) if still empty
  if (candidatePool.length < targetSimilarCount) {
    const generalTags = [country]
    if (body.isMovie) generalTags.push('剧场版')
    const generalList = await fetchSampledPool(generalTags)
    if (generalList.length > 0) {
      candidatePool = [...candidatePool, ...generalList]
    }
  }

  // Filter out seen subject IDs (self + Slot 0)
  const availableCandidates = candidatePool.filter(
    (c) => c && c.id > 0 && !seenSubjectIds.has(c.id),
  )

  // Random sample targetSimilarCount from available pool
  const shuffledCandidates = availableCandidates
    .slice()
    .sort(() => 0.5 - Math.random())
  const selectedSimilar = shuffledCandidates.slice(0, targetSimilarCount)

  const similarItems: BangumiRecommendationItem[] = selectedSimilar.map(
    (item) => {
      const rawImages = (item.images || {}) as Record<string, string>
      const rawCover =
        rawImages.medium ||
        rawImages.common ||
        rawImages.large ||
        rawImages.small ||
        rawImages.grid ||
        ''
      const cover = rawCover
      const airDate = String(item.air_date || item.date || '')

      return {
        id: item.id,
        name: String(item.name ?? ''),
        nameCn: String(item.name_cn || item.name || ''),
        cover,
        score: Number(Number(item.rating?.score ?? 0).toFixed(1)),
        year: extractYear(airDate),
        epsLabel: formatEpsLabel(item),
      }
    },
  )

  const items: BangumiRecommendationItem[] = slot0
    ? [slot0, ...similarItems]
    : similarItems

  const payload: BangumiRecommendationsPayload = {
    items,
    matchedTags: [country, ...pickedTags],
  }

  cacheSet(key, payload, BANGUMI_CACHE_TTL.recommendations)
  return c.json({ data: payload }, 200, cacheHeaders(false))
})

interface CommentChunkData {
  items: CommentItem[]
  total: number
}

/** 前端标准单页条数 (固定 10 条，与左右布局高度 1:1 对称) */
const COMMENTS_PAGE_SIZE = 10
/** 服务端单次预取块大小 (固定 30 条 = 3 个标准页面，数学上严格整除 0 跨块碎片) */
const COMMENTS_CHUNK_SIZE = 30
/** 防刷安全上限页码 (覆盖 20,000 条数据，杜绝爬虫/非法大数穿透击穿上游) */
const COMMENTS_MAX_SAFE_PAGE = 2000
/** Bangumi 收藏类型有效参数白名单 (1想看, 2看过, 3在看, 4搁置, 5抛弃) */
const VALID_COLLECT_TYPES = new Set(['1', '2', '3', '4', '5'])

export interface BangumiRawCommentRow {
  id?: number | string
  user?: {
    id?: number | string
    username?: string
    nickname?: string
    avatar?: {
      small?: string
      medium?: string
      large?: string
    }
    group?: number
    sign?: string
  }
  type?: number
  rate?: number
  comment?: string
  updatedAt?: number | string
}

/**
 * 将 Bangumi 原始评论行转换为统一领域模型 CommentItem (纯函数，无 I/O)
 */
export function parseBangumiCommentRow(
  row: BangumiRawCommentRow,
  fallbackIndex: number,
): CommentItem {
  const u = row.user || {}
  const rawAvatars = u.avatar || {}
  const rawAvatar =
    rawAvatars.large || rawAvatars.medium || rawAvatars.small || ''
  const avatar = rawAvatar

  let createdAt = ''
  if (row.updatedAt) {
    if (typeof row.updatedAt === 'number') {
      createdAt = new Date(row.updatedAt * 1000).toISOString()
    } else {
      createdAt = String(row.updatedAt)
    }
  }

  const rateNum = Number(row.rate ?? 0)
  const rate = rateNum >= 1 && rateNum <= 10 ? rateNum : undefined
  const colType =
    row.type != null ? fromBangumiCollectionType(Number(row.type)) : undefined

  return {
    id: row.id ?? `${u.id || u.username || 'anon'}-${fallbackIndex}`,
    source: 'bangumi' as const,
    author: {
      id: u.id ?? 0,
      username: String(u.username ?? ''),
      nickname: String(u.nickname ?? u.username ?? '匿名用户'),
      avatar,
      userGroup: u.group,
      sign: u.sign,
    },
    content: String(row.comment ?? '').trim(),
    rate,
    collectionType: colType,
    createdAt,
    stats: {
      likeCount: 0,
      replyCount: 0,
    },
  }
}

bangumiRoutes.get('/subjects/:id/comments', async (c) => {
  const rawSubjectId = Number(c.req.param('id'))
  const subjectId =
    Number.isFinite(rawSubjectId) &&
    Number.isInteger(rawSubjectId) &&
    rawSubjectId > 0
      ? rawSubjectId
      : 0
  if (!subjectId) {
    return c.json({ error: 'bad_request', message: '无效的 subjectId' }, 400)
  }

  const rawPage = Number(c.req.query('page') || 1)
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1
  // 🔥 防御性约束：显式锁定单页大小为标准 10 条，杜绝外部篡改与非整除跨块碎片
  const pageSize = COMMENTS_PAGE_SIZE

  // 🛡️ 最大安全页码拦截：超大页码秒回空数据，0 上游网络请求，防爬虫击穿
  if (page > COMMENTS_MAX_SAFE_PAGE) {
    const emptyPayload: CommentPagePayload = {
      data: [],
      total: 0,
      page,
      pageSize,
    }
    return c.json(emptyPayload, 200, cacheHeaders(true))
  }

  const targetOffset = (page - 1) * pageSize
  const rawType = c.req.query('type')
  const type = rawType && VALID_COLLECT_TYPES.has(rawType) ? rawType : undefined

  // 计算当前目标页对应的独立分块索引 (每个 Chunk 覆盖 30 条数据 / 3 个页面)
  const chunkIndex = Math.floor(targetOffset / COMMENTS_CHUNK_SIZE)
  const chunkStartOffset = chunkIndex * COMMENTS_CHUNK_SIZE
  const relativeIndex = targetOffset - chunkStartOffset

  const chunkKey = `bangumi:${apiHost}:comments_chunk:${subjectId}:${chunkIndex}:${type || 'all'}`
  const bypass = wantsCacheBypass(c)
  if (bypass) {
    cacheDelete(chunkKey)
  }

  let chunk = bypass ? undefined : cacheGet<CommentChunkData>(chunkKey)

  if (!chunk) {
    try {
      // 严格仅发起 1 次单块精准拉取，绝不循环拉取中间历史页，跳到最后一页 100ms 瞬开
      const url = new URL(
        `${config.bangumiNextApi}/p1/subjects/${subjectId}/comments`,
      )
      url.searchParams.set('limit', String(COMMENTS_CHUNK_SIZE))
      url.searchParams.set('offset', String(chunkStartOffset))
      if (type) url.searchParams.set('type', type)

      const res = await bangumiFetch(url.toString())
      if (!res.ok) {
        const emptyPayload: CommentPagePayload = {
          data: [],
          total: 0,
          page,
          pageSize,
        }
        return c.json(emptyPayload, 200, cacheHeaders(false))
      }

      const json = (await res.json()) as {
        total?: number
        data?: BangumiRawCommentRow[]
      }

      const rawList = Array.isArray(json.data) ? json.data : []
      const total = Number(json.total ?? 0)

      // 严格 1:1 映射解析，保持 30 条物理顺序与下标严格对齐，不提前过滤
      const items: CommentItem[] = rawList.map((row, idx) =>
        parseBangumiCommentRow(row, chunkStartOffset + idx),
      )

      chunk = { items, total }
      cacheSet(chunkKey, chunk, BANGUMI_CACHE_TTL.comments)
    } catch {
      const emptyPayload: CommentPagePayload = {
        data: [],
        total: 0,
        page,
        pageSize,
      }
      return c.json(emptyPayload, 200, cacheHeaders(false))
    }
  }

  // 从当前独立 Chunk 缓存中切片出目标 10 条，并流经可插拔过滤模块 (当前默认 passthrough 直通)
  const pageRows = chunk.items.slice(relativeIndex, relativeIndex + pageSize)
  const filteredData = pageRows.filter(commentFilters.passthrough)

  const payload: CommentPagePayload = {
    data: filteredData,
    total: chunk.total,
    page,
    pageSize,
  }

  setCommentsCdnHeaders(c, bypass)
  return c.json(payload, 200, cacheHeaders(true))
})


