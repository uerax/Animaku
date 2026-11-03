/**
 * girigiri愛動漫 (ani.girigirilove.com) dedicated video source adapter.
 *
 * Architecture (2026 重构后架构):
 * - Frontend: Vite + React SPA (ani.girigirilove.com)
 * - Backend API: 独立 REST API 服务 (m3u8.girigirilove.com)
 *   - Search: GET https://m3u8.girigirilove.com/api.php/Vod/get_list?offset=0&limit=24&vod_name={keyword}
 *     - Fallback Suggest API: GET https://m3u8.girigirilove.com/index.php/ajax/suggest?mid=1&wd={keyword}
 *   - Detail / Episodes: GET https://m3u8.girigirilove.com/api.php/Vod/get_detail?vod_id={id}
 *     - 直接下发完整多线路 (vod_play_from) 与直链 M3U8 播放列表 (vod_play_url)
 * - Media Streams:
 *   - 高画质 1080P 自建 HLS 直链，部署在 akua.girigirilove.com / ladios.girigirilove.com 等 Cloudflare CDN
 *   - 全反射 CORS (Access-Control-Allow-Origin: *)，支持 Range 请求，纯客户端直连（requiresProxy: false）
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

const GIRIGIRI_DEFAULT_BASE_URL = 'https://ani.girigirilove.com'
// 特殊说明：girigiri 整体重构为 SPA 后，主站 ani.girigirilove.com 所有路径均返回单页静态 HTML。
// 必须将数据接口请求路由至后端的独立 API 域名 m3u8.girigirilove.com。
const GIRIGIRI_DEFAULT_API_BASE_URL = 'https://m3u8.girigirilove.com'

export function isGirigiriRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (
    name === 'girigiri' ||
    name === 'girigirilove' ||
    name === 'girigiri愛動漫' ||
    name === 'girigiri动漫'
  ) {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('girigirilove.com')
}

function getBaseUrl(rule?: PluginRule): string {
  if (rule?.baseURL && /^https?:\/\//i.test(rule.baseURL)) {
    return rule.baseURL.replace(/\/+$/, '')
  }
  return GIRIGIRI_DEFAULT_BASE_URL
}

function getApiBaseUrl(): string {
  return GIRIGIRI_DEFAULT_API_BASE_URL
}

function getJsonHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer, Origin: referer.replace(/\/+$/, '') } : {}),
  }
}

interface GirigiriGetListResponse {
  code?: number
  msg?: string
  info?: {
    offset?: number
    limit?: number
    total?: number
    rows?: Array<{
      vod_id: number | string
      vod_name: string
      vod_pic?: string
      vod_remarks?: string
      vod_year?: string
      vod_score?: string
      vod_blurb?: string
    }>
  }
}

interface GirigiriSuggestResponse {
  code?: number
  msg?: string
  total?: number
  list?: Array<{
    id: number | string
    name: string
    pic?: string
    en?: string
  }>
}

interface GirigiriDetailResponse {
  code?: number
  msg?: string
  info?: {
    vod_id?: number | string
    vod_name?: string
    vod_play_from?: string
    vod_play_server?: string
    vod_play_url?: string
  }
}

/**
 * 格式化 girigiri 的线路代号为用户友好的展示标签
 */
export function formatGirigiriRoadName(rawName: string, index: number): string {
  const trimmed = rawName.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'cht') return '繁体'
  if (lower === 'chs') return '简体'
  if (lower === 'db') return '杜比视界'
  if (lower === '1080p') return '1080P超清'
  if (lower === '4k') return '4K超清'
  return trimmed || (index === 0 ? '默认线路' : `线路 ${index + 1}`)
}

/**
 * 从页面 URL、详情 URL 或旧版 URL 中解析出 vod_id
 */
export function extractVodId(source: string): string | null {
  const trimmed = source.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  const match = trimmed.match(/(?:detail\/|play\/|GV|vod_id=)(\d+)/i)
  return match ? match[1] : null
}

/**
 * 解析 MacCMS 格式的 vod_play_from 与 vod_play_url
 */
export function parseGirigiriRoads(playFrom: string, playUrl: string): Road[] {
  const fromList = (playFrom || '')
    .split('$$$')
    .map((s) => s.trim())
  const urlGroups = (playUrl || '')
    .split('$$$')
    .map((s) => s.trim())

  const roads: Road[] = []

  urlGroups.forEach((group, index) => {
    if (!group) return
    const rawFrom = fromList[index] || ''
    const roadName = formatGirigiriRoadName(rawFrom, index)
    const urls: string[] = []
    const identifiers: string[] = []

    const epEntries = group.split('#')
    for (const ep of epEntries) {
      const trimmedEp = ep.trim()
      if (!trimmedEp) continue
      const dollarIdx = trimmedEp.indexOf('$')
      let epName = ''
      let epUrl = ''
      if (dollarIdx !== -1) {
        epName = trimmedEp.slice(0, dollarIdx).trim()
        epUrl = trimmedEp.slice(dollarIdx + 1).trim()
      } else {
        epUrl = trimmedEp
      }

      if (!epUrl || !epUrl.startsWith('http')) continue

      if (/^\d+$/.test(epName)) {
        epName = `第${epName.padStart(2, '0')}集`
      } else if (!epName) {
        epName = `第${String(urls.length + 1).padStart(2, '0')}集`
      }

      urls.push(epUrl)
      identifiers.push(epName)
    }

    if (urls.length > 0) {
      roads.push({
        name: roadName,
        data: urls,
        identifier: identifiers,
      })
    }
  })

  return roads
}

/**
 * 1. Search anime by keyword.
 * Primary: REST API Vod/get_list.
 * Fallback: MacCMS suggest JSON API on m3u8 API host.
 */
export async function searchGirigiri(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const baseUrl = getBaseUrl(rule)
  const apiBase = getApiBaseUrl()
  const diagnostics: string[] = []
  const items: SearchItem[] = []
  const seenUrls = new Set<string>()

  const queriesToTry = [trimmed]
  const stripped = extractBaseTitle(trimmed)
  if (stripped && stripped !== trimmed) {
    queriesToTry.push(stripped)
  }

  // 1. 尝试主线 REST API: Vod/get_list
  for (const q of queriesToTry) {
    try {
      const searchApiUrl = `${apiBase}/api.php/Vod/get_list?offset=0&limit=24&vod_name=${encodeURIComponent(q)}`
      assertPublicHttpUrl(searchApiUrl)

      const res = await fetchPublic(
        searchApiUrl,
        { headers: getJsonHeaders(`${baseUrl}/`) },
        { timeoutMs: 8_000, source: 'girigiri' },
      )

      if (res.ok) {
        const json = (await res.json()) as GirigiriGetListResponse
        if (json && json.code === 1 && json.info && Array.isArray(json.info.rows)) {
          for (const row of json.info.rows) {
            if (!row.vod_id || !row.vod_name) continue
            const detailUrl = `${baseUrl}/detail/${row.vod_id}`
            if (!seenUrls.has(detailUrl)) {
              seenUrls.add(detailUrl)
              const cleanName = row.vod_name
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .trim()
              items.push({
                name: cleanName,
                src: detailUrl,
              })
            }
          }
          if (items.length > 0) {
            break
          }
        }
      } else {
        diagnostics.push(`get_list API 返回非 200 状态码: HTTP ${res.status}`)
      }
    } catch (err) {
      diagnostics.push(
        `get_list API 搜索异常: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // 2. 若 get_list 未搜到结果，回退至 m3u8 域名的 suggest API
  if (items.length === 0) {
    for (const q of queriesToTry) {
      try {
        const suggestUrl = `${apiBase}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(q)}`
        assertPublicHttpUrl(suggestUrl)

        const res = await fetchPublic(
          suggestUrl,
          { headers: getJsonHeaders(`${baseUrl}/`) },
          { timeoutMs: 8_000, source: 'girigiri' },
        )

        if (res.ok) {
          const json = (await res.json()) as GirigiriSuggestResponse
          if (json && Array.isArray(json.list) && json.list.length > 0) {
            for (const item of json.list) {
              if (!item.id || !item.name) continue
              const detailUrl = `${baseUrl}/detail/${item.id}`
              if (!seenUrls.has(detailUrl)) {
                seenUrls.add(detailUrl)
                const cleanName = item.name
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .trim()
                items.push({
                  name: cleanName,
                  src: detailUrl,
                })
              }
            }
            if (items.length > 0) {
              break
            }
          }
        }
      } catch (err) {
        diagnostics.push(
          `suggest 回退 API 异常: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics: items.length > 0 ? undefined : diagnostics,
  }
}

/**
 * 2. Get chapter and multi-source road lists for an anime.
 * Uses REST API Vod/get_detail to directly fetch video stream playlists.
 */
export async function chaptersGirigiri(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const vodId = extractVodId(source)
  if (!vodId) {
    throw new Error(`无法从输入来源解析 girigiri 番剧 ID: ${source}`)
  }

  const baseUrl = getBaseUrl(rule)
  const apiBase = getApiBaseUrl()
  const detailApiUrl = `${apiBase}/api.php/Vod/get_detail?vod_id=${vodId}&user_id=`
  assertPublicHttpUrl(detailApiUrl)

  const res = await fetchPublic(
    detailApiUrl,
    { headers: getJsonHeaders(`${baseUrl}/`) },
    { timeoutMs: 10_000, source: 'girigiri' },
  )

  if (!res.ok) {
    throw new Error(`girigiri 获取番剧详情接口失败 (HTTP ${res.status})`)
  }

  const json = (await res.json()) as GirigiriDetailResponse
  if (!json || json.code !== 1 || !json.info) {
    throw new Error(
      `girigiri 番剧详情接口返回异常: ${json?.msg || '未知错误 (code != 1)'}`,
    )
  }

  const playFrom = json.info.vod_play_from || ''
  const playUrl = json.info.vod_play_url || ''

  const roads = parseGirigiriRoads(playFrom, playUrl)
  if (roads.length === 0) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['未解析到 girigiri 播放源或分集数据'],
    }
  }

  return {
    pluginName: rule.name,
    roads,
  }
}

/**
 * 3. Resolve direct playback URL for an episode.
 * 特殊处理说明：新版 get_detail 接口直接下发 akua/ladios 的 m3u8 直链。
 * 当 pageUrl 已经是直链流时直接零网络往返透传；若为页面 URL 则回退调用 get_detail 获取直链。
 * akua/ladios 直链为全反射 CORS 并支持 Range，设置 requiresProxy: false 直连播放。
 */
export async function resolveGirigiri(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  let playUrl = pageUrl.trim()

  // 1. 若已经是媒体流直链，直接透传返回
  if (playUrl.includes('.m3u8') || playUrl.includes('.mp4')) {
    const isHls = playUrl.includes('.m3u8')
    const proxyUrl = isHls
      ? `/api/media/m3u8?url=${encodeURIComponent(playUrl)}`
      : `/api/media/proxy?url=${encodeURIComponent(playUrl)}`

    return {
      playUrl,
      proxyUrl,
      requiresProxy: false,
      format: isHls ? 'hls' : 'mp4',
      headers: {
        'User-Agent': config.defaultUserAgent,
      },
    }
  }

  // 2. 页面 URL 回退处理（支持 /play/:id?sourceIndex=0&episodeIndex=0 或 /detail/:id）
  const vodId = extractVodId(playUrl)
  if (!vodId) {
    throw new Error(`无法从播放页地址提取 girigiri ID: ${pageUrl}`)
  }

  const chapterRes = await chaptersGirigiri(rule, vodId)
  if (!chapterRes.roads || chapterRes.roads.length === 0) {
    throw new Error(`girigiri 解析播放源失败: 未获取到可用分集`)
  }

  let sourceIdx = 0
  let episodeIdx = 0

  try {
    const parsed = new URL(playUrl.startsWith('http') ? playUrl : `https://ani.girigirilove.com/${playUrl}`)
    const sParam = parsed.searchParams.get('sourceIndex')
    const eParam = parsed.searchParams.get('episodeIndex')
    if (sParam !== null) sourceIdx = parseInt(sParam, 10) || 0
    if (eParam !== null) episodeIdx = parseInt(eParam, 10) || 0
  } catch {
    /* ignore URL parse error */
  }

  const road = chapterRes.roads[sourceIdx] || chapterRes.roads[0]
  if (!road || !road.data || road.data.length === 0) {
    throw new Error(`girigiri 未找到指定线路的分集直链`)
  }

  const resolvedDirectUrl = road.data[episodeIdx] || road.data[0]
  if (!resolvedDirectUrl || !resolvedDirectUrl.startsWith('http')) {
    throw new Error(`girigiri 解析到的直链格式异常: ${resolvedDirectUrl}`)
  }

  const isHls = resolvedDirectUrl.includes('.m3u8')
  const proxyUrl = isHls
    ? `/api/media/m3u8?url=${encodeURIComponent(resolvedDirectUrl)}`
    : `/api/media/proxy?url=${encodeURIComponent(resolvedDirectUrl)}`

  return {
    playUrl: resolvedDirectUrl,
    proxyUrl,
    requiresProxy: false,
    format: isHls ? 'hls' : 'mp4',
    headers: {
      'User-Agent': config.defaultUserAgent,
    },
  }
}
