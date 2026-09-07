/**
 * girigiri愛動漫 (ani.girigirilove.com) dedicated video source adapter.
 *
 * Architecture:
 * - Frontend: MacCMS 传统模板 (ani.girigirilove.com)
 * - Search:
 *   - Fast Suggest JSON API: GET https://ani.girigirilove.com/index.php/ajax/suggest?mid=1&wd={keyword}
 * - Chapters: GET https://ani.girigirilove.com/GV{id}/
 *   - Anthology tabs: 简中 / 繁中 / 日语 等
 * - Play Resolution: GET https://ani.girigirilove.com/playGV{id}-{sid}-{nid}/
 *   - player_aaaa configuration (encrypt: 2, base64 + urlencode)
 *   - Decodes into high-performance Cloudflare CDN HLS direct stream
 * - Media:
 *   - High quality 1080P self-hosted HLS streams on giri.girigirilove.top
 *   - Supports Accept-Ranges, full CORS reflection, zero-proxy direct streaming.
 */
import * as cheerio from 'cheerio'
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

const GIRIGIRI_DEFAULT_BASE_URL = 'https://ani.girigirilove.com'

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

function getHtmlHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
  }
}

function getJsonHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
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

/**
 * 1. Search anime by keyword.
 * Primary: ajax suggest JSON API.
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
  const diagnostics: string[] = []
  const items: SearchItem[] = []
  const seenUrls = new Set<string>()

  try {
    const suggestUrl = `${baseUrl}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(trimmed)}`
    assertPublicHttpUrl(suggestUrl)

    const res = await fetchPublic(
      suggestUrl,
      { headers: getJsonHeaders(`${baseUrl}/`) },
      { timeoutMs: 8_000 },
    )

    if (res.ok) {
      const json = (await res.json()) as GirigiriSuggestResponse
      if (json && Array.isArray(json.list) && json.list.length > 0) {
        for (const item of json.list) {
          if (!item.id || !item.name) continue
          const detailUrl = `${baseUrl}/GV${item.id}/`
          if (!seenUrls.has(detailUrl)) {
            seenUrls.add(detailUrl)
            items.push({
              name: item.name.trim(),
              src: detailUrl,
            })
          }
        }
      }
    } else {
      diagnostics.push(`Suggest API 返回非 200 状态码: HTTP ${res.status}`)
    }
  } catch (err) {
    diagnostics.push(
      `Suggest API 搜索异常: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics: items.length > 0 ? undefined : diagnostics,
  }
}

/**
 * 2. Get chapter and multi-source road lists for an anime.
 */
export async function chaptersGirigiri(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const baseUrl = getBaseUrl(rule)
  let detailUrl = source.trim()
  if (!detailUrl.startsWith('http')) {
    detailUrl = `${baseUrl}${detailUrl.startsWith('/') ? '' : '/'}${detailUrl}`
  }
  assertPublicHttpUrl(detailUrl)

  const res = await fetchPublic(
    detailUrl,
    { headers: getHtmlHeaders(`${baseUrl}/`) },
    { timeoutMs: 10_000 },
  )

  if (!res.ok) {
    throw new Error(`girigiri 获取番剧详情失败 (HTTP ${res.status})`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  // 1. Extract Tab Labels (e.g. 简中, 繁中)
  const tabLabels: string[] = []
  $('.anthology-tab a, .anthology-tab .swiper-slide').each((_, el) => {
    const text = $(el)
      .text()
      .replace(/\s+/g, ' ')
      .replace(/\d+$/, '')
      .trim()
    if (text) {
      tabLabels.push(text)
    }
  })

  // 2. Extract Playlists
  const roads: Road[] = []
  const playBoxes = $('.anthology-list-play, .anthology-list-box')

  if (playBoxes.length > 0) {
    playBoxes.each((boxIndex, box) => {
      const $box = $(box)
      const urls: string[] = []
      const identifiers: string[] = []

      $box.find('a[href*="playGV"]').each((__, a) => {
        const href = $(a).attr('href') || ''
        let name = $(a).text().trim()
        if (href && !href.startsWith('javascript:') && name) {
          const absEpUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
          if (/^\d+$/.test(name)) {
            name = `第${name.padStart(2, '0')}集`
          }
          urls.push(absEpUrl)
          identifiers.push(name)
        }
      })

      if (urls.length > 0) {
        const roadName = tabLabels[boxIndex] || (boxIndex === 0 ? '默认线路' : `线路 ${boxIndex + 1}`)
        roads.push({
          name: roadName,
          data: urls,
          identifier: identifiers,
        })
      }
    })
  }

  // Fallback: extract all playGV links directly
  if (roads.length === 0) {
    const urls: string[] = []
    const identifiers: string[] = []
    $('a[href*="playGV"]').each((_, a) => {
      const href = $(a).attr('href') || ''
      let name = $(a).text().trim()
      if (href && !href.startsWith('javascript:') && name && name.length < 30) {
        const absEpUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
        if (!urls.includes(absEpUrl)) {
          if (/^\d+$/.test(name)) {
            name = `第${name.padStart(2, '0')}集`
          }
          urls.push(absEpUrl)
          identifiers.push(name)
        }
      }
    })

    if (urls.length > 0) {
      roads.push({
        name: '默认线路',
        data: urls,
        identifier: identifiers,
      })
    }
  }

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

interface MacPlayerConfig {
  flag?: string
  encrypt?: number
  url?: string
  url_next?: string
  from?: string
  id?: string | number
  sid?: number
  nid?: number
}

/**
 * Decode MacCMS player_aaaa encoded URL.
 * Supports encrypt 0 (plain), 1 (unescape), 2 (base64 + unescape).
 */
function decodePlayerUrl(rawUrl: string, encryptMode?: number): string {
  let url = rawUrl.trim()
  if (!url) return ''

  // Split external subtitle attachments if present (e.g. url.m3u8*chs^...)
  if (url.includes('*')) {
    url = url.split('*')[0].trim()
  }

  const mode = Number(encryptMode ?? 0)
  if (mode === 1) {
    try {
      url = unescape(url)
    } catch {
      /* ignore */
    }
  } else if (mode === 2) {
    try {
      const b64 = Buffer.from(url, 'base64').toString('utf8')
      try {
        url = unescape(b64)
      } catch {
        url = b64
      }
    } catch {
      /* ignore */
    }
  }

  return url
}

/**
 * 3. Resolve direct playback URL for an episode.
 * Decodes player_aaaa into high quality Cloudflare HLS direct stream.
 */
export async function resolveGirigiri(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const baseUrl = getBaseUrl(rule)
  const absPlayUrl = pageUrl.startsWith('http')
    ? pageUrl
    : `${baseUrl}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`
  assertPublicHttpUrl(absPlayUrl)

  const res = await fetchPublic(
    absPlayUrl,
    { headers: getHtmlHeaders(`${baseUrl}/`) },
    { timeoutMs: 10_000 },
  )

  if (!res.ok) {
    throw new Error(`girigiri 获取播放页失败 (HTTP ${res.status})`)
  }

  const html = await res.text()

  // 1. Extract player_aaaa configuration
  let playerUrl = ''
  let encryptMode = 0
  const pMatch = html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (pMatch) {
    try {
      const pConfig = JSON.parse(pMatch[1]) as MacPlayerConfig
      playerUrl = (pConfig.url || '').trim()
      encryptMode = Number(pConfig.encrypt ?? 0)
    } catch {
      /* ignore JSON parse error */
    }
  }

  if (!playerUrl) {
    const rawUrlMatch = html.match(/player_aaaa\s*=\s*\{[\s\S]*?["']url["']\s*:\s*["']([^"']+)["']/i)
    if (rawUrlMatch) {
      playerUrl = rawUrlMatch[1].trim()
    }
    const rawEncMatch = html.match(/player_aaaa\s*=\s*\{[\s\S]*?["']encrypt["']\s*:\s*([0-9]+)/i)
    if (rawEncMatch) {
      encryptMode = Number(rawEncMatch[1])
    }
  }

  if (!playerUrl) {
    throw new Error('未在 girigiri 播放页找到 player_aaaa 播放参数')
  }

  // 2. Decode playback URL
  const decodedMediaUrl = decodePlayerUrl(playerUrl, encryptMode)
  if (!decodedMediaUrl.startsWith('http')) {
    throw new Error(`girigiri 解码直链格式异常: ${decodedMediaUrl}`)
  }

  const isHls = decodedMediaUrl.includes('.m3u8')
  const proxyUrl = isHls
    ? `/api/media/m3u8?url=${encodeURIComponent(decodedMediaUrl)}`
    : `/api/media/proxy?url=${encodeURIComponent(decodedMediaUrl)}`

  return {
    playUrl: decodedMediaUrl,
    proxyUrl,
    requiresProxy: false,
    format: isHls ? 'hls' : 'mp4',
    headers: {
      'User-Agent': config.defaultUserAgent,
    },
  }
}
