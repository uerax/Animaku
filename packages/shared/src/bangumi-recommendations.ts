import {
  parseBangumiItem,
  resolveCountryTag,
  type BangumiItem,
  type BangumiRecommendationItem,
  type BangumiRecommendationsPayload,
} from './bangumi'
import { resolveBangumiApiUrlFromImageHost } from './bangumi-endpoint'

export const DEFAULT_RECOMMENDATION_LIMIT = 15
export const BANGUMI_MAX_SEARCH_WINDOW = 1000

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

export const NOISE_TIME_REGEX =
  /^(\d{4}年?(\d{1,2}月)?|\d{1,2}月|\d{4}s|\d{2}年代|\d{4}(春|夏|秋|冬)|(春|夏|秋|冬)季番|\d{4})$/i

export const NOISE_TAGS = new Set([
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

export const FALLBACK_GENRE_TAGS = [
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

export function cleanAndPickTags(
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
  // 随机乱序以在每次计算周期带来新鲜感
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

export function extractYear(airDate?: string): string {
  if (!airDate) return ''
  const m = /^(\d{4})/.exec(airDate.trim())
  return m ? m[1] : ''
}

export function formatEpsLabel(item: {
  eps?: number
  total_episodes?: number
  totalEpisodes?: number
}): string {
  const total = item.totalEpisodes || item.total_episodes || item.eps || 0
  if (total > 0) return `全${total}话`
  return ''
}

export interface ClientRecommendationOptions {
  tags?: string[]
  country?: string
  isMovie?: boolean
  /** 客户端设置中选用的图片源（用于自动推导匹配的 API 域名：官方 lain -> 官方 api；国内镜像 -> 国内 bgmapi） */
  imageHost?: string
  /** 显式指定的 API Base URL（优先级最高） */
  apiBaseUrl?: string
  signal?: AbortSignal
  customFetch?: typeof fetch
  /** 是否绕过本地持久缓存强制刷新（默认 false） */
  bypassCache?: boolean
}

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

export const RECOMMENDATIONS_CLIENT_CACHE_TTL_MS = 24 * 60 * 60_000
const MAX_LOCAL_CACHE_INDEX = 100

type CacheRecord = {
  value: BangumiRecommendationsPayload
  exp: number
  host?: string
}

const memoryCache = new Map<string, CacheRecord>()

export function getLocalRecommendationsCache(
  subjectId: number,
): BangumiRecommendationsPayload | null {
  const memKey = String(subjectId)
  const mem = memoryCache.get(memKey)
  if (mem && Date.now() < mem.exp) {
    return mem.value
  }

  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(`aniku:rec:${subjectId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheRecord
    if (!parsed || !parsed.value || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      localStorage.removeItem(`aniku:rec:${subjectId}`)
      return null
    }
    // 写入内存加速同会话再次访问
    memoryCache.set(memKey, parsed)
    return parsed.value
  } catch {
    return null
  }
}

export function setLocalRecommendationsCache(
  subjectId: number,
  value: BangumiRecommendationsPayload,
): void {
  const exp = Date.now() + RECOMMENDATIONS_CLIENT_CACHE_TTL_MS
  const record: CacheRecord = { value, exp }
  const memKey = String(subjectId)
  memoryCache.set(memKey, record)

  try {
    if (typeof localStorage === 'undefined') return
    const key = `aniku:rec:${subjectId}`
    localStorage.setItem(key, JSON.stringify(record))

    // 维护最多 100 部番剧的 LRU 索引队列，超出自动淘汰最老条目，防 localStorage 超标
    const indexKey = 'aniku:rec:index'
    let indexList: number[] = []
    const rawIndex = localStorage.getItem(indexKey)
    if (rawIndex) {
      try {
        indexList = JSON.parse(rawIndex)
      } catch {}
    }
    indexList = indexList.filter((id) => id !== subjectId)
    indexList.push(subjectId)
    while (indexList.length > MAX_LOCAL_CACHE_INDEX) {
      const oldestId = indexList.shift()
      if (oldestId) {
        localStorage.removeItem(`aniku:rec:${oldestId}`)
      }
    }
    localStorage.setItem(indexKey, JSON.stringify(indexList))
  } catch {
    /* 容忍私密浏览模式 / 存储受限 */
  }
}

/** 清理指定的本地推荐缓存或全局内存缓存 */
export function clearLocalRecommendationsCache(subjectId?: number): void {
  if (subjectId) {
    for (const k of memoryCache.keys()) {
      if (k.startsWith(`${subjectId}:`)) {
        memoryCache.delete(k)
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`aniku:rec:${subjectId}`)
      }
    } catch {}
  } else {
    memoryCache.clear()
  }
}

/**
 * 客户端直连 Bangumi / 镜像源的纯前端推荐算法引擎：
 * 1. 100% 浏览器发起 fetch，无需服务端代理转发，零服务器出站带宽与计算压力；
 * 2. 域名根据用户的图片源配置动态联动（官方 lain.bgm.tv -> 官方 api.bgm.tv；国内代理 -> 国内 bgmapi.anibt.net）；
 * 3. 包含 Slot 0 续作/前作识别与多象限随机抽样匹配；
 * 4. 具备 24 小时 localStorage 本地持久化缓存，重新打开页面或刷新保证推荐结果绝对稳定一致，0 重复网络开销。
 */
export async function computeBangumiRecommendations(
  subjectId: number,
  options: ClientRecommendationOptions = {},
): Promise<BangumiRecommendationsPayload> {
  // 0. 本地持久化缓存命中检查（24 小时稳定探索周期，数据本体缓存不受代理/官方切换影响）
  if (!options.bypassCache) {
    const cached = getLocalRecommendationsCache(subjectId)
    if (cached) {
      return cached
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const apiUrl = (
    options.apiBaseUrl ||
    resolveBangumiApiUrlFromImageHost(options.imageHost)
  ).replace(/\/+$/, '')

  const fetchFn = options.customFetch || globalThis.fetch.bind(globalThis)
  const signal = options.signal

  // 0. Fallback subject detail metadata if tags/country/isMovie not fully provided
  let country = String(options.country || '').trim()
  let rawTags = Array.isArray(options.tags) ? options.tags : []
  let isMovie = options.isMovie

  if (rawTags.length === 0 || !country || isMovie === undefined) {
    try {
      const detailRes = await fetchFn(`${apiUrl}/v0/subjects/${subjectId}`, { signal })
      if (detailRes.ok) {
        const detailJson = (await detailRes.json()) as Record<string, unknown>
        const subjectItem = parseBangumiItem(detailJson)
        if (rawTags.length === 0 && subjectItem.tags) {
          rawTags = subjectItem.tags
            .map((t) => (typeof t === 'string' ? t : t?.name || ''))
            .filter(Boolean)
        }
        if (!country) {
          country = resolveCountryTag(subjectItem.tags)
        }
        if (isMovie === undefined) {
          const title = subjectItem.nameCn || subjectItem.name || ''
          const hasMovieTag = subjectItem.tags?.some((t) => {
            const n = typeof t === 'string' ? t : t?.name || ''
            return n.includes('剧场版') || n.includes('动画电影')
          })
          isMovie =
            Boolean(hasMovieTag) ||
            title.includes('剧场版') ||
            (subjectItem.totalEpisodes === 1 && subjectItem.eps === 1)
        }
      }
    } catch {
      /* ignore detail fetch error */
    }
  }

  if (!country) country = '日本'
  if (isMovie === undefined) isMovie = false

  // 1. Fetch relations for Slot 0 determination (type: 2 anime only)
  let slot0: BangumiRecommendationItem | null = null
  const seenSubjectIds = new Set<number>([subjectId])

  try {
    const relRes = await fetchFn(`${apiUrl}/v0/subjects/${subjectId}/subjects`, { signal })
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

          try {
            const detailRes = await fetchFn(`${apiUrl}/v0/subjects/${chosenRel.id}`, { signal })
            if (detailRes.ok) {
              const detailJson = (await detailRes.json()) as Record<string, unknown>
              const parsedItem = parseBangumiItem(detailJson)
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

  // 2. Pick 2 random feature tags from tags & combine with country tag
  const { pickedTags, searchTags } = cleanAndPickTags(
    rawTags,
    isMovie,
    country,
  )

  // 3. Search candidate pool using adaptive multi-bucket sampling
  const targetSimilarCount = slot0
    ? DEFAULT_RECOMMENDATION_LIMIT - 1
    : DEFAULT_RECOMMENDATION_LIMIT

  const querySearch = async (
    tags: string[],
    limit: number,
    offset = 0,
  ): Promise<{ data: SearchCandidate[]; total: number }> => {
    try {
      const searchUrl = `${apiUrl}/v0/search/subjects?limit=${limit}&offset=${offset}`
      const res = await fetchFn(searchUrl, {
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
        signal,
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
    const probe = await querySearch(tags, 1, 0)
    const total = probe.total
    if (total <= 0) return []

    const plans = buildAdaptiveSamplePlan(total, { maxRequests: 4, limitPerBucket: 15 })
    if (plans.length === 0) return []

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
    if (isMovie) fallbackTags.push('剧场版')
    const fallbackList = await fetchSampledPool(fallbackTags)
    if (fallbackList.length > candidatePool.length) {
      candidatePool = fallbackList
    }
  }

  // Attempt 3: fallback to country (+ movie tag) if still empty
  if (candidatePool.length < targetSimilarCount) {
    const generalTags = [country]
    if (isMovie) generalTags.push('剧场版')
    const generalList = await fetchSampledPool(generalTags)
    if (generalList.length > 0) {
      candidatePool = [...candidatePool, ...generalList]
    }
  }

  // Filter out seen subject IDs (self + Slot 0) and deduplicate by ID
  const seenCandidateIds = new Set<number>(seenSubjectIds)
  const availableCandidates: SearchCandidate[] = []
  for (const c of candidatePool) {
    if (c && c.id > 0 && !seenCandidateIds.has(c.id)) {
      seenCandidateIds.add(c.id)
      availableCandidates.push(c)
    }
  }

  // Random sample targetSimilarCount from available pool
  const shuffledCandidates = availableCandidates
    .slice()
    .sort(() => 0.5 - Math.random())
  const selectedSimilar = shuffledCandidates.slice(0, targetSimilarCount)

  const similarItems: BangumiRecommendationItem[] = selectedSimilar.map((item) => {
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
  })

  const items: BangumiRecommendationItem[] = slot0
    ? [slot0, ...similarItems]
    : similarItems

  const result: BangumiRecommendationsPayload = {
    items,
    matchedTags: [country, ...pickedTags],
  }

  // 写入 24 小时本地持久缓存，保证重新打开页面时数据稳定且零网络开销（跨官方/镜像通用）
  setLocalRecommendationsCache(subjectId, result)

  return result
}
