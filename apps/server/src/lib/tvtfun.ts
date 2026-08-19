/**
 * tvtfun.net (TvTFun 番剧网) dedicated adapter.
 *
 * Architecture:
 * - Frontend: Next.js (App Router / RSC) with anti-debugging / F12 redirect protection
 * - Search API: GET https://www.tvtfun.net/api/videos/search?q={keyword}
 * - Video Detail API: GET https://www.tvtfun.net/api/videos/{video_id}
 * - Play Resolution: GET https://www.tvtfun.net/api/videos/resolve-play-url?episodeId={episode_id}
 *   - Requires fresh one-time `Cookie: tvt-pt=...` (issued per play session)
 *   - Requires `X-Play-Ctx: base64({ f: 60, v: 1, w: 1920, hgt: 1080, p: 1 })`
 * - Media: High quality 1080P MP4 direct streams / HLS (supports Accept-Ranges byte-level seek)
 */
import type {
  PluginChapterResult,
  PluginRule,
  PluginSearchResult,
  ResolvePlayResult,
  Road,
  SearchItem,
} from '@animaku/shared'
import { config } from '../config'
import { assertPublicHttpUrl, fetchPublic } from './private-host'

const TVTFUN_BASE_URL = 'https://www.tvtfun.net'

/** Video ID to slug cache for fast reverse lookup */
const videoIdToSlugMap = new Map<string, string>()

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

/**
 * Obtain a fresh one-time `tvt-pt` cookie for resolving an episode.
 * TvTFun backend consumes and invalidates tvt-pt on each resolve call (one-time nonce).
 */
async function fetchFreshPlayCookie(
  slug: string,
  sourceIndex = 0,
  epSort = 0,
): Promise<string> {
  const targetUrl = `${TVTFUN_BASE_URL}/video/${slug}/play?source=${sourceIndex}&episode=${epSort}`
  assertPublicHttpUrl(targetUrl)

  const res = await fetchPublic(
    targetUrl,
    {
      headers: {
        'User-Agent': config.defaultUserAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    },
    { timeoutMs: 8_000 },
  )

  // Fully consume HTML stream
  await res.text().catch(() => '')

  const rawSetCookies =
    res.headers.getSetCookie?.() || [res.headers.get('set-cookie') || '']
  const cookieEntries = rawSetCookies
    .flatMap((c) => c.split(','))
    .map((c) => c.trim().split(';')[0])
    .filter((c) => c.startsWith('tvt-pt='))

  const ptCookie = cookieEntries[0]
  if (ptCookie) {
    return ptCookie
  }

  throw new Error('未能从 TvTFun 获取播放凭证 (tvt-pt cookie)')
}

interface TvTFunSearchResponse {
  data?: {
    videos?: Array<{
      id: string
      name: string
      slug?: string
      bgmId?: number | string | null
      pic?: string | null
      picThumb?: string | null
      remarks?: string | null
    }>
  }
  error?: string
}

interface TvTFunDetailResponse {
  data?: {
    id: string
    name: string
    slug?: string
    bgmId?: number | string | null
    playSources?: Array<{
      id: string
      name: string
      fromCode?: string
      sort?: number
      episodes?: Array<{
        id: string
        name: string
        sort: number
        url?: string
      }>
    }>
  }
  error?: string
}

interface TvTFunResolveResponse {
  data?: {
    url: string
    type?: 'mp4' | 'm3u8' | 'unavailable' | 'original'
    headers?: Record<string, string>
    source?: string
    fallback?: unknown
  }
  error?: string
}

/**
 * 1. Search anime by keyword.
 */
export async function searchTvTFun(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const searchUrl = `${TVTFUN_BASE_URL}/api/videos/search?q=${encodeURIComponent(trimmed)}`
  assertPublicHttpUrl(searchUrl)

  const res = await fetchPublic(
    searchUrl,
    {
      headers: getBaseHeaders(`${TVTFUN_BASE_URL}/videos`),
    },
    { timeoutMs: 10_000 },
  )

  if (!res.ok) {
    throw new Error(`TvTFun 搜索请求失败 (HTTP ${res.status})`)
  }

  const json = (await res.json()) as TvTFunSearchResponse
  if (json.error) {
    throw new Error(`TvTFun 搜索报错: ${json.error}`)
  }

  const rawVideos = json?.data?.videos || []
  const items: SearchItem[] = []

  for (const v of rawVideos) {
    if (!v.id || !v.name) continue
    const slug = v.slug || v.id
    videoIdToSlugMap.set(v.id, slug)
    items.push({
      name: v.name.trim(),
      src: `${TVTFUN_BASE_URL}/video/${v.id}?slug=${encodeURIComponent(slug)}`,
    })
  }

  return {
    pluginName: rule.name,
    items,
  }
}

/**
 * 2. Parse video chapters and playback roads.
 */
export async function chaptersTvTFun(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  let videoId = ''
  let slug = ''

  try {
    const u = new URL(source)
    const match = u.pathname.match(/\/video\/([^/?#]+)/)
    if (match) {
      videoId = match[1]
    }
    slug = u.searchParams.get('slug') || videoId
  } catch {
    videoId = source.replace(/.*\/video\//, '').split(/[?#]/)[0]
    slug = videoId
  }

  if (!videoId) {
    throw new Error(`无法从链接提取 TvTFun 视频 ID: ${source}`)
  }

  const detailUrl = `${TVTFUN_BASE_URL}/api/videos/${videoId}`
  assertPublicHttpUrl(detailUrl)

  const res = await fetchPublic(
    detailUrl,
    {
      headers: getBaseHeaders(`${TVTFUN_BASE_URL}/video/${slug}`),
    },
    { timeoutMs: 10_000 },
  )

  if (!res.ok) {
    throw new Error(`TvTFun 获取番剧分集失败 (HTTP ${res.status})`)
  }

  const json = (await res.json()) as TvTFunDetailResponse
  if (json.error) {
    throw new Error(`TvTFun 获取番剧报错: ${json.error}`)
  }

  const data = json.data
  if (!data || !Array.isArray(data.playSources) || data.playSources.length === 0) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['未解析到 TvTFun 播放源或分集数据'],
    }
  }

  const effectiveSlug = data.slug || slug || videoId
  videoIdToSlugMap.set(videoId, effectiveSlug)
  if (data.slug) {
    videoIdToSlugMap.set(data.slug, data.slug)
  }

  const roads: Road[] = []

  for (let sIdx = 0; sIdx < data.playSources.length; sIdx++) {
    const src = data.playSources[sIdx]
    const episodes = src.episodes || []
    if (episodes.length === 0) continue

    const sortedEpisodes = [...episodes].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    const roadName =
      (src.name || '').replace(/\s*\([^()]+\)\s*$/, '').trim() ||
      src.fromCode ||
      `线路 ${String.fromCharCode(65 + sIdx)}`

    const urls: string[] = []
    const identifiers: string[] = []

    for (const ep of sortedEpisodes) {
      if (!ep.id) continue
      urls.push(
        `${TVTFUN_BASE_URL}/video/${effectiveSlug}/play?episodeId=${ep.id}&videoId=${videoId}&source=${src.sort ?? sIdx}&epSort=${ep.sort ?? 0}`,
      )
      identifiers.push(ep.name || `第 ${ep.sort + 1} 话`)
    }

    if (urls.length > 0) {
      roads.push({
        name: roadName,
        data: urls,
        identifier: identifiers,
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
 */
export async function resolveTvTFun(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  let episodeId = ''
  let slug = '547888'
  let sourceIndex = 0
  let epSort = 0

  try {
    const u = new URL(pageUrl)
    episodeId = u.searchParams.get('episodeId') || ''
    sourceIndex = Number(u.searchParams.get('source') || '0')
    epSort = Number(u.searchParams.get('epSort') || '0')
    const match = u.pathname.match(/\/video\/([^/?#]+)/)
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

  // Gracefully resolve episodeId from detail API if given a raw video URL without query params
  if (!episodeId) {
    const fallbackVideoId = slug
    try {
      const detailUrl = `${TVTFUN_BASE_URL}/api/videos/${fallbackVideoId}`
      assertPublicHttpUrl(detailUrl)
      const dRes = await fetchPublic(
        detailUrl,
        { headers: getBaseHeaders(`${TVTFUN_BASE_URL}/video/${fallbackVideoId}`) },
        { timeoutMs: 6_000 },
      )
      if (dRes.ok) {
        const dJson = (await dRes.json()) as TvTFunDetailResponse
        const firstEp = dJson?.data?.playSources?.[sourceIndex]?.episodes?.[epSort] ||
          dJson?.data?.playSources?.[0]?.episodes?.[0]
        if (firstEp?.id) {
          episodeId = firstEp.id
          if (dJson.data?.slug) {
            slug = dJson.data.slug
            videoIdToSlugMap.set(fallbackVideoId, slug)
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!episodeId) {
    throw new Error(`TvTFun 缺少 episodeId 参数: ${pageUrl}`)
  }

  const effectiveSlug = videoIdToSlugMap.get(slug) || slug
  const playPageReferer = `${TVTFUN_BASE_URL}/video/${effectiveSlug}/play?source=${sourceIndex}&episode=${epSort}`

  const doResolve = async (): Promise<ResolvePlayResult> => {
    // Obtain a fresh one-time play cookie specifically for this episode
    const cookie = await fetchFreshPlayCookie(effectiveSlug, sourceIndex, epSort)

    const apiUrl = `${TVTFUN_BASE_URL}/api/videos/resolve-play-url?episodeId=${encodeURIComponent(episodeId)}`
    assertPublicHttpUrl(apiUrl)

    const ctx = Buffer.from(
      JSON.stringify({ f: 60, v: 1, w: 1920, hgt: 1080, p: 1 }),
    ).toString('base64')

    const res = await fetchPublic(
      apiUrl,
      {
        headers: {
          'User-Agent': config.defaultUserAgent,
          Cookie: cookie,
          'X-Play-Ctx': ctx,
          Referer: playPageReferer,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      },
      { timeoutMs: 10_000 },
    )

    if (res.status === 403 || res.status === 401) {
      throw new Error(`403_CREDENTIAL_EXPIRED`)
    }

    if (!res.ok) {
      throw new Error(`TvTFun 解析接口异常 (HTTP ${res.status})`)
    }

    const json = (await res.json()) as TvTFunResolveResponse
    if (json.error) {
      if (json.error.includes('凭证') || json.error.includes('无效')) {
        throw new Error(`403_CREDENTIAL_EXPIRED`)
      }
      throw new Error(`TvTFun 解析报错: ${json.error}`)
    }

    const playData = json.data
    if (!playData || !playData.url || playData.type === 'unavailable') {
      throw new Error('TvTFun 该剧集播放源暂时不可用或尚未就绪')
    }

    const directUrl = playData.url.trim()
    const isHls =
      playData.type === 'm3u8' || /\.m3u8(\?|$)/i.test(directUrl)

    if (isHls) {
      let proxyUrl = `/api/media/m3u8?url=${encodeURIComponent(directUrl)}`
      if (playData.headers?.Referer) {
        proxyUrl += `&referer=${encodeURIComponent(playData.headers.Referer)}`
      }
      return {
        playUrl: directUrl,
        proxyUrl,
        referer: playData.headers?.Referer,
        headers: playData.headers,
      }
    }

    // High quality progressive MP4 (BytePlus / TopBuzz CDN / Akamai)
    let proxyUrl = `/api/media/proxy?url=${encodeURIComponent(directUrl)}`
    if (playData.headers?.Referer) {
      proxyUrl += `&referer=${encodeURIComponent(playData.headers.Referer)}`
    }

    return {
      playUrl: directUrl,
      proxyUrl,
      referer: playData.headers?.Referer,
      headers: playData.headers,
    }
  }

  try {
    return await doResolve()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('403') || msg.includes('凭证')) {
      // Retry once with a fresh attempt
      return await doResolve()
    }
    throw err
  }
}
