import {
  parseBangumiItem,
  type BangumiItem,
  type BangumiEpisode,
} from './bangumi'
import {
  resolveBangumiApiUrlFromImageHost,
  BANGUMI_API_URL_BANGUMI,
  BANGUMI_API_URL_MIRROR,
} from './bangumi-endpoint'

/** Drop heavy fields for list UIs (calendar / trending / search cards). */
export function slimItem(item: BangumiItem): BangumiItem {
  return {
    ...item,
    summary: '',
    tags: item.tags?.slice(0, 6) ?? [],
    alias: [],
  }
}

export function getCurrentSeasonAirDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  const seasonMonth = Math.floor((month - 1) / 3) * 3 + 1
  const padMonth = String(seasonMonth).padStart(2, '0')
  return `${year}-${padMonth}-01`
}

export const SEARCH_SORTS = new Set(['match', 'heat', 'rank', 'score'])
export const AIR_DATE_EXPR = /^(>=|<=|>|<)?\d{4}-\d{2}-\d{2}$/

export interface ClientFetchOptions {
  imageHost?: string
  apiBaseUrl?: string
  signal?: AbortSignal
  customFetch?: typeof fetch
  /** 是否跳过本地缓存直接强制拉取（默认 false） */
  bypassCache?: boolean
}

// ==========================================
// 客户端双层持久化缓存 (L1 内存 + L2 localStorage)
// ==========================================

export const BANGUMI_CLIENT_CACHE_TTL = {
  calendar: 2 * 60 * 60_000, // 2 小时 (每日放送排期)
  trending: 2 * 60 * 60_000, // 2 小时 (当前季度热门榜)
  subject: 6 * 60 * 60_000, // 6 小时 (条目详情元数据)
  episodes: 2 * 60 * 60_000, // 2 小时 (分集列表)
  search: 30 * 60_000, // 30 分钟 (搜索与分类淘番)
} as const

interface ClientCacheEntry<T> {
  value: T
  exp: number
}

const memoryStore = new Map<string, ClientCacheEntry<unknown>>()

export function getClientStorageCache<T>(key: string): T | null {
  const mem = memoryStore.get(key)
  if (mem) {
    if (Date.now() < mem.exp) {
      return mem.value as T
    }
    memoryStore.delete(key)
  }

  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ClientCacheEntry<T>
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      localStorage.removeItem(key)
      return null
    }
    memoryStore.set(key, parsed)
    return parsed.value
  } catch {
    return null
  }
}

export function setClientStorageCache<T>(
  key: string,
  value: T,
  ttlMs: number,
  indexKey?: string,
  maxEntries = 100,
): void {
  const exp = Date.now() + ttlMs
  const entry: ClientCacheEntry<T> = { value, exp }
  memoryStore.set(key, entry)

  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(entry))

    if (indexKey) {
      let index: string[] = []
      const raw = localStorage.getItem(indexKey)
      if (raw) {
        try {
          index = JSON.parse(raw)
        } catch {}
      }
      index = index.filter((k) => k !== key)
      index.push(key)
      while (index.length > maxEntries) {
        const oldest = index.shift()
        if (oldest) {
          localStorage.removeItem(oldest)
        }
      }
      localStorage.setItem(indexKey, JSON.stringify(index))
    }
  } catch {
    /* 容忍私密浏览 / 存储配额限制 */
  }
}

export function clearClientStorageCache(prefix?: string): void {
  if (prefix) {
    for (const k of memoryStore.keys()) {
      if (k.startsWith(prefix)) memoryStore.delete(k)
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(prefix)) keysToRemove.push(k)
        }
        for (const k of keysToRemove) localStorage.removeItem(k)
      }
    } catch {}
  } else {
    memoryStore.clear()
  }
}

/**
 * 每日放送 (Calendar / Timeline)：客户端直连拉取并结构化整理为周一至周日 7 天二维矩阵
 * 附带 2 小时本地双层缓存（localStorage + 内存），页面刷新 0ms 瞬间直出
 */
export async function fetchClientCalendar(
  opts?: ClientFetchOptions,
): Promise<BangumiItem[][]> {
  const apiUrl = (
    opts?.apiBaseUrl || resolveBangumiApiUrlFromImageHost(opts?.imageHost)
  ).replace(/\/+$/, '')
  const fetchFn = opts?.customFetch || globalThis.fetch.bind(globalThis)

  const cacheKey = `aniku:bgm:calendar`
  if (!opts?.bypassCache) {
    const cached = getClientStorageCache<BangumiItem[][]>(cacheKey)
    if (cached) return cached
  }

  const urls = [
    `${apiUrl}/calendar`,
    apiUrl.includes('bgm.tv')
      ? `${BANGUMI_API_URL_MIRROR}/calendar`
      : `${BANGUMI_API_URL_BANGUMI}/calendar`,
  ]

  let res: Response | null = null
  for (const u of urls) {
    try {
      const r = await fetchFn(u, { signal: opts?.signal })
      if (r.ok) {
        res = r
        break
      }
    } catch {
      /* try next mirror */
    }
  }

  if (!res || !res.ok) {
    throw new Error('无法连接 Bangumi 每日放送数据源')
  }

  const json = (await res.json()) as unknown
  const days: BangumiItem[][] = []

  if (Array.isArray(json)) {
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
          const subjectRaw = (e.subject as Record<string, unknown>) || e
          const subject =
            e.subject && typeof e.subject === 'object'
              ? {
                  ...subjectRaw,
                  watchers: e.watchers ?? subjectRaw.watchers,
                  count: e.count ?? subjectRaw.count,
                }
              : subjectRaw
          items.push(slimItem(parseBangumiItem(subject)))
        } catch {}
      }
      days.push(items)
    }
  } else if (json && typeof json === 'object') {
    const record = json as Record<string, unknown>
    for (let i = 1; i <= 7; i++) {
      const list = (record[String(i)] as unknown[]) || []
      const items: BangumiItem[] = []
      for (const entry of list) {
        try {
          const e = entry as Record<string, unknown>
          const subjectRaw = (e.subject as Record<string, unknown>) || e
          const subject =
            e.subject && typeof e.subject === 'object'
              ? {
                  ...subjectRaw,
                  watchers: e.watchers ?? subjectRaw.watchers,
                  count: e.count ?? subjectRaw.count,
                }
              : subjectRaw
          items.push(slimItem(parseBangumiItem(subject)))
        } catch {}
      }
      days.push(items)
    }
  }

  setClientStorageCache(cacheKey, days, BANGUMI_CLIENT_CACHE_TTL.calendar)
  return days
}

/**
 * 热门模块 (Trending)：客户端直连拉取当前季度热播番剧榜单
 * 附带 2 小时本地双层缓存，首屏 0ms 秒开
 */
export async function fetchClientTrending(
  limit = 24,
  offset = 0,
  type = 2,
  opts?: ClientFetchOptions,
): Promise<BangumiItem[]> {
  const apiUrl = (
    opts?.apiBaseUrl || resolveBangumiApiUrlFromImageHost(opts?.imageHost)
  ).replace(/\/+$/, '')
  const fetchFn = opts?.customFetch || globalThis.fetch.bind(globalThis)
  const seasonStart = getCurrentSeasonAirDate()

  const cacheKey = `aniku:bgm:trending:${type}:${limit}:${offset}`
  if (!opts?.bypassCache) {
    const cached = getClientStorageCache<BangumiItem[]>(cacheKey)
    if (cached) return cached
  }

  const urls = [
    `${apiUrl}/v0/search/subjects?limit=${limit}&offset=${offset}`,
    apiUrl.includes('bgm.tv')
      ? `${BANGUMI_API_URL_MIRROR}/v0/search/subjects?limit=${limit}&offset=${offset}`
      : `${BANGUMI_API_URL_BANGUMI}/v0/search/subjects?limit=${limit}&offset=${offset}`,
  ]

  let res: Response | null = null
  for (const u of urls) {
    try {
      const r = await fetchFn(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: '*',
          sort: 'heat',
          filter: {
            type: [Number(type) || 2],
            nsfw: false,
            air_date: [`>=${seasonStart}`],
          },
        }),
        signal: opts?.signal,
      })
      if (r.ok) {
        res = r
        break
      }
    } catch {}
  }

  if (!res || !res.ok) {
    throw new Error('无法连接 Bangumi 热门番剧数据源')
  }

  const json = (await res.json()) as { data?: unknown[] }
  const items: BangumiItem[] = []
  for (const entry of json.data || []) {
    try {
      items.push(slimItem(parseBangumiItem(entry as Record<string, unknown>)))
    } catch {}
  }

  setClientStorageCache(
    cacheKey,
    items,
    BANGUMI_CLIENT_CACHE_TTL.trending,
    'aniku:bgm:trending:idx',
    20,
  )
  return items
}

export interface ClientSearchParams {
  keyword?: string
  limit?: number
  offset?: number
  sort?: string
  tags?: string[]
  type?: number[] | number
  year?: number | null
  airDate?: string[]
}

/**
 * 番剧搜索与分类索引 (Search & Browse)：支持关键词、标签、年份区间与多种排序
 * 附带 30 分钟本地搜索缓存，翻页或后退浏览即时恢复
 */
export async function fetchClientSearch(
  params: ClientSearchParams,
  opts?: ClientFetchOptions,
): Promise<{
  data: BangumiItem[]
  total?: number
  limit: number
  offset: number
  sort: string
}> {
  const apiUrl = (
    opts?.apiBaseUrl || resolveBangumiApiUrlFromImageHost(opts?.imageHost)
  ).replace(/\/+$/, '')
  const fetchFn = opts?.customFetch || globalThis.fetch.bind(globalThis)

  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50)
  const offset = Math.max(Number(params.offset) || 0, 0)
  const requestedSort = (params.sort || 'heat').toLowerCase()
  const sortByDate = requestedSort === 'date' || requestedSort === 'airdate'
  const upstreamSort = sortByDate
    ? 'heat'
    : SEARCH_SORTS.has(requestedSort)
      ? requestedSort
      : 'heat'

  const tags = Array.isArray(params.tags)
    ? params.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
    : []

  const airDate: string[] = []
  if (Array.isArray(params.airDate)) {
    for (const expr of params.airDate) {
      if (typeof expr !== 'string') continue
      const s = expr.trim()
      if (AIR_DATE_EXPR.test(s)) airDate.push(s)
    }
  }
  const year =
    params.year != null && Number.isFinite(Number(params.year))
      ? Math.trunc(Number(params.year))
      : null
  if (year != null && year >= 1900 && year <= 2100 && airDate.length === 0) {
    airDate.push(`>=${year}-01-01`, `<${year + 1}-01-01`)
  }

  const rawTypes = Array.isArray(params.type)
    ? params.type
    : params.type != null && Number(params.type) > 0
      ? [Number(params.type)]
      : [2, 6]
  const types = rawTypes
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  const finalTypes = types.length > 0 ? types : [2, 6]

  const rawKeyword = params.keyword || ''
  const keyword = rawKeyword.trim()

  const cacheKey = `aniku:bgm:search:${keyword || '*'}:${upstreamSort}:${tags.join(',')}:${types.join(',')}:${airDate.join(',')}:${limit}:${offset}`
  if (!opts?.bypassCache) {
    const cached = getClientStorageCache<{
      data: BangumiItem[]
      total?: number
      limit: number
      offset: number
      sort: string
    }>(cacheKey)
    if (cached) return cached
  }

  const filter: Record<string, unknown> = {
    type: finalTypes,
    nsfw: false,
  }
  if (tags.length > 0) filter.tag = tags
  if (airDate.length > 0) filter.air_date = airDate

  const urls = [
    `${apiUrl}/v0/search/subjects?limit=${limit}&offset=${offset}`,
    apiUrl.includes('bgm.tv')
      ? `${BANGUMI_API_URL_MIRROR}/v0/search/subjects?limit=${limit}&offset=${offset}`
      : `${BANGUMI_API_URL_BANGUMI}/v0/search/subjects?limit=${limit}&offset=${offset}`,
  ]

  let res: Response | null = null
  for (const u of urls) {
    try {
      const r = await fetchFn(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword || '*',
          sort: upstreamSort,
          filter,
        }),
        signal: opts?.signal,
      })
      if (r.ok) {
        res = r
        break
      }
    } catch {}
  }

  if (!res || !res.ok) {
    throw new Error('搜索番剧失败，请检查网络设置')
  }

  const json = (await res.json()) as { data?: unknown[]; total?: number }
  const rawData = Array.isArray(json.data) ? json.data : []
  const items: BangumiItem[] = []

  for (const entry of rawData) {
    try {
      items.push(slimItem(parseBangumiItem(entry as Record<string, unknown>)))
    } catch {}
  }

  if (sortByDate) {
    items.sort((a, b) => {
      const da = (a.airDate || '').trim()
      const db = (b.airDate || '').trim()
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    })
  }

  const result = {
    data: items,
    total: typeof json.total === 'number' ? json.total : items.length,
    limit,
    offset,
    sort: sortByDate ? 'date' : upstreamSort,
  }

  setClientStorageCache(
    cacheKey,
    result,
    BANGUMI_CLIENT_CACHE_TTL.search,
    'aniku:bgm:search:idx',
    50,
  )
  return result
}

/**
 * 番剧详情 (Subject Detail)：客户端直连拉取单条番剧全量信息
 * 附带 6 小时本地双层缓存，切集与播放页重入瞬间就绪
 */
export async function fetchClientSubject(
  id: number | string,
  opts?: ClientFetchOptions,
): Promise<BangumiItem> {
  const apiUrl = (
    opts?.apiBaseUrl || resolveBangumiApiUrlFromImageHost(opts?.imageHost)
  ).replace(/\/+$/, '')
  const fetchFn = opts?.customFetch || globalThis.fetch.bind(globalThis)

  const cacheKey = `aniku:bgm:subject:${id}`
  if (!opts?.bypassCache) {
    const cached = getClientStorageCache<BangumiItem>(cacheKey)
    if (cached) return cached
  }

  const urls = [
    `${apiUrl}/v0/subjects/${id}`,
    apiUrl.includes('bgm.tv')
      ? `${BANGUMI_API_URL_MIRROR}/v0/subjects/${id}`
      : `${BANGUMI_API_URL_BANGUMI}/v0/subjects/${id}`,
  ]

  let res: Response | null = null
  for (const u of urls) {
    try {
      const r = await fetchFn(u, { signal: opts?.signal })
      if (r.ok) {
        res = r
        break
      }
    } catch {}
  }

  if (!res || !res.ok) {
    throw new Error(`无法获取番剧详情 (${id})`)
  }

  const json = (await res.json()) as Record<string, unknown>
  const parsed = parseBangumiItem(json)

  setClientStorageCache(
    cacheKey,
    parsed,
    BANGUMI_CLIENT_CACHE_TTL.subject,
    'aniku:bgm:subject:idx',
    100,
  )
  return parsed
}

/**
 * 分集列表 (Episodes)：客户端直连拉取番剧全部分集信息
 * 附带 2 小时本地双层缓存，剧集切换 0 延迟
 */
export async function fetchClientEpisodes(
  id: number | string,
  opts?: ClientFetchOptions & {
    limit?: number | string
    offset?: number | string
    type?: string
  },
): Promise<BangumiEpisode[]> {
  const apiUrl = (
    opts?.apiBaseUrl || resolveBangumiApiUrlFromImageHost(opts?.imageHost)
  ).replace(/\/+$/, '')
  const fetchFn = opts?.customFetch || globalThis.fetch.bind(globalThis)

  const limit = String(opts?.limit || 200)
  const offset = String(opts?.offset || 0)
  const type = String(opts?.type || '')

  const cacheKey = `aniku:bgm:episodes:${id}:${type}:${limit}:${offset}`
  if (!opts?.bypassCache) {
    const cached = getClientStorageCache<BangumiEpisode[]>(cacheKey)
    if (cached) return cached
  }

  const makeUrl = (base: string) => {
    const u = new URL(`${base}/v0/episodes`)
    u.searchParams.set('subject_id', String(id))
    u.searchParams.set('limit', limit)
    u.searchParams.set('offset', offset)
    if (type) u.searchParams.set('type', type)
    return u.toString()
  }

  const urls = [
    makeUrl(apiUrl),
    makeUrl(
      apiUrl.includes('bgm.tv')
        ? BANGUMI_API_URL_MIRROR
        : BANGUMI_API_URL_BANGUMI,
    ),
  ]

  let res: Response | null = null
  for (const u of urls) {
    try {
      const r = await fetchFn(u, { signal: opts?.signal })
      if (r.ok) {
        res = r
        break
      }
    } catch {}
  }

  if (!res || !res.ok) {
    throw new Error(`无法获取剧集列表 (${id})`)
  }

  const json = (await res.json()) as {
    data?: Record<string, unknown>[]
    total?: number
  }
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

  setClientStorageCache(
    cacheKey,
    episodes,
    BANGUMI_CLIENT_CACHE_TTL.episodes,
    'aniku:bgm:episodes:idx',
    100,
  )
  return episodes
}
