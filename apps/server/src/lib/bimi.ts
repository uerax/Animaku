/**
 * Bimi (www.bimiacg14.net / bimibimi) dedicated video source adapter.
 *
 * Architecture:
 * - Frontend: MacCMS v10 + xingchao (星潮) template (bimiacg14.net)
 * - Search:
 *   - Fast Suggest JSON API: GET https://www.bimiacg14.net/index.php/ajax/suggest?mid=1&wd={keyword}
 * - Chapters: GET https://www.bimiacg14.net/bangumi/bi/{id}/
 *   - Multi-source playlist tabs: 国际线路 / dp云播 / dev云播 (filters out "APP专用" client-only tabs)
 * - Play Resolution: GET https://www.bimiacg14.net/bangumi/{id}/play/{sid}/{nid}/
 *   - Extract dynamic JSON config: <script type="application/json" data-artplayer-config>{ "token": "..." }</script>
 *   - Session-bound Gateway: POST https://www.bimiacg14.net/static/danmu/play.php?resolve=1
 *     - Request: token={token}&challenge={random_32_bytes_hex} (with PHPSESSID cookie)
 *     - Response: AES-256-GCM ciphertext payload
 *   - Local Decryption:
 *     - AAD = "bimi-response-v1|" + challenge
 *     - Key = HMAC-SHA256(key=token, message=AAD)
 *     - AES-256-GCM decrypt payload -> { id, sid, nid, url }
 * - Media:
 *   - TikTok Akamai CDN / Kuaishou CDN / Telecom Cloudcube MP4 direct streams
 *   - Full CORS wildcard or native <video> direct playback
 *   - 100% Zero server media proxy egress bandwidth
 */
import crypto from 'node:crypto'
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

const BIMI_DEFAULT_BASE_URL = 'https://www.bimiacg14.net'

export function isBimiRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'bimi' || name === '哔咪' || name === 'bimiacg' || name === 'bimibimi') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('bimiacg') || base.includes('bimibimi')
}

function getBaseUrl(rule?: PluginRule): string {
  if (rule?.baseURL && /^https?:\/\//i.test(rule.baseURL)) {
    return rule.baseURL.replace(/\/+$/, '')
  }
  return BIMI_DEFAULT_BASE_URL
}

function getBaseHeaders(referer?: string, cookie?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

interface BimiSuggestResponse {
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

interface BimiEncryptedPayload {
  v: number
  iv: string
  ciphertext: string
  tag: string
}

interface BimiResolveResponse {
  code: number
  msg?: string
  data?: BimiEncryptedPayload
}

/**
 * 1. Search anime by keyword.
 * Primary: ajax suggest JSON API.
 */
export async function searchBimi(
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
  const seenIds = new Set<string>()

  const queriesToTry: string[] = [trimmed]
  const baseTitle = extractBaseTitle(trimmed)
  if (baseTitle && baseTitle !== trimmed) {
    queriesToTry.push(baseTitle)
  }

  for (const q of queriesToTry) {
    try {
      const suggestUrl = `${baseUrl}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(q)}`
      assertPublicHttpUrl(suggestUrl)

      const res = await fetchPublic(
        suggestUrl,
        { headers: getBaseHeaders(`${baseUrl}/`) },
        { timeoutMs: 3_000 },
      )

      if (res.ok) {
        const json = (await res.json()) as BimiSuggestResponse
        if (json && Array.isArray(json.list) && json.list.length > 0) {
          for (const item of json.list) {
            if (!item.id || !item.name) continue
            const idStr = String(item.id)
            if (seenIds.has(idStr)) continue
            seenIds.add(idStr)

            items.push({
              name: item.name.trim(),
              src: `${baseUrl}/bangumi/bi/${item.id}/`,
              cover: item.pic || undefined,
            })
          }
          // If we found items with the exact/first query, break early
          if (items.length > 0) break
        }
      }
    } catch (e) {
      diagnostics.push(
        `[bimi] 搜索 "${q}" 失败: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  }
}

/**
 * 2. Fetch anime detail & chapters.
 * Parses tabs and panels from /bangumi/bi/{id}/, filtering out "APP专用" client-only lines.
 */
export async function chaptersBimi(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const baseUrl = getBaseUrl(rule)
  let detailUrl = source.trim()
  if (!/^https?:\/\//i.test(detailUrl)) {
    const idMatch = detailUrl.match(/\d+/)
    if (idMatch) {
      detailUrl = `${baseUrl}/bangumi/bi/${idMatch[0]}/`
    } else {
      detailUrl = `${baseUrl}/bangumi/bi/${detailUrl}/`
    }
  }

  assertPublicHttpUrl(detailUrl)

  const res = await fetchPublic(
    detailUrl,
    { headers: getBaseHeaders(`${baseUrl}/`) },
    { timeoutMs: 8_000 },
  )

  if (!res.ok) {
    throw new Error(`获取 Bimi 动漫详情失败: HTTP ${res.status}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)
  const roads: Road[] = []

  // Extract source tabs: <button role="tab" data-source-tab="{sid}">线路名<span>集数</span></button>
  const tabElements = $('[data-source-tab]')

  if (tabElements.length > 0) {
    tabElements.each((_, el) => {
      const $tab = $(el)
      const sid = $tab.attr('data-source-tab')?.trim()
      // Remove child span before getting name
      const $clone = $tab.clone()
      $clone.find('span').remove()
      const roadName = $clone.text().trim() || `线路 ${sid || ''}`

      // Skip client-only lines
      if (roadName.toUpperCase().includes('APP')) {
        return
      }

      const urls: string[] = []
      const identifiers: string[] = []
      // Find corresponding panel: data-source-panel="{sid}" or id="source-panel-{sid}"
      const panel = sid
        ? $(`[data-source-panel="${sid}"], #source-panel-${sid}`)
        : $tab.next('.episode-panel')

      panel.find('a[href*="/play/"]').each((__, a) => {
        const $a = $(a)
        const href = $a.attr('href')?.trim()
        const title = $a.text().trim() || $a.attr('title')?.trim() || `第 ${__ + 1} 话`
        if (href) {
          const fullLink = href.startsWith('http')
            ? href
            : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
          urls.push(fullLink)
          identifiers.push(title)
        }
      })

      if (urls.length > 0) {
        roads.push({
          name: roadName,
          data: urls,
          identifier: identifiers,
        })
      }
    })
  }

  // Fallback: if no tabs were found, inspect all episode panels
  if (roads.length === 0) {
    $('.episode-panel').each((idx, panelEl) => {
      const $panel = $(panelEl)
      const sid = $panel.attr('data-source-panel') || String(idx + 1)
      const urls: string[] = []
      const identifiers: string[] = []

      $panel.find('a[href*="/play/"]').each((__, a) => {
        const $a = $(a)
        const href = $a.attr('href')?.trim()
        const title = $a.text().trim() || $a.attr('title')?.trim() || `第 ${__ + 1} 话`
        if (href) {
          const fullLink = href.startsWith('http')
            ? href
            : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
          urls.push(fullLink)
          identifiers.push(title)
        }
      })

      if (urls.length > 0) {
        roads.push({
          name: `线路 ${sid}`,
          data: urls,
          identifier: identifiers,
        })
      }
    })
  }

  if (roads.length === 0) {
    throw new Error('未在 Bimi 详情页找到可用于 Web 端播放的有效线路（可能该作品仅支持在 APP 播放）')
  }

  return {
    pluginName: rule.name,
    roads,
  }
}

/**
 * 3. Resolve playback URL.
 * Fetches play page -> extracts session cookie and token -> issues challenge to play.php -> decrypts AES-256-GCM.
 */
export async function resolveBimiPlayUrl(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const baseUrl = getBaseUrl(rule)
  let playPageUrl = pageUrl.trim()
  if (!/^https?:\/\//i.test(playPageUrl)) {
    playPageUrl = `${baseUrl}${playPageUrl.startsWith('/') ? '' : '/'}${playPageUrl}`
  }

  assertPublicHttpUrl(playPageUrl)

  // Step 1: Request play page to obtain session cookie and embed token
  const pageRes = await fetchPublic(
    playPageUrl,
    { headers: getBaseHeaders(`${baseUrl}/`) },
    { timeoutMs: 8_000 },
  )

  if (!pageRes.ok) {
    throw new Error(`请求 Bimi 播放页失败: HTTP ${pageRes.status}`)
  }

  const rawCookie = pageRes.headers.get('set-cookie') || ''
  const cookieMatch = rawCookie.match(/PHPSESSID=[^;]+/i)
  const sessionCookie = cookieMatch ? cookieMatch[0] : ''

  const html = await pageRes.text()
  const tokenMatch = html.match(/"token":"([^"]+)"/)
  if (!tokenMatch || !tokenMatch[1]) {
    throw new Error('未在 Bimi 播放页找到播放凭证（该剧集可能仅支持在客户端播放或已被源站下线）')
  }
  const token = tokenMatch[1]

  // Step 2: Generate random 32-byte (64 hex characters) challenge nonce
  const challenge = crypto.randomBytes(32).toString('hex')

  // Step 3: Issue resolve request to static/danmu/play.php?resolve=1
  const resolveEndpoint = `${baseUrl}/static/danmu/play.php?resolve=1`
  assertPublicHttpUrl(resolveEndpoint)

  const postHeaders: Record<string, string> = {
    'User-Agent': config.defaultUserAgent,
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    Origin: baseUrl,
    Referer: playPageUrl,
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
  }

  const postRes = await fetchPublic(
    resolveEndpoint,
    {
      method: 'POST',
      headers: postHeaders,
      body: new URLSearchParams({ token, challenge }).toString(),
    },
    { timeoutMs: 8_000 },
  )

  if (!postRes.ok) {
    throw new Error(`Bimi 播放凭证兑换失败: HTTP ${postRes.status}`)
  }

  const json = (await postRes.json()) as BimiResolveResponse
  if (json.code !== 1 || !json.data) {
    throw new Error(`Bimi 播放解析失败: ${json.msg || '源站未能返回有效数据'}`)
  }

  // Step 4: AES-256-GCM symmetric decryption with HMAC-SHA256 derived key
  const { iv, ciphertext, tag } = json.data
  if (!iv || !ciphertext || !tag) {
    throw new Error('Bimi 返回的加密数据包格式不完整')
  }

  const ivBuf = Buffer.from(iv, 'base64')
  const ctBuf = Buffer.from(ciphertext, 'base64')
  const tagBuf = Buffer.from(tag, 'base64')
  const aad = Buffer.from(`bimi-response-v1|${challenge}`, 'utf8')

  const derivedKey = crypto
    .createHmac('sha256', Buffer.from(token, 'utf8'))
    .update(aad)
    .digest()

  let decryptedJsonStr: string
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, ivBuf)
    decipher.setAAD(aad)
    decipher.setAuthTag(tagBuf)
    const decryptedBuf = Buffer.concat([decipher.update(ctBuf), decipher.final()])
    decryptedJsonStr = decryptedBuf.toString('utf8')
  } catch (err) {
    throw new Error(`Bimi 数据解密失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  let playData: { url?: string; id?: number | string; sid?: number; nid?: number }
  try {
    playData = JSON.parse(decryptedJsonStr)
  } catch {
    throw new Error('Bimi 解密后的播放数据无法解析为 JSON')
  }

  if (!playData.url || typeof playData.url !== 'string') {
    throw new Error('Bimi 解密数据中缺少播放直链 (url)')
  }

  const directUrl = playData.url.trim()
  const isHls = directUrl.includes('.m3u8')
  const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(directUrl)}`

  return {
    playUrl: directUrl,
    proxyUrl,
    format: isHls ? 'hls' : 'mp4',
    contentType: isHls ? 'application/vnd.apple.mpegurl' : 'video/mp4',
    requiresProxy: false,
    diagnostics: [`成功解析 Bimi 直链: ${directUrl}`],
  }
}
