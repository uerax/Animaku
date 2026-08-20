/**
 * moonci.com (月之祠 - 二次元爱好者的纯净追番圣地) dedicated adapter.
 *
 * Architecture:
 * - Frontend: MacCMS 模板 (conch / 海螺模板)
 * - Search:
 *   - Fast Suggest JSON API: GET https://www.moonci.com/index.php/ajax/suggest?mid=1&wd={keyword}
 *   - HTML Web Search Fallback: GET https://www.moonci.com/search/-------------.html?wd={keyword}
 * - Chapters: GET https://www.moonci.com/anime/{id}.html
 *   - Multi-road tabs: X.1, X.2, X.3, X.4 (moedot CDN / xfvod / etc.)
 * - Play Resolution: GET https://www.moonci.com/anime/{id}/play/{road}-{ep}.html
 *   - player_aaaa configuration (encrypt: 1, unescape)
 * - Media: High quality 1080P MP4 direct streams / HLS (supports Accept-Ranges byte-level seek)
 *   - Referer: Must NOT send moonci referer (CDN returns 400 with referer, 206 without referer).
 *   - Native no-referrer player direct playback (0 proxy bandwidth consumption).
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

const MOONCI_BASE_URL = 'https://www.moonci.com'

export function isMoonciRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'moonci' || name === '月之祠') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('moonci.com')
}

function getBaseHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/html, application/xhtml+xml, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
  }
}

interface MoonciSuggestResponse {
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
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/**
 * 1. Search anime by keyword.
 * Primary: ajax suggest JSON API. Fallback: web search HTML page.
 */
export async function searchMoonci(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const diagnostics: string[] = []
  const items: SearchItem[] = []
  const seenUrls = new Set<string>()

  // 1. Try suggest JSON API
  try {
    const suggestUrl = `${MOONCI_BASE_URL}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(trimmed)}`
    assertPublicHttpUrl(suggestUrl)

    const res = await fetchPublic(
      suggestUrl,
      { headers: getBaseHeaders(`${MOONCI_BASE_URL}/`) },
      { timeoutMs: 8_000 },
    )

    if (res.ok) {
      const json = (await res.json()) as MoonciSuggestResponse
      if (json && Array.isArray(json.list) && json.list.length > 0) {
        for (const item of json.list) {
          if (!item.id || !item.name) continue
          const detailUrl = `${MOONCI_BASE_URL}/anime/${item.id}.html`
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

  // If suggest API returned items, return immediately
  if (items.length > 0) {
    return {
      pluginName: rule.name,
      items,
      diagnostics: diagnostics.length ? diagnostics : undefined,
    }
  }

  // 2. Fallback to HTML Web Search
  try {
    const searchPageUrl = `${MOONCI_BASE_URL}/search/-------------.html?wd=${encodeURIComponent(trimmed)}`
    assertPublicHttpUrl(searchPageUrl)

    const res = await fetchPublic(
      searchPageUrl,
      { headers: getBaseHeaders(`${MOONCI_BASE_URL}/`) },
      { timeoutMs: 10_000 },
    )

    if (res.ok) {
      const html = await res.text()
      // <a class="hl-item-thumb hl-lazy" href="/anime/228.html" title="葬送的芙莉莲"
      const itemRegex = /href=["'](\/anime\/\d+\.html)["'][^>]*title=["']([^"']+)["']/gi
      let m: RegExpExecArray | null
      while ((m = itemRegex.exec(html))) {
        const path = m[1]
        const title = decodeHtml(m[2]).trim()
        const detailUrl = `${MOONCI_BASE_URL}${path}`
        if (title && !seenUrls.has(detailUrl)) {
          seenUrls.add(detailUrl)
          items.push({
            name: title,
            src: detailUrl,
          })
        }
      }
    }
  } catch (err) {
    diagnostics.push(`Web HTML 搜索异常: ${err instanceof Error ? err.message : String(err)}`)
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
export async function chaptersMoonci(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  let animeId = ''
  try {
    const u = new URL(source, MOONCI_BASE_URL)
    const match = u.pathname.match(/\/anime\/(\d+)/)
    if (match) {
      animeId = match[1]
    }
  } catch {
    const match = source.match(/\/anime\/(\d+)/)
    if (match) {
      animeId = match[1]
    }
  }

  if (!animeId) {
    throw new Error(`无法从链接提取 Moonci 番剧 ID: ${source}`)
  }

  const detailUrl = `${MOONCI_BASE_URL}/anime/${animeId}.html`
  assertPublicHttpUrl(detailUrl)

  const res = await fetchPublic(
    detailUrl,
    { headers: getBaseHeaders(`${MOONCI_BASE_URL}/`) },
    { timeoutMs: 10_000 },
  )

  if (!res.ok) {
    throw new Error(`Moonci 获取番剧详情失败 (HTTP ${res.status})`)
  }

  const html = await res.text()

  // 1. Extract Tab Labels (e.g. X.1, X.2, X.3, X.4)
  // <li data-href="/anime/41/play/1-1.html">...<span class="hl-from-X_1 hl-lc-1">X.1</span>
  const tabLabels: string[] = []
  const tabRegex = /<li[^>]*data-href=["']([^"']+)["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*hl-from-[^"']*["'][^>]*>(.*?)<\/span>/gi
  let tm: RegExpExecArray | null
  while ((tm = tabRegex.exec(html))) {
    const rawLabel = decodeHtml(tm[2].replace(/<[^>]+>/g, '')).trim()
    if (rawLabel) {
      tabLabels.push(rawLabel)
    }
  }

  // 2. Extract Playlists (<ul class="...hl-plays-list...">...</ul>)
  const listRegex = /<ul[^>]*class=["'][^"']*hl-plays-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi
  let lm: RegExpExecArray | null
  const roads: Road[] = []
  let roadIndex = 0

  while ((lm = listRegex.exec(html))) {
    const listHtml = lm[1]
    const epRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi
    let em: RegExpExecArray | null
    const urls: string[] = []
    const identifiers: string[] = []

    while ((em = epRegex.exec(listHtml))) {
      const epHref = em[1]
      const epName = decodeHtml(em[2].replace(/<[^>]+>/g, '')).trim()
      if (epHref && !epHref.startsWith('javascript:') && epName) {
        const absEpUrl = epHref.startsWith('http') ? epHref : `${MOONCI_BASE_URL}${epHref}`
        urls.push(absEpUrl)
        identifiers.push(epName)
      }
    }

    if (urls.length > 0) {
      const roadName = tabLabels[roadIndex] || `线路 ${roadIndex + 1}`
      roads.push({
        name: roadName,
        data: urls,
        identifier: identifiers,
      })
    }
    roadIndex++
  }

  if (roads.length === 0) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['未解析到 Moonci 播放源或分集数据'],
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
 */
export async function resolveMoonci(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const absPlayUrl = pageUrl.startsWith('http') ? pageUrl : `${MOONCI_BASE_URL}${pageUrl}`
  assertPublicHttpUrl(absPlayUrl)

  const res = await fetchPublic(
    absPlayUrl,
    { headers: getBaseHeaders(`${MOONCI_BASE_URL}/`) },
    { timeoutMs: 10_000 },
  )

  if (!res.ok) {
    throw new Error(`Moonci 播放页请求失败 (HTTP ${res.status})`)
  }

  const html = await res.text()

  // Match MacCMS player_aaaa config
  const playerMatch =
    html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*</) ||
    html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})/)

  if (!playerMatch) {
    throw new Error(`Moonci 未在播放页找到 player_aaaa 播放配置: ${absPlayUrl}`)
  }

  let player: MacPlayerConfig
  try {
    player = JSON.parse(playerMatch[1]) as MacPlayerConfig
  } catch (err) {
    throw new Error(`Moonci player_aaaa 配置 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!player.url) {
    throw new Error('Moonci player_aaaa 未包含有效播放地址')
  }

  let directUrl = player.url
  const encryptMode = player.encrypt ?? 0

  if (encryptMode === 1) {
    directUrl = unescape(directUrl)
  } else if (encryptMode === 2) {
    directUrl = unescape(Buffer.from(directUrl, 'base64').toString('utf8'))
  } else if (encryptMode === 3) {
    directUrl = decodeURIComponent(directUrl)
  }

  directUrl = directUrl.trim()
  if (directUrl.startsWith('//')) {
    directUrl = `https:${directUrl}`
  }

  if (!directUrl.startsWith('http')) {
    throw new Error(`Moonci 解密后播放地址格式不正确: ${directUrl}`)
  }

  const isHls = /\.m3u8(\?|$)/i.test(directUrl)

  // IMPORTANT: For moedot / unicom cloud drive CDN, carrying moonci referer causes HTTP 400.
  // Animaku uses no-referrer by default, so referer must be empty.
  if (isHls) {
    const proxyUrl = `/api/media/m3u8?url=${encodeURIComponent(directUrl)}`
    return {
      playUrl: directUrl,
      proxyUrl,
      referer: '',
    }
  }

  // Progressive MP4 (Byte-level Range Seekable)
  const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(directUrl)}`
  return {
    playUrl: directUrl,
    proxyUrl,
    referer: '',
  }
}
