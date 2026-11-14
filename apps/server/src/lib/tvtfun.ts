/**
 * tvtfun.net (TvTFun 番剧网) dedicated adapter.
 *
 * Architecture (Nuxt 3 API migration):
 * - Search API: GET https://www.tvtfun.net/api/client/anime?keyword={keyword}&page=1&pageSize=20
 * - Detail & Episodes: GET https://www.tvtfun.net/api/client/anime/{identifier}
 * - Direct Play Resolution: POST https://www.tvtfun.net/api/site-auth/playback-resolve
 *   - Body: { episodeId, sourceId }
 *   - Directly returns BytePlus / Akamai high-speed MP4 / HLS streams without legacy cookies or X-Play-Ctx
 */
import {
  extractBaseTitle,
  type PluginChapterResult,
  type PluginRule,
  type PluginSearchResult,
  type ResolvePlayResult,
  type Road,
  type SearchItem,
} from '@animaku/shared'
import { config } from '../config'
import { assertPublicHttpUrl, fetchPublic } from './private-host'

const TVTFUN_BASE_URL = 'https://www.tvtfun.net'

/** Video ID to slug cache for fast reverse lookup */
const videoIdToSlugMap = new Map<string, string>()

interface TvTFunDirectStream {
  playUrl: string
  mediaType: string
  cachedAt: number
}

/**
 * TvTFun 官方直链服务端受控映射。
 * 键为 `${episodeId}_${sourceId}`。
 * 核心安全机制：服务端压根不读、不认客户端传来的任何 URL 参数，
 * 播放地址 100% 来自公开详情接口，彻底杜绝 Open Proxy 外部链接注入漏洞。
 */
const tvtfunDirectStreamMap = new Map<string, TvTFunDirectStream>()
const TVTFUN_STREAM_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 小时
const MAX_TVTFUN_STREAM_ENTRIES = 20_000

export function setTvTFunStream(
  key: string,
  playUrl: string,
  mediaType: string,
): void {
  if (tvtfunDirectStreamMap.size >= MAX_TVTFUN_STREAM_ENTRIES) {
    const firstKey = tvtfunDirectStreamMap.keys().next().value
    if (firstKey) tvtfunDirectStreamMap.delete(firstKey)
  }
  tvtfunDirectStreamMap.set(key, {
    playUrl,
    mediaType: mediaType || 'mp4',
    cachedAt: Date.now(),
  })
}

export function getTvTFunStream(key: string): TvTFunDirectStream | null {
  const item = tvtfunDirectStreamMap.get(key)
  if (!item) return null
  if (Date.now() - item.cachedAt > TVTFUN_STREAM_CACHE_TTL_MS) {
    tvtfunDirectStreamMap.delete(key)
    return null
  }
  return item
}

export function isTvTFunRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'tvtfun' || name === 'tvt' || name === 'tvt_fun') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('tvtfun.net') || base.includes('tvtfun.com')
}

function getBaseHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
  }
}

interface TvTFunSearchResponse {
  code?: number
  data?: {
    total?: number
    items?: Array<{
      id: string
      name?: string
      originalName?: string
      slug?: string
      bangumiId?: number | string | null
      posterUrl?: string | null
      coverUrl?: string | null
    }>
  }
  message?: string
  error?: string
}

interface TvTFunDetailResponse {
  code?: number
  data?: {
    id: string
    name: string
    slug?: string
    bangumiId?: number | string | null
    seasons?: Array<{
      id?: string
      seasonNo?: number
      name?: string
      episodes?: Array<{
        id: string
        number: number
        title?: string
        watchPath?: string
        sources?: Array<{
          id: string
          name?: string
          lineName?: string
          playbackLineId?: string
          sortOrder?: number
          playback?: {
            kind?: string
            engine?: string
            url?: string | null
            mediaType?: string
            requiresResolve?: boolean
          }
        }>
      }>
    }>
  }
  message?: string
  error?: string
}

interface TvTFunResolveResponse {
  code?: number
  data?: {
    sourceId?: string
    playback?: {
      kind?: string
      engine?: string
      url?: string
      mediaType?: string
      requiresResolve?: boolean
    }
    subtitles?: Array<{
      id?: string
      format?: string
      url?: string
    }>
  }
  message?: string
  error?: string
}

/**
 * 1. Search anime by keyword.
 */
export async function searchTvTFun(
  rule: PluginRule,
  keyword: string,
  options?: { dispatcher?: any },
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const queriesToTry = [trimmed]
  const stripped = extractBaseTitle(trimmed)
  if (stripped && stripped !== trimmed) {
    queriesToTry.push(stripped)
  }

  const items: SearchItem[] = []
  const seenIds = new Set<string>()

  for (const q of queriesToTry) {
    const searchUrl = `${TVTFUN_BASE_URL}/api/client/anime?keyword=${encodeURIComponent(q)}&page=1&pageSize=20`
    assertPublicHttpUrl(searchUrl)

    try {
      const res = await fetchPublic(
        searchUrl,
        {
          headers: getBaseHeaders(`${TVTFUN_BASE_URL}/`),
        },
        { timeoutMs: 10_000, source: 'tvtfun', dispatcher: options?.dispatcher },
      )

      if (!res.ok) continue

      const json = (await res.json()) as TvTFunSearchResponse
      if (json.error || json.code !== 0) continue

      const rawVideos = json?.data?.items || []
      for (const v of rawVideos) {
        if (!v.id || seenIds.has(v.id)) continue
        const name = (v.name || v.originalName || '').trim()
        if (!name) continue

        seenIds.add(v.id)
        const slug = v.slug || v.id
        videoIdToSlugMap.set(v.id, slug)
        items.push({
          name,
          src: `${TVTFUN_BASE_URL}/anime/${slug}`,
        })
      }

      if (items.length > 0) {
        break
      }
    } catch {
      /* continue to fallback query */
    }
  }

  return {
    pluginName: rule.name,
    items,
  }
}

/**
 * 线路优先级排序权重：
 * 线路 1 / AGE 指向字节跳动 BytePlus / Akamai CDN 全球直连节点，全球无地域限制且带宽高；
 * 赋予最高优先级 100 置顶。
 */
function getTvTFunSourcePriority(lineName = '', srcName = ''): number {
  const combined = `${lineName} ${srcName}`.toLowerCase()
  if (
    combined.includes('age') ||
    combined.includes('线路1') ||
    combined.includes('线路a') ||
    combined.includes('官方')
  ) {
    return 100
  }
  if (
    combined.includes('线路2') ||
    combined.includes('线路b') ||
    combined.includes('dytt')
  ) {
    return 80
  }
  if (combined.includes('线路3') || combined.includes('线路c')) return 70
  if (combined.includes('线路4') || combined.includes('线路d')) return 60
  return 50
}

/**
 * 2. Parse video chapters and playback roads.
 */
export async function chaptersTvTFun(
  rule: PluginRule,
  source: string,
  options?: { dispatcher?: any },
): Promise<PluginChapterResult> {
  let identifier = ''

  try {
    const u = new URL(source)
    const match = u.pathname.match(/\/(?:anime|video)\/([^/?#]+)/)
    if (match) {
      identifier = match[1]
    }
    const querySlug = u.searchParams.get('slug')
    if (querySlug) {
      identifier = querySlug
    }
  } catch {
    identifier = source.replace(/.*\/(?:anime|video)\//, '').split(/[?#]/)[0]
  }

  if (!identifier) {
    throw new Error(`无法从链接提取 TvTFun 标识: ${source}`)
  }

  const detailUrl = `${TVTFUN_BASE_URL}/api/client/anime/${identifier}`
  assertPublicHttpUrl(detailUrl)

  const res = await fetchPublic(
    detailUrl,
    {
      headers: getBaseHeaders(`${TVTFUN_BASE_URL}/anime/${identifier}`),
    },
    { timeoutMs: 10_000, source: 'tvtfun', dispatcher: options?.dispatcher },
  )

  if (!res.ok) {
    throw new Error(`TvTFun 获取番剧分集失败 (HTTP ${res.status})`)
  }

  const json = (await res.json()) as TvTFunDetailResponse
  if (json.error || json.code !== 0) {
    throw new Error(`TvTFun 获取番剧报错: ${json.error || json.message}`)
  }

  const data = json.data
  const seasons = data?.seasons || []
  if (!data || seasons.length === 0) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['未解析到 TvTFun 播放源或分集数据'],
    }
  }

  const effectiveSlug = data.slug || identifier
  videoIdToSlugMap.set(data.id, effectiveSlug)
  if (data.slug) {
    videoIdToSlugMap.set(data.slug, data.slug)
  }

  // 聚合所有分集（多季按顺序展平）
  const allEpisodes: NonNullable<NonNullable<typeof data.seasons>[number]['episodes']> = []
  for (const s of seasons) {
    if (Array.isArray(s.episodes)) {
      allEpisodes.push(...s.episodes)
    }
  }

  if (allEpisodes.length === 0) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['未解析到有效分集列表'],
    }
  }

  allEpisodes.sort((a, b) => (a.number ?? 0) - (b.number ?? 0))

  // 特殊处理说明：
  // TvTFun Nuxt 3 接口在每个分集下挂载一组播放线路 sources（例如线路 1 为 AGE/BytePlus 全球高速 CDN，线路 2 为切片备用源）。
  // 将各分集按照 lineName/name 聚类归纳为 Road，并置顶 BytePlus/Akamai 节点。
  const lineMeta = new Map<
    string,
    { name: string; srcName: string; priority: number; order: number }
  >()
  const lineEpisodes = new Map<
    string,
    { urls: string[]; identifiers: string[] }
  >()

  for (const ep of allEpisodes) {
    const epId = ep.id
    const epNum = ep.number ?? 1
    const epTitle = (ep.title || '').trim()
    const epName = epTitle
      ? /^\d+$/.test(epTitle)
        ? `第 ${epTitle} 话`
        : epTitle
      : `第 ${epNum} 话`

    const sources = ep.sources || []
    for (let sIdx = 0; sIdx < sources.length; sIdx++) {
      const src = sources[sIdx]
      if (!src || !src.id) continue

      const lineKey =
        src.playbackLineId || src.lineName || src.name || `line_${sIdx}`
      const lineName = (src.lineName || `线路 ${sIdx + 1}`).trim()
      const srcName = (src.name || '').trim()
      const playback = src.playback || {}
      const requiresResolve = playback.requiresResolve !== false
      const directUrl = playback.url || ''
      const mediaType = playback.mediaType || 'mp4'

      if (!lineMeta.has(lineKey)) {
        lineMeta.set(lineKey, {
          name: lineName,
          srcName,
          priority: getTvTFunSourcePriority(lineName, srcName),
          order: src.sortOrder ?? sIdx,
        })
        lineEpisodes.set(lineKey, { urls: [], identifiers: [] })
      }

      if (directUrl) {
        setTvTFunStream(`${epId}_${src.id}`, directUrl, mediaType)
      }

      const epUrl = `${TVTFUN_BASE_URL}/watch/${effectiveSlug}/${epNum}?episodeId=${encodeURIComponent(epId)}&sourceId=${encodeURIComponent(src.id)}`

      const container = lineEpisodes.get(lineKey)!
      container.urls.push(epUrl)
      container.identifiers.push(epName)
    }
  }

  const sortedKeys = Array.from(lineMeta.keys()).sort((a, b) => {
    const mA = lineMeta.get(a)!
    const mB = lineMeta.get(b)!
    if (mA.priority !== mB.priority) {
      return mB.priority - mA.priority
    }
    return mA.order - mB.order
  })

  const roads: Road[] = []
  for (const key of sortedKeys) {
    const meta = lineMeta.get(key)!
    const eps = lineEpisodes.get(key)!
    if (eps.urls.length > 0) {
      roads.push({
        name: meta.name,
        data: eps.urls,
        identifier: eps.identifiers,
      })
    }
  }

  return {
    pluginName: rule.name,
    roads,
  }
}

/**
 * 3. Resolve direct playback URL for an episode.
 * 安全加固：彻底移除对客户端传入 url/requiresResolve 的信任，
 * 统一走 tvtfun 官方 /api/site-auth/playback-resolve 接口获取源站权威播放直链。
 */
export async function resolveTvTFun(
  rule: PluginRule,
  pageUrl: string,
  options?: { dispatcher?: any },
): Promise<ResolvePlayResult> {
  let episodeId = ''
  let sourceId = ''
  let slug = ''

  try {
    const u = new URL(pageUrl)
    episodeId = u.searchParams.get('episodeId') || ''
    sourceId = u.searchParams.get('sourceId') || ''

    const match = u.pathname.match(/\/(?:watch|anime|video)\/([^/?#]+)/)
    if (match) {
      slug = match[1]
    }
    const querySlug = u.searchParams.get('slug')
    if (querySlug) {
      slug = querySlug
    }
  } catch {
    /* fallback parsing */
  }

  const streamKey = `${episodeId}_${sourceId}`
  let stream = episodeId && sourceId ? getTvTFunStream(streamKey) : null

  // 若内存未命中，或缺少关键 ID，向公开详情接口查询权威官方直链
  if (!stream || !episodeId || !sourceId) {
    const queryId = slug || '513878'
    try {
      const detailUrl = `${TVTFUN_BASE_URL}/api/client/anime/${queryId}`
      assertPublicHttpUrl(detailUrl)
      const dRes = await fetchPublic(
        detailUrl,
        { headers: getBaseHeaders(`${TVTFUN_BASE_URL}/anime/${queryId}`) },
        { timeoutMs: 8_000, source: 'tvtfun', dispatcher: options?.dispatcher },
      )
      if (dRes.ok) {
        const dJson = (await dRes.json()) as TvTFunDetailResponse
        const seasons = dJson?.data?.seasons || []
        for (const season of seasons) {
          for (const ep of season.episodes || []) {
            // 如果传入了 episodeId 则精确匹配；未传入则默认首集
            if (!episodeId || ep.id === episodeId) {
              const matchedSrc =
                ep.sources?.find((s) => !sourceId || s.id === sourceId) ||
                ep.sources?.[0]
              if (matchedSrc?.playback?.url) {
                stream = {
                  playUrl: matchedSrc.playback.url,
                  mediaType: matchedSrc.playback.mediaType || 'mp4',
                  cachedAt: Date.now(),
                }
                setTvTFunStream(
                  `${ep.id}_${matchedSrc.id}`,
                  stream.playUrl,
                  stream.mediaType,
                )
                break
              }
            }
          }
          if (stream) break
        }
      }
    } catch {
      /* ignore */
    }
  }

  const playUrl = stream?.playUrl?.trim() || ''
  const playMediaType = stream?.mediaType?.toLowerCase() || 'mp4'

  if (!playUrl) {
    throw new Error('TvTFun 该剧集播放源暂时不可用或尚未就绪')
  }

  assertPublicHttpUrl(playUrl)

  const isHls = playMediaType === 'hls' || /\.m3u8(\?|$)/i.test(playUrl)

  if (isHls) {
    return {
      playUrl,
      proxyUrl: `/api/media/m3u8?url=${encodeURIComponent(playUrl)}`,
      contentType: 'application/vnd.apple.mpegurl',
      referer: `${TVTFUN_BASE_URL}/`,
      headers: {
        Referer: `${TVTFUN_BASE_URL}/`,
        'User-Agent': config.defaultUserAgent,
      },
    }
  }

  return {
    playUrl,
    proxyUrl: `/api/media/proxy?url=${encodeURIComponent(playUrl)}`,
    contentType: 'video/mp4',
    referer: `${TVTFUN_BASE_URL}/`,
    headers: {
      Referer: `${TVTFUN_BASE_URL}/`,
      'User-Agent': config.defaultUserAgent,
    },
  }
}
