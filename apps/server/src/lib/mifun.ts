/**
 * MiFun (ios.mifun.org) dedicated video source adapter.
 *
 * Architecture:
 * - Frontend: MacCMS 传统海螺模板 (ios.mifun.org)
 * - Search:
 *   - Fast Suggest JSON API: GET https://ios.mifun.org/index.php/ajax/suggest?mid=1&wd={keyword}
 * - Chapters: GET https://ios.mifun.org/voddetail/{id}.html
 *   - Multi-source playlist tabs: 快看云 / 特快云 等
 * - Play Resolution: GET https://ios.mifun.org/vodplay/{id}-{sid}-{nid}/
 *   - player_aaaa configuration (url: "video__XXXXXXXX...", from: "1080zyk")
 *   - Resolution Gateway: GET https://data.m3u8.in/player/?url={url} -> Extract Sign
 *   - Direct API: GET https://data.m3u8.in/player/api.php?url={url}&sign={sign}
 * - Media:
 *   - High bitrate 1080P MP4 direct streams hosted on ByteDance / Douyin CDN (v3.douyinvod.com)
 *     or Baidu BCE BOS CDN (cambrian-video-origin.cdn.bcebos.com)
 *   - Supports HTTP 206 Partial Content & Accept-Ranges byte-level seek.
 *   - Full CORS wildcard (Access-Control-Allow-Origin: *).
 *   - Pure native direct playback (0 proxy bandwidth consumption).
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

const MIFUN_DEFAULT_BASE_URL = 'https://ios.mifun.org'
const RESOLVER_BASE_URL = 'https://data.m3u8.in/player'

export function isMifunRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'mifun' || name === 'mifun动漫' || name === 'mifun-ios') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('mifun.org') || base.includes('mifun.cc')
}

function getBaseUrl(rule?: PluginRule): string {
  if (rule?.baseURL && /^https?:\/\//i.test(rule.baseURL)) {
    return rule.baseURL.replace(/\/+$/, '')
  }
  return MIFUN_DEFAULT_BASE_URL
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

interface MifunSuggestResponse {
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
export async function searchMifun(
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
      const json = (await res.json()) as MifunSuggestResponse
      if (json && Array.isArray(json.list) && json.list.length > 0) {
        for (const item of json.list) {
          if (!item.id || !item.name) continue
          const detailUrl = `${baseUrl}/voddetail/${item.id}.html`
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
export async function chaptersMifun(
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
    throw new Error(`MiFun 获取番剧详情失败 (HTTP ${res.status})`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  // 1. Extract Tab Labels (e.g. 快看云, 特快云)
  const tabLabels: string[] = []
  $('.hl-plays-from a, .hl-tabs-btn').each((_, el) => {
    const alt = $(el).attr('alt')
    const text = $(el)
      .text()
      .replace(/\s+/g, ' ')
      .replace(/\d+$/, '')
      .trim()
    const label = (alt || text).trim()
    if (label) {
      tabLabels.push(label)
    }
  })

  // 2. Extract Playlists
  const roads: Road[] = []
  let roadIndex = 0

  $('.hl-tabs-box').each((_, box) => {
    const $box = $(box)
    const urls: string[] = []
    const identifiers: string[] = []

    $box.find('.hl-plays-list a').each((__, a) => {
      const href = $(a).attr('href') || ''
      const name = $(a).text().trim()
      if (href && !href.startsWith('javascript:') && name) {
        const absEpUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
        urls.push(absEpUrl)
        identifiers.push(name)
      }
    })

    if (urls.length > 0) {
      const roadName = tabLabels[roadIndex] || `线路 ${roadIndex + 1}`
      roads.push({
        name: roadName,
        data: urls,
        identifier: identifiers,
      })
      roadIndex++
    }
  })

  // Fallback if hl-tabs-box was not present: direct search for all vodplay links
  if (roads.length === 0) {
    const urls: string[] = []
    const identifiers: string[] = []
    $('a[href*="vodplay"]').each((_, a) => {
      const href = $(a).attr('href') || ''
      const name = $(a).text().trim()
      if (
        href &&
        !href.startsWith('javascript:') &&
        name &&
        !name.includes('立即播放') &&
        name.length < 30
      ) {
        const absEpUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
        if (!urls.includes(absEpUrl)) {
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
      diagnostics: ['未解析到 MiFun 播放源或分集数据'],
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

interface ResolverApiResponse {
  code: number
  url?: string
  msg?: string
  type?: string | null
}

/**
 * 3. Resolve direct playback URL for an episode.
 * Extracts video token, fetches sign from resolver, and issues direct CDN stream.
 */
export async function resolveMifun(
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
    throw new Error(`MiFun 获取播放页失败 (HTTP ${res.status})`)
  }

  const html = await res.text()

  // 1. Extract player_aaaa JSON
  let playerUrl = ''
  const pMatch = html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (pMatch) {
    try {
      const pConfig = JSON.parse(pMatch[1]) as MacPlayerConfig
      playerUrl = (pConfig.url || '').trim()
    } catch {
      /* ignore JSON parse error */
    }
  }

  if (!playerUrl) {
    const rawUrlMatch = html.match(/player_aaaa\s*=\s*\{[\s\S]*?["']url["']\s*:\s*["']([^"']+)["']/i)
    if (rawUrlMatch) {
      playerUrl = rawUrlMatch[1].trim()
    }
  }

  if (!playerUrl) {
    throw new Error('未在 MiFun 播放页找到 player_aaaa 播放参数')
  }

  // If already a direct media URL (http...mp4 / m3u8), return directly
  if (/^https?:\/\/.*?\.(m3u8|mp4)(?:\?|$)/i.test(playerUrl)) {
    const isHls = playerUrl.includes('.m3u8')
    const proxyUrl = isHls
      ? `/api/media/m3u8?url=${encodeURIComponent(playerUrl)}`
      : `/api/media/proxy?url=${encodeURIComponent(playerUrl)}`
    return {
      playUrl: playerUrl,
      proxyUrl,
      requiresProxy: false,
      format: isHls ? 'hls' : 'mp4',
      headers: {
        'User-Agent': config.defaultUserAgent,
      },
    }
  }

  // 2. Call resolution gateway (data.m3u8.in)
  const parseUrl = `${RESOLVER_BASE_URL}/?url=${encodeURIComponent(playerUrl)}`
  assertPublicHttpUrl(parseUrl)

  const parseRes = await fetchPublic(
    parseUrl,
    {
      headers: {
        'User-Agent': config.defaultUserAgent,
        Referer: absPlayUrl,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    },
    { timeoutMs: 8_000 },
  )

  if (!parseRes.ok) {
    throw new Error(`MiFun 解析网关响应异常 (HTTP ${parseRes.status})`)
  }

  const parseHtml = await parseRes.text()

  // Extract dynamic Sign from resolver HTML
  const signMatch = parseHtml.match(/const\s+Sign\s*=\s*["']([^"']+)["']/i)
  if (!signMatch || !signMatch[1]) {
    throw new Error('未在 MiFun 解析网关页面中提取到动态 Sign')
  }
  const sign = signMatch[1].trim()

  // 3. Request api.php to get real CDN media direct stream
  const apiUrl = `${RESOLVER_BASE_URL}/api.php?url=${encodeURIComponent(playerUrl)}&sign=${encodeURIComponent(sign)}`
  assertPublicHttpUrl(apiUrl)

  const apiRes = await fetchPublic(
    apiUrl,
    {
      headers: {
        'User-Agent': config.defaultUserAgent,
        Referer: parseUrl,
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
    },
    { timeoutMs: 8_000 },
  )

  if (!apiRes.ok) {
    throw new Error(`MiFun 接口解析失败 (HTTP ${apiRes.status})`)
  }

  const apiJson = (await apiRes.json()) as ResolverApiResponse
  if (apiJson.code !== 200 || !apiJson.url) {
    throw new Error(
      `MiFun 直链解析异常: ${apiJson.msg || '未能解析到有效直链'} (code ${apiJson.code})`,
    )
  }

  const directMediaUrl = apiJson.url.trim()
  const isHls = directMediaUrl.includes('.m3u8')
  const proxyUrl = isHls
    ? `/api/media/m3u8?url=${encodeURIComponent(directMediaUrl)}`
    : `/api/media/proxy?url=${encodeURIComponent(directMediaUrl)}`

  return {
    playUrl: directMediaUrl,
    proxyUrl,
    requiresProxy: false,
    format: isHls ? 'hls' : 'mp4',
    headers: {
      'User-Agent': config.defaultUserAgent,
    },
  }
}
