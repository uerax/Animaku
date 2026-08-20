import { Hono } from 'hono'
import {
  parseBangumiItem,
  fromBangumiCollectionType,
  toBangumiCollectionType,
  type BangumiItem,
  type BangumiEpisode,
  type BangumiCollectionEntry,
  type CollectType,
  type BangumiUser,
} from '@animaku/shared'
import { config } from '../config'
import { bangumiFetch, getBearerToken } from '../lib/http'
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

  // Attempt 1: p1/trending/subjects (next.bgm.tv / mirror)
  try {
    const trendingBase = apiHost.includes('api.bgm.tv')
      ? config.bangumiNextApi
      : apiUrl
    const url = new URL(`${trendingBase}/p1/trending/subjects`)
    url.searchParams.set('type', type)
    url.searchParams.set('limit', limit)
    url.searchParams.set('offset', offset)
    const res = await bangumiFetch(url.toString())
    if (res.ok) {
      const json = (await res.json()) as { data?: unknown[] }
      if (Array.isArray(json.data)) {
        for (const entry of json.data) {
          try {
            const e = entry as Record<string, unknown>
            const subject = (e.subject as Record<string, unknown>) || e
            items.push(slimItem(parseBangumiItem(subject)))
          } catch {
            /* skip */
          }
        }
        success = true
      }
    } else {
      lastError = await res.text()
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  }

  // Attempt 2: Fallback to /v0/search/subjects sorted by heat
  if (!success) {
    try {
      const searchUrl = `${apiUrl}/v0/search/subjects?limit=${limit}&offset=${offset}`
      const res = await bangumiFetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sort: 'heat',
          filter: {
            type: [Number(type) || 2],
            nsfw: false,
            rank: ['>=0', '<=99999'],
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
        success = true
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
  airDate: string[]
  limit: number
  offset: number
}): string {
  const tags = [...parts.tags].sort().join(',')
  const air = [...parts.airDate].sort().join(',')
  return `bangumi:${parts.apiHost}:browse:${parts.keyword}\0${parts.sort}\0${tags}\0${air}\0${parts.limit}\0${parts.offset}`
}

bangumiRoutes.post('/search', async (c) => {
  const body = await c.req.json<{
    keyword?: string
    limit?: number
    offset?: number
    sort?: string
    tags?: string[]
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

  const keyword = body.keyword || ''
  const resultSort = sortByDate ? 'date' : upstreamSort
  const key = browseCacheKey({
    apiHost,
    keyword,
    sort: resultSort,
    tags,
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
    type: [2],
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
  url.searchParams.set('limit', c.req.query('limit') || '100')
  url.searchParams.set('offset', c.req.query('offset') || '0')
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
  const meRes = await bangumiFetch(`${apiUrl}/v0/me`, { token })
  if (!meRes.ok) {
    return c.json({ error: 'upstream', message: await meRes.text() }, 401)
  }
  const me = (await meRes.json()) as { username?: string }
  const username = me.username
  if (!username) return c.json({ error: 'bad_user', message: '无法获取用户名' }, 400)

  const limit = Number(c.req.query('limit') || 50)
  const offset = Number(c.req.query('offset') || 0)
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
  const res = await bangumiFetch(
    `${apiUrl}/v0/users/-/collections/${subjectId}`,
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
