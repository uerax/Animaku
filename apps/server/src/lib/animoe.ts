/**
 * Animoe 动漫 (animoe.org) dedicated video source adapter.
 *
 * Architecture:
 * - Frontend: MacCMS v10 + MXone / MXtheme 模板 (animoe.org)
 * - Search:
 *   - Fast Suggest JSON API: GET https://animoe.org/index.php/ajax/suggest?mid=1&wd={keyword}
 *   - Exempt from CAPTCHA verification, returns Bangumi cover images.
 * - Chapters: GET https://animoe.org/info/{id}.html
 *   - Multi-road tabs: 字幕组 (Raw + ASS), 动画疯 (Baha), BiliBili国际, 其他 等
 * - Play Resolution: GET https://animoe.org/play/{id}-{sid}-{nid}.html
 *   - player_aaaa configuration (encrypt: 0, url: "https://animoe.org/m3u8/video/{hash}.m3u8*...")
 *   - Media:
 *     - Encrypted M3U8 playlist with 'enc!' magic header, auto-decrypted in server media gateway.
 *     - Media segments hosted on NetEase Cloud Music CDN (p1.music.126.net / nos.netease.com)
 *     - Pure direct streaming for segments: native CORS wildcard (Access-Control-Allow-Origin: *), no Referer anti-leech.
 *     - Zero video proxy bandwidth consumption.
 */
import * as cheerio from 'cheerio'
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

const ANIMOE_DEFAULT_BASE_URL = 'https://animoe.org'

export function isAnimoeRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'animoe' || name === 'animoe动漫' || name === 'animoe-org') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('animoe.org')
}

function getBaseUrl(rule?: PluginRule): string {
  if (rule?.baseURL && /^https?:\/\//i.test(rule.baseURL)) {
    return rule.baseURL.replace(/\/+$/, '')
  }
  return ANIMOE_DEFAULT_BASE_URL
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
    'X-Requested-With': 'XMLHttpRequest',
    ...(referer ? { Referer: referer } : {}),
  }
}

interface AnimoeSuggestResponse {
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
 * Primary: ajax suggest JSON API (exempt from HTML search CAPTCHA).
 */
export async function searchAnimoe(
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

  // Build query fallback list (compact season numbers and stripped base title)
  const queriesToTry: string[] = []
  const compact = trimmed.replace(/\s+(第\s*[一二三四五六七八九十\d]+\s*[季期部])/g, '$1')
  if (compact !== trimmed) {
    queriesToTry.push(compact)
  }
  queriesToTry.push(trimmed)

  const stripped = extractBaseTitle(trimmed)
  if (stripped && stripped !== trimmed && !queriesToTry.includes(stripped)) {
    const compactStripped = stripped.replace(/\s+(第\s*[一二三四五六七八九十\d]+\s*[季期部])/g, '$1')
    if (compactStripped !== stripped && !queriesToTry.includes(compactStripped)) {
      queriesToTry.push(compactStripped)
    }
    queriesToTry.push(stripped)
  }

  for (const q of queriesToTry) {
    try {
      const suggestUrl = `${baseUrl}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(q)}`
      assertPublicHttpUrl(suggestUrl)

      const res = await fetchPublic(
        suggestUrl,
        { headers: getJsonHeaders(`${baseUrl}/`) },
        { timeoutMs: 8_000 },
      )

      if (res.ok) {
        const json = (await res.json()) as AnimoeSuggestResponse
        if (json && Array.isArray(json.list) && json.list.length > 0) {
          for (const item of json.list) {
            if (!item.id || !item.name) continue
            const detailUrl = `${baseUrl}/info/${item.id}.html`
            if (!seenUrls.has(detailUrl)) {
              seenUrls.add(detailUrl)
              items.push({
                name: item.name.trim(),
                src: detailUrl,
              })
            }
          }
          if (items.length > 0) {
            break // Found matching items, stop fallback queries
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
export async function chaptersAnimoe(
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
    throw new Error(`Animoe 获取番剧详情失败 (HTTP ${res.status})`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  // 1. Extract Tab Labels (e.g. 字幕组, 动画疯, BiliBili国际, 其他)
  const tabLabels: string[] = []
  $('.module-tab-item, .anthology-tab a').each((_, el) => {
    const text = $(el)
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    // Filter out toolbar buttons like "排序", close icons or pure numbers
    if (text && !/^(排序|正序|倒序|展开|收起)$/i.test(text) && !$(el).find('i.icon-close').length) {
      tabLabels.push(text)
    }
  })

  // 2. Extract Playlists
  const roads: Road[] = []
  const playBoxes = $('.module-play-list')

  if (playBoxes.length > 0) {
    playBoxes.each((boxIndex, box) => {
      const $box = $(box)
      const urls: string[] = []
      const identifiers: string[] = []

      $box.find('a[href*="/play/"]').each((__, a) => {
        const href = $(a).attr('href') || ''
        let name = $(a).text().trim()
        if (href && !href.startsWith('javascript:') && name) {
          const absEpUrl = href.startsWith('http')
            ? href
            : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
          if (/^\d+$/.test(name)) {
            name = `第${name.padStart(2, '0')}集`
          }
          if (!urls.includes(absEpUrl)) {
            urls.push(absEpUrl)
            identifiers.push(name)
          }
        }
      })

      if (urls.length > 0) {
        const roadName =
          tabLabels[boxIndex] ||
          (boxIndex === 0 ? '默认线路' : `线路 ${boxIndex + 1}`)
        roads.push({
          name: roadName,
          data: urls,
          identifier: identifiers,
        })
      }
    })
  }

  // Fallback: extract any play links
  if (roads.length === 0) {
    const urls: string[] = []
    const identifiers: string[] = []
    $('a[href*="/play/"]').each((_, a) => {
      const href = $(a).attr('href') || ''
      let name = $(a).text().trim()
      if (href && !href.startsWith('javascript:') && name && name.length < 30) {
        const absEpUrl = href.startsWith('http')
          ? href
          : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
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
      diagnostics: ['未解析到 Animoe 播放源或分集数据'],
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
 * 3. Resolve direct playback URL for an episode.
 * Extracts player_aaaa and points to M3U8 gateway for on-the-fly decryption.
 */
export async function resolveAnimoe(
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
    throw new Error(`Animoe 获取播放页失败 (HTTP ${res.status})`)
  }

  const html = await res.text()

  // Extract player_aaaa configuration
  const playerMatch = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (!playerMatch || !playerMatch[1]) {
    throw new Error('未在 Animoe 播放页中提取到播放器配置 (player_aaaa)')
  }

  let playerConfig: MacPlayerConfig
  try {
    playerConfig = JSON.parse(playerMatch[1])
  } catch {
    throw new Error('Animoe 播放器配置 (player_aaaa) JSON 解析失败')
  }

  if (!playerConfig.url) {
    throw new Error('Animoe 播放器配置中未包含有效的媒体地址 (url 为空)')
  }

  // Raw URL might contain subtitle attachment: url.m3u8*chi^Simplified Chinese^url.ass
  // Extract pure M3U8 video stream URL before '*'
  let videoUrl = playerConfig.url.trim()
  if (videoUrl.includes('*')) {
    videoUrl = videoUrl.split('*')[0].trim()
  }

  assertPublicHttpUrl(videoUrl)

  // Requires media gateway proxy entry (/api/media/stream) to auto-decrypt 'enc!' M3U8
  // Segments inside M3U8 are pure NetEase CDN direct URLs (0 server proxy bandwidth)
  const proxyUrl = `/api/media/stream?url=${encodeURIComponent(videoUrl)}`

  return {
    playUrl: videoUrl,
    proxyUrl,
    requiresProxy: true,
    headers: {
      'User-Agent': config.defaultUserAgent,
      Referer: `${baseUrl}/`,
    },
    format: 'hls',
  }
}
