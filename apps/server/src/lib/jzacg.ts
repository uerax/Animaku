/**
 * jzacg.com / mgnacg.com (橘子动漫) dedicated adapter.
 *
 * Architecture:
 * - Frontend: MacCMS 模板 (二次元自适应主题)
 * - Base Domain: https://www.mgnacg.com
 * - Player Core:
 *   - Player iframe: https://play.mknacg.top:8585/cloudplay/?url={player_aaaa.url}
 *   - Encryption: AES-128-CBC with dynamic key/iv derived from iframe meta charset & viewport IDs + salt
 * - Media: High-bitrate 1080P MP4 (.mknvideo) / HLS (.m3u8) direct streams
 */
import crypto from 'node:crypto'
import * as cheerio from 'cheerio'
import {
  decodeHtmlEntities,
  type PluginChapterResult,
  type PluginRule,
  type PluginSearchResult,
  type ResolvePlayResult,
  type Road,
  type SearchItem,
} from '@animaku/shared'
import { config } from '../config'
import { assertPublicHttpUrl, fetchPublic } from './private-host'

export const JZACG_BASE_URL = 'https://www.jzacg.com'

const JZACG_PARSE_MAP: Record<string, string> = {
  '2_': 'https://play.mknacg.top:8585/cloudplay/?url=',
  '5_': 'https://play.mknacg.top:8585/cloudplay/yp2.php?url=',
  '6_': 'https://play.mknacg.top:8585/cloudplay/yp3.php?url=',
  '4_': 'https://play.mknacg.top:8585/cloudplay/ccxl.php?url=',
  '3_': 'https://play.mknacg.top:8585/muiplayer/?url=',
}

export function isJzacgRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (
    name === 'jzacg' ||
    name === '橘子' ||
    name === '橘子动漫' ||
    name === 'mgnacg' ||
    name === 'jz_acg'
  ) {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('jzacg.com') || base.includes('mgnacg.com')
}

function getBaseHeaders(referer: string = `${JZACG_BASE_URL}/`): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/html, application/xhtml+xml, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer,
  }
}

async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  retries = 4,
): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      assertPublicHttpUrl(url)
      const res = await fetchPublic(url, opts, { timeoutMs: 15_000, source: 'jzacg' })
      if (res.ok) return res
      if (res.status === 404 || res.status === 403) return res
    } catch (e) {
      lastErr = e
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)))
      }
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`)
}

interface MacSuggestResponse {
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

function decodeHtml(s: string): string {
  return decodeHtmlEntities(s).trim()
}

/**
 * 1. Search anime by keyword.
 */
export async function searchJzacg(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const effectiveBase = (rule.baseURL || JZACG_BASE_URL).replace(/\/+$/, '')
  const diagnostics: string[] = []
  const items: SearchItem[] = []
  const seenUrls = new Set<string>()

  // 1. 优先使用极速 Web HTML Search (毫秒级，避免 suggest API 限流延迟)
  try {
    const searchPageUrl = `${effectiveBase}/search/-------------/?wd=${encodeURIComponent(trimmed)}`
    const res = await fetchWithRetry(searchPageUrl, {
      headers: getBaseHeaders(`${effectiveBase}/`),
    })

    if (res.ok) {
      const html = await res.text()
      const $ = cheerio.load(html)
      $('a[href*="/media/"]').each((_, a) => {
        const href = $(a).attr('href') || ''
        const title = ($(a).attr('title') || $(a).text()).replace(/[\s\u00a0]+/g, ' ').trim()
        if (href && title && title.length > 1 && !/play|search|label/i.test(href)) {
          const detailUrl = href.startsWith('http') ? href : `${effectiveBase}${href}`
          if (!seenUrls.has(detailUrl)) {
            seenUrls.add(detailUrl)
            items.push({
              name: title,
              src: detailUrl,
            })
          }
        }
      })
    }
  } catch (err) {
    diagnostics.push(`Web HTML 搜索异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (items.length > 0) {
    return {
      pluginName: rule.name,
      items,
      diagnostics: diagnostics.length ? diagnostics : undefined,
    }
  }

  // 2. 兜底尝试 suggest JSON API
  try {
    const suggestUrl = `${effectiveBase}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(trimmed)}`
    const res = await fetchWithRetry(suggestUrl, {
      headers: getBaseHeaders(`${effectiveBase}/`),
    })

    if (res.ok) {
      const json = (await res.json()) as MacSuggestResponse
      if (json && Array.isArray(json.list) && json.list.length > 0) {
        for (const item of json.list) {
          if (!item.id || !item.name) continue
          const detailUrl = `${effectiveBase}/media/${item.id}/`
          if (!seenUrls.has(detailUrl)) {
            seenUrls.add(detailUrl)
            items.push({
              name: item.name.trim(),
              src: detailUrl,
            })
          }
        }
      }
    }
  } catch (err) {
    diagnostics.push(`Suggest API 搜索异常: ${err instanceof Error ? err.message : String(err)}`)
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics: diagnostics.length ? diagnostics : undefined,
  }
}

/**
 * 2. Parse video chapters and playback roads from detail page.
 */
export async function chaptersJzacg(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const effectiveBase = (rule.baseURL || JZACG_BASE_URL).replace(/\/+$/, '')
  const absDetailUrl = source.startsWith('http') ? source : `${effectiveBase}${source}`

  const res = await fetchWithRetry(absDetailUrl, {
    headers: getBaseHeaders(`${effectiveBase}/`),
  })

  if (!res.ok) {
    throw new Error(`橘子动漫获取番剧详情失败 (HTTP ${res.status})`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)
  const roads: Road[] = []

  // 1. Extract Tab Labels via Cheerio
  const tabNames: string[] = []
  const $tabBox = $('.anthology-tab').first()
  if ($tabBox.length > 0) {
    $tabBox.find('a').each((_, el) => {
      const $el = $(el).clone()
      $el.find('.badge, i, span').remove()
      const text = $el.text().replace(/[\s\u00a0]+/g, ' ').trim()
      if (text && !/简介|角色|剧情|排序/i.test(text)) {
        tabNames.push(text)
      }
    })
  } else {
    $('.hl-from-item, .nav-tabs li').each((_, el) => {
      const $el = $(el).clone()
      $el.find('.badge, i, span').remove()
      const text = $el.text().replace(/[\s\u00a0]+/g, ' ').trim()
      if (text && !/简介|角色|剧情|排序/i.test(text)) {
        tabNames.push(text)
      }
    })
  }

  // 2. Extract Playlists for each Road (优先匹配独立外层容器，避免与子级列表重复)
  let $listBoxes = $('.anthology-list-box')
  if ($listBoxes.length === 0) {
    $listBoxes = $('.anthology-list-play')
  }
  if ($listBoxes.length === 0) {
    $listBoxes = $('.hl-plays-list')
  }
  if ($listBoxes.length === 0) {
    $listBoxes = $('.playlist-content')
  }

  $listBoxes.each((idx, box) => {
    const urls: string[] = []
    const names: string[] = []
    $(box).find('a[href]').each((_, a) => {
      const href = $(a).attr('href') || ''
      const name = $(a).text().trim()
      if (
        href &&
        !href.startsWith('javascript:') &&
        name &&
        !/下载|APP/i.test(name)
      ) {
        const absEpUrl = href.startsWith('http') ? href : `${effectiveBase}${href}`
        urls.push(absEpUrl)
        names.push(name)
      }
    })

    const rawRoadName = tabNames[idx] || `播放线路 ${idx + 1}`
    if (urls.length > 0) {
      roads.push({
        name: rawRoadName,
        data: urls,
        identifier: names,
      })
    }
  })

  // 3. Fallback when Cheerio doesn't find container
  if (roads.length === 0) {
    const fallbackUrls: string[] = []
    const fallbackIds: string[] = []
    const fallbackRegex =
      /<a[^>]*href=["']([^"']*(?:play|media|bangumi)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    let fm: RegExpExecArray | null
    while ((fm = fallbackRegex.exec(html))) {
      const href = fm[1]
      const name = decodeHtml(fm[2].replace(/<[^>]+>/g, '')).trim()
      if (
        href &&
        !href.startsWith('javascript:') &&
        name &&
        /^第?\d+话?|^第?\d+集?|^\d+$/.test(name)
      ) {
        const absUrl = href.startsWith('http') ? href : `${effectiveBase}${href}`
        if (!fallbackUrls.includes(absUrl)) {
          fallbackUrls.push(absUrl)
          fallbackIds.push(name)
        }
      }
    }
    if (fallbackUrls.length > 0) {
      roads.push({
        name: '默认线路',
        data: fallbackUrls,
        identifier: fallbackIds,
      })
    }
  }

  if (roads.length === 0) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['未解析到橘子动漫播放源或选集列表'],
    }
  }

  return {
    pluginName: rule.name,
    roads,
  }
}

interface MacPlayerConfig {
  flag?: string
  encrypt?: number | string
  url?: string
  url_next?: string
  from?: string
  id?: string | number
  sid?: number
  nid?: number
  [key: string]: unknown
}

function extractPlayerAaaa(html: string): MacPlayerConfig | null {
  const pMatch =
    html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;/i) ||
    html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*</i)
  if (pMatch) {
    try {
      return JSON.parse(pMatch[1]) as MacPlayerConfig
    } catch {
      // ignore and try balanced braces
    }
  }

  const keyIdx = html.indexOf('player_aaaa')
  if (keyIdx < 0) return null
  const start = html.indexOf('{', keyIdx)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  let quote = ''
  for (let p = start; p < html.length; p++) {
    const ch = html[p]
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (ch === '\\') {
        esc = true
        continue
      }
      if (ch === quote) inStr = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inStr = true
      quote = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, p + 1)) as MacPlayerConfig
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function decryptJzacgCipher(cipherBase64: string, charsetId: string, viewportId: string): string {
  const pairs: Array<{ id: number; text: string }> = []
  for (let i = 0; i < charsetId.length; i++) {
    pairs.push({ id: Number(charsetId[i]), text: viewportId[i] })
  }
  pairs.sort((a, b) => a.id - b.id)
  const sortedText = pairs.map((p) => p.text).join('')

  const md5Hash = crypto
    .createHash('md5')
    .update(sortedText + 'Mknacg123321')
    .digest('hex')

  const key = Buffer.from(md5Hash.substring(16), 'utf8')
  const iv = Buffer.from(md5Hash.substring(0, 16), 'utf8')

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
  let decrypted = decipher.update(cipherBase64, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted.trim()
}

/**
 * 3. Resolve direct playback URL for an episode.
 */
export async function resolveJzacg(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const effectiveBase = (rule.baseURL || JZACG_BASE_URL).replace(/\/+$/, '')
  const absPlayUrl = pageUrl.startsWith('http') ? pageUrl : `${effectiveBase}${pageUrl}`

  const res = await fetchWithRetry(absPlayUrl, {
    headers: getBaseHeaders(`${effectiveBase}/`),
  })

  if (!res.ok) {
    throw new Error(`橘子动漫播放页请求失败 (HTTP ${res.status})`)
  }

  const html = await res.text()

  // 1. 优先提取 player_aaaa 并走官方线路解析
  const player = extractPlayerAaaa(html)
  if (player && player.url) {
    const rawUrl = player.url.trim()
    const from = String(player.from || '2_').trim()

    // 模式 A：如果是加密参数（encrypt: 2），调用专属播放器 iframe 解密
    const parsePrefix = JZACG_PARSE_MAP[from] || 'https://play.mknacg.top:8585/cloudplay/?url='
    const iframeUrl = `${parsePrefix}${rawUrl}`

    try {
      const iRes = await fetchWithRetry(iframeUrl, {
        headers: {
          Referer: absPlayUrl,
          'User-Agent': config.defaultUserAgent,
        },
      })

      if (iRes.ok) {
        const iHtml = await iRes.text()

        const charsetMatch =
          iHtml.match(/<meta[^>]*charset=["']?UTF-8["']?[^>]*id=["']now_(\d+)["']/i) ||
          iHtml.match(/id=["']now_(\d+)["'][^>]*charset=["']?UTF-8["']?/i)
        const viewportMatch =
          iHtml.match(/<meta[^>]*name=["']viewport["'][^>]*id=["']now_([a-zA-Z0-9]+)["']/i) ||
          iHtml.match(/id=["']now_([a-zA-Z0-9]+)["'][^>]*name=["']viewport["']/i)
        const configUrlMatch = iHtml.match(/["']url["']\s*:\s*["']([a-zA-Z0-9+/=]+)["']/i)

        if (charsetMatch && viewportMatch && configUrlMatch) {
          const directMediaUrl = decryptJzacgCipher(
            configUrlMatch[1],
            charsetMatch[1],
            viewportMatch[1],
          )

          if (directMediaUrl && directMediaUrl.startsWith('http')) {
            const isHls = /\.m3u8(\?|$)/i.test(directMediaUrl) || directMediaUrl.includes('.m3u8')
            const format: 'hls' | 'mp4' = isHls ? 'hls' : 'mp4'

            return {
              playUrl: directMediaUrl,
              proxyUrl: isHls
                ? `/api/media/m3u8?url=${encodeURIComponent(directMediaUrl)}`
                : `/api/media/proxy?url=${encodeURIComponent(directMediaUrl)}`,
              requiresProxy: false,
              format,
              referer: '',
              headers: {
                'User-Agent': config.defaultUserAgent,
              },
            }
          }
        }
      }
    } catch {
      /* ignore and fallback */
    }

    // 模式 B：若 rawUrl 本身已经解密为 http 直链
    if (rawUrl.startsWith('http')) {
      const isHls = /\.m3u8(\?|$)/i.test(rawUrl)
      return {
        playUrl: rawUrl,
        proxyUrl: isHls
          ? `/api/media/m3u8?url=${encodeURIComponent(rawUrl)}`
          : `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`,
        requiresProxy: false,
        format: isHls ? 'hls' : 'mp4',
        referer: '',
      }
    }
  }

  // 2. 通用直链嗅探 fallback
  const directMatches = html.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|mknvideo)(?:\?[^\s"'<>]*)?)/i)
  if (directMatches?.[1]) {
    const directUrl = directMatches[1].replace(/\\/g, '')
    const isHls = /\.m3u8(\?|$)/i.test(directUrl)
    return {
      playUrl: directUrl,
      proxyUrl: isHls
        ? `/api/media/m3u8?url=${encodeURIComponent(directUrl)}`
        : `/api/media/proxy?url=${encodeURIComponent(directUrl)}`,
      requiresProxy: false,
      format: isHls ? 'hls' : 'mp4',
      referer: '',
    }
  }

  throw new Error(`橘子动漫未能从播放页解析到直链: ${absPlayUrl}`)
}
