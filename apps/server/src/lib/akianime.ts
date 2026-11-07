/**
 * akianime.cc (AkiAnime 最新动漫) dedicated adapter.
 *
 * Architecture:
 * - Frontend: MacCMS template (dsn2) + Cloudflare CDN
 * - Search: GET https://www.akianime.cc/bgmsearch/{keyword}-------------.html
 * - Chapters: GET https://www.akianime.cc/bgmdetail/{id}.html
 *   - Multi-road tabs: 超高画三线 (YDY), 中画2 (lzm3u8), 中画 (bfzym3u8)
 * - Play Resolution: GET https://www.akianime.cc/bgmplay/{id}-{sid}-{nid}.html
 *   - player_aaaa configuration:
 *     - Direct M3U8: url is directly playable .m3u8
 *     - Dedicated YDY line: encrypted Doki-* token resolved via aniplayer RPC to 1080P MP4
 * - Media: High-bitrate 1080P MP4 direct streams hosted on China Mobile CMECloud (EOS)
 *   - Supports Accept-Ranges byte-level seek & Access-Control-Allow-Origin: *
 *   - 100% Zero-proxy browser direct stream compliant
 */
import {
  decodeHtmlEntities,
  type PluginChapterResult,
  type PluginRule,
  type PluginSearchResult,
  type ResolvePlayResult,
  type Road,
  type SearchItem,
} from '@animaku/shared'
import * as cheerio from 'cheerio'
import { config } from '../config'
import { assertPublicHttpUrl, fetchPublic } from './private-host'

const AKIANIME_BASE_URL = 'https://www.akianime.cc'
const ANIPLAYER_BASE_URL = 'https://aniplayer.xn--gmqr9gevarqk8t.cn'
const ANIPLAYER_API_URL = `${ANIPLAYER_BASE_URL}/api_config.php`

export function isAkianimeRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'akianime' || name === 'aki' || name === 'aki_anime') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return (
    base.includes('akianime.cc') ||
    base.includes('akianime.com')
  )
}

function getBaseHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : { Referer: `${AKIANIME_BASE_URL}/` }),
  }
}

function normalizeUrl(raw: string, base: string = AKIANIME_BASE_URL): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed, base).toString()
  } catch {
    return trimmed
  }
}

/**
 * 1. 搜索链路 (Search)
 * 采用 HTML 页面搜索以直接提取带 Hash 的详情页链接 (/bgmdetail/{id}.html)
 */
export async function searchAkianime(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const items: SearchItem[] = []
  const seenUrls = new Set<string>()
  const diagnostics: string[] = []

  try {
    const searchUrl = `${AKIANIME_BASE_URL}/bgmsearch/${encodeURIComponent(trimmed)}-------------.html`
    assertPublicHttpUrl(searchUrl)

    const res = await fetchPublic(
      searchUrl,
      { headers: getBaseHeaders(`${AKIANIME_BASE_URL}/`) },
      { timeoutMs: 12_000, source: 'akianime' },
    )

    if (res.ok) {
      const html = await res.text()
      const $ = cheerio.load(html)

      // 解析卡片式搜索条目
      $('.public-list-box, .detail-info, .search-box').each((_, el) => {
        const titleAnchor = $(el).find('a[href*="/bgmdetail/"]').first()
        const detailHref = titleAnchor.attr('href') || ''
        if (!detailHref) return

        const fullDetailUrl = normalizeUrl(detailHref)
        if (seenUrls.has(fullDetailUrl)) return

        const title =
          $(el).find('.slide-info-title, h3, h4').text().trim() ||
          titleAnchor.attr('title')?.trim() ||
          titleAnchor.text().trim()
        if (!title) return

        const imgEl = $(el).find('img').first()
        const rawCover =
          imgEl.attr('data-src') ||
          imgEl.attr('data-original') ||
          imgEl.attr('src') ||
          ''
        const cover = rawCover ? normalizeUrl(rawCover) : undefined

        seenUrls.add(fullDetailUrl)
        items.push({
          name: decodeHtmlEntities(title),
          src: fullDetailUrl,
          cover,
        })
      })

      // 兜底备用选择器：若主容器结构微调，直接提取所有包含 /bgmdetail/ 的链接
      if (items.length === 0) {
        $('a[href*="/bgmdetail/"]').each((_, a) => {
          const href = $(a).attr('href') || ''
          const fullUrl = normalizeUrl(href)
          if (!href || seenUrls.has(fullUrl)) return

          const title = $(a).attr('title')?.trim() || $(a).text().trim()
          if (!title || title.length < 2) return

          seenUrls.add(fullUrl)
          items.push({
            name: decodeHtmlEntities(title),
            src: fullUrl,
          })
        })
      }
    } else {
      diagnostics.push(`Search page returned HTTP ${res.status}`)
    }
  } catch (err) {
    diagnostics.push(`Search error: ${err instanceof Error ? err.message : String(err)}`)
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  }
}

/**
 * 2. 详情与分集链路 (Chapters)
 * 解析全部播放线路，并将“超高画三线 / YDY”等高质量线路置顶显示
 */
export async function chaptersAkianime(
  rule: PluginRule,
  detailUrl: string,
): Promise<PluginChapterResult> {
  assertPublicHttpUrl(detailUrl)

  const res = await fetchPublic(
    detailUrl,
    { headers: getBaseHeaders(detailUrl) },
    { timeoutMs: 12_000, source: 'akianime' },
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch akianime chapters: HTTP ${res.status}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  // 1. 提取所有线路名称
  const tabNames: string[] = []
  $('.anthology-tab a, .swiper-slide, [data-toggle="tab"]').each((_, el) => {
    // 移除 badge 计数与图标干扰
    const clone = $(el).clone()
    clone.find('.badge, i, em, span').remove()
    const name = clone.text().trim()
    if (name && !name.includes('首页') && !name.includes('剧场') && !name.includes('APP')) {
      tabNames.push(decodeHtmlEntities(name))
    }
  })

  // 2. 提取各线路的分集列表容器 (.anthology-list-box)
  const roads: Road[] = []
  const boxEls = $('.anthology-list-box')

  if (boxEls.length > 0) {
    boxEls.each((idx, box) => {
      const data: string[] = []
      const identifier: string[] = []
      $(box).find('a[href*="/bgmplay/"]').each((_, a) => {
        const href = $(a).attr('href') || ''
        const epName = $(a).text().trim()
        if (href && epName) {
          data.push(normalizeUrl(href))
          identifier.push(decodeHtmlEntities(epName))
        }
      })

      if (data.length > 0) {
        const roadName = tabNames[idx] || `线路 ${idx + 1}`
        roads.push({
          name: roadName,
          data,
          identifier,
        })
      }
    })
  }

  // 兜底：若 .anthology-list-box 结构不匹配，则按 URL 中的 sid 分组
  if (roads.length === 0) {
    const sidGroupMap = new Map<string, { data: string[]; identifier: string[] }>()
    $('a[href*="/bgmplay/"]').each((_, a) => {
      const href = $(a).attr('href') || ''
      const text = $(a).text().trim()
      const match = href.match(/\/bgmplay\/[^-]+-(\d+)-\d+\.html/i)
      if (match && text) {
        const sid = match[1]
        if (!sidGroupMap.has(sid)) {
          sidGroupMap.set(sid, { data: [], identifier: [] })
        }
        const group = sidGroupMap.get(sid)!
        group.data.push(normalizeUrl(href))
        group.identifier.push(decodeHtmlEntities(text))
      }
    })

    let idx = 0
    for (const [, grp] of sidGroupMap.entries()) {
      const roadName = tabNames[idx] || `线路 ${idx + 1}`
      roads.push({
        name: roadName,
        data: grp.data,
        identifier: grp.identifier,
      })
      idx++
    }
  }


  return {
    pluginName: rule.name,
    roads,
  }
}

interface PlayerAaaaConfig {
  flag?: string
  encrypt?: number
  trysee?: number
  url?: string
  from?: string
  id?: string
  sid?: number
  nid?: number
}

interface AniplayerConfig {
  url?: string
  key?: string
  time?: string | number
  title?: string
}

interface AniplayerApiResponse {
  code?: string | number
  url?: string
  msg?: string
  type?: string
}

/**
 * 3. 播放直链解析 (Resolve)
 * - 针对 YDY 线路，请求 aniplayer 置换带有 AWS4 签名的中国移动云 1080P MP4 直链
 * - 针对直接暴露的 M3U8/MP4 线路，直接返回
 */
export async function resolveAkianime(
  _rule: PluginRule,
  episodeUrl: string,
): Promise<ResolvePlayResult> {
  assertPublicHttpUrl(episodeUrl)

  const res = await fetchPublic(
    episodeUrl,
    { headers: getBaseHeaders(episodeUrl) },
    { timeoutMs: 12_000, source: 'akianime' },
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch akianime episode page: HTTP ${res.status}`)
  }

  const html = await res.text()

  // 提取 player_aaaa 配置
  const matchAaaa = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/i)
  if (!matchAaaa) {
    throw new Error('player_aaaa configuration not found in page')
  }

  let playerConfig: PlayerAaaaConfig
  try {
    playerConfig = JSON.parse(matchAaaa[1])
  } catch (err) {
    throw new Error(`Failed to parse player_aaaa JSON: ${err}`)
  }

  const rawUrl = playerConfig.url?.trim() || ''
  if (!rawUrl) {
    throw new Error('Empty playback URL in player_aaaa configuration')
  }

  // 1. 若已经是标准直链 (.m3u8 / .mp4 / .flv)，直接返回
  if (
    rawUrl.includes('.m3u8') ||
    rawUrl.includes('.mp4') ||
    rawUrl.includes('.flv')
  ) {
    const isHls = /\.m3u8(\?|$)/i.test(rawUrl)
    return {
      playUrl: rawUrl,
      proxyUrl: isHls
        ? `/api/media/m3u8?url=${encodeURIComponent(rawUrl)}`
        : `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`,
      format: isHls ? 'hls' : 'mp4',
      referer: '',
    }
  }

  // 2. 专有 YDY / Doki 线路解析流程
  const parserPageUrl = `${ANIPLAYER_BASE_URL}/?url=${encodeURIComponent(rawUrl)}`
  assertPublicHttpUrl(parserPageUrl)

  const parserPageRes = await fetchPublic(
    parserPageUrl,
    { headers: getBaseHeaders(episodeUrl) },
    { timeoutMs: 12_000, source: 'akianime' },
  )

  if (!parserPageRes.ok) {
    throw new Error(`Failed to load aniplayer page: HTTP ${parserPageRes.status}`)
  }

  const parserHtml = await parserPageRes.text()

  // 从播放器 HTML 提取 config 配置 (包含 key 和 time 签名因子)
  const configMatch = parserHtml.match(/var\s+config\s*=\s*(\{[\s\S]*?\})\s*player/i)
  if (!configMatch) {
    throw new Error('aniplayer config not found in parser page')
  }

  let aniConfig: AniplayerConfig
  try {
    // 兼容移除末尾多余逗号
    const sanitized = configMatch[1].replace(/,\s*\}/g, '}')
    aniConfig = JSON.parse(sanitized)
  } catch (err) {
    throw new Error(`Failed to parse aniplayer config: ${err}`)
  }

  // POST api_config.php 换取签名直链
  const postBody = new URLSearchParams({
    url: aniConfig.url || rawUrl,
    key: String(aniConfig.key || ''),
    time: String(aniConfig.time || ''),
    title: String(aniConfig.title || ''),
  }).toString()

  const apiRes = await fetchPublic(
    ANIPLAYER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': config.defaultUserAgent,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: parserPageUrl,
      },
      body: postBody,
    },
    { timeoutMs: 12_000, source: 'akianime' },
  )

  if (!apiRes.ok) {
    throw new Error(`aniplayer API returned HTTP ${apiRes.status}`)
  }

  const apiData = (await apiRes.json()) as AniplayerApiResponse
  if (String(apiData.code) !== '200' || !apiData.url) {
    throw new Error(`aniplayer resolution failed: code=${apiData.code}, msg=${apiData.msg || 'unknown'}`)
  }

  const finalPlayUrl = apiData.url.trim()
  const isHls = /\.m3u8(\?|$)/i.test(finalPlayUrl)

  // 成功置换出中国移动云 CMECloud 1080P MP4 签名直链
  return {
    playUrl: finalPlayUrl,
    proxyUrl: isHls
      ? `/api/media/m3u8?url=${encodeURIComponent(finalPlayUrl)}`
      : `/api/media/proxy?url=${encodeURIComponent(finalPlayUrl)}`,
    format: isHls ? 'hls' : 'mp4',
    referer: '',
  }
}
