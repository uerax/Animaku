/**
 * cycani.org (次元城动画) dedicated adapter.
 *
 * Architecture:
 * - Frontend: Vite + React SPA (cycani.org)
 * - Backend: Go/Gin RESTful JSON API
 * - Search: GET /api/videos/search?q={keyword}&page=1&page_size=24 (Public)
 * - Detail: GET /api/videos/{video_id} (Public)
 * - Chapters: GET /api/videos/{video_id}/sections?player_code={code} (Public)
 * - Playback: GET /api/v2/sections/{section_id}/play-url (Requires Bearer JWT)
 * - Media: High-bitrate 1080P MP4 direct stream hosted on Cloudflare CDN (supports Accept-Ranges)
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

const CYCANI_BASE_URL = 'https://www.cycani.org'

// Embedded credentials for automatic token issuance and self-healing
const CYCANI_USERNAME = 'animaku'
const CYCANI_PASSWORD = 'sxii8BX2VgfRIL'

let cachedBearerToken = ''
let tokenExpiresAt = 0
let isRefreshingToken = false

export function isCycaniRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'cycani' || name === 'cyc' || name === 'cycweb' || name === 'cyc_web') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return (
    base.includes('cycani.org') ||
    base.includes('cycani.com') ||
    base.includes('cycr2.top')
  )
}

function getBaseHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'X-App-Name': 'cyc_web',
    'X-App-Version': 'cycweb',
    'X-Time-Zone': 'Asia/Shanghai',
  }
  const activeToken = token || cachedBearerToken
  if (activeToken) {
    headers.Authorization = activeToken.startsWith('Bearer ')
      ? activeToken
      : `Bearer ${activeToken}`
  }
  return headers
}

interface LoginResponse {
  code: number
  msg?: string
  data?: {
    token: string
    expires_at?: string
    user?: {
      id: number
      username: string
    }
  }
}

/**
 * Ensure a valid Bearer Token for playback authorization.
 * Handles automatic login and token expiration caching.
 */
async function ensureValidToken(forceRefresh = false): Promise<string> {
  const now = Date.now()
  if (
    !forceRefresh &&
    cachedBearerToken &&
    tokenExpiresAt > now + 30 * 60 * 1000 // At least 30 minutes before expiration
  ) {
    return cachedBearerToken
  }

  // Prevent multiple concurrent login requests
  if (isRefreshingToken) {
    while (isRefreshingToken) {
      await new Promise((r) => setTimeout(r, 100))
    }
    if (cachedBearerToken && tokenExpiresAt > Date.now()) {
      return cachedBearerToken
    }
  }

  isRefreshingToken = true
  try {
    const loginUrl = `${CYCANI_BASE_URL}/api/auth/login`
    assertPublicHttpUrl(loginUrl, 'CYCani Login')

    const res = await fetchPublic(
      loginUrl,
      {
        method: 'POST',
        headers: {
          ...getBaseHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: CYCANI_USERNAME,
          password: CYCANI_PASSWORD,
        }),
      },
      { timeoutMs: 8_000 },
    )

    if (!res.ok) {
      throw new Error(`登录接口返回 HTTP ${res.status}`)
    }

    const data = (await res.json()) as LoginResponse
    if (data.code !== 0 || !data.data?.token) {
      throw new Error(`登录失败: ${data.msg || '未知错误'}`)
    }

    const rawToken = data.data.token.trim()
    cachedBearerToken = rawToken.startsWith('Bearer ')
      ? rawToken
      : `Bearer ${rawToken}`

    if (data.data.expires_at) {
      const parsedTime = Date.parse(data.data.expires_at)
      tokenExpiresAt = Number.isNaN(parsedTime)
        ? now + 6 * 24 * 3600 * 1000
        : parsedTime
    } else {
      tokenExpiresAt = now + 6 * 24 * 3600 * 1000 // Default to 6 days
    }

    return cachedBearerToken
  } finally {
    isRefreshingToken = false
  }
}

interface SearchResponse {
  code: number
  msg?: string
  data?: {
    list?: Array<{
      video_id: number
      title: string
      description?: string
      cover_url?: string
      remarks?: string
      year?: number
    }>
    pager?: {
      page: number
      page_size: number
      total: number
    }
  }
}

export async function searchCycani(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const q = keyword.trim()
  if (!q) {
    return { pluginName: rule.name, items: [], diagnostics: ['缺少搜索关键词'] }
  }

  const diagnostics: string[] = []
  const searchUrl = `${CYCANI_BASE_URL}/api/videos/search?q=${encodeURIComponent(q)}&page=1&page_size=24`
  assertPublicHttpUrl(searchUrl, 'CYCani Search')

  try {
    const res = await fetchPublic(
      searchUrl,
      {
        method: 'GET',
        headers: getBaseHeaders(),
      },
      { timeoutMs: 10_000 },
    )

    if (!res.ok) {
      return {
        pluginName: rule.name,
        items: [],
        diagnostics: [`搜索接口 HTTP ${res.status}`],
      }
    }

    const json = (await res.json()) as SearchResponse
    if (json.code !== 0) {
      return {
        pluginName: rule.name,
        items: [],
        diagnostics: [`搜索失败: ${json.msg || '异常代码'}`],
      }
    }

    const list = json.data?.list || []
    const items: SearchItem[] = list.map((item) => ({
      name: item.title?.trim() || `番剧 #${item.video_id}`,
      src: `${CYCANI_BASE_URL}/videos/${item.video_id}`,
    }))

    diagnostics.push(`搜索成功: 命中 ${items.length} 部番剧`)
    return {
      pluginName: rule.name,
      items,
      diagnostics,
    }
  } catch (e) {
    return {
      pluginName: rule.name,
      items: [],
      diagnostics: [e instanceof Error ? e.message : String(e)],
    }
  }
}

function extractVideoId(source: string): number | null {
  const trimmed = source.trim()
  const match =
    trimmed.match(/\/videos\/(\d+)/i) ||
    trimmed.match(/\/play\/(\d+)/i) ||
    trimmed.match(/\/anime\/(\d+)/i)
  if (match) return Number(match[1])
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return null
}

interface VideoDetailResponse {
  code: number
  msg?: string
  data?: {
    id: number
    title: string
    play_from?: Array<{
      code: string
      title: string
      count?: number
    }>
  }
}

interface VideoSectionsResponse {
  code: number
  msg?: string
  data?: {
    list?: Array<{
      id: number
      title: string
    }>
    pager?: {
      total: number
    }
  }
}

export async function chaptersCycani(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const diagnostics: string[] = []
  const videoId = extractVideoId(source)
  if (!videoId) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: [`无法从链接解析番剧 ID: ${source}`],
    }
  }

  try {
    // 1. Fetch video detail to get player lines (play_from)
    const detailUrl = `${CYCANI_BASE_URL}/api/videos/${videoId}`
    assertPublicHttpUrl(detailUrl, 'CYCani Detail')

    const detailRes = await fetchPublic(
      detailUrl,
      {
        method: 'GET',
        headers: getBaseHeaders(),
      },
      { timeoutMs: 8_000 },
    )

    if (!detailRes.ok) {
      return {
        pluginName: rule.name,
        roads: [],
        diagnostics: [`番剧详情接口 HTTP ${detailRes.status}`],
      }
    }

    const detailJson = (await detailRes.json()) as VideoDetailResponse
    if (detailJson.code !== 0 || !detailJson.data) {
      return {
        pluginName: rule.name,
        roads: [],
        diagnostics: [`番剧详情获取失败: ${detailJson.msg || '番剧不存在'}`],
      }
    }

    const playFromList =
      detailJson.data.play_from && detailJson.data.play_from.length > 0
        ? detailJson.data.play_from
        : [{ code: 'cychub', title: 'CYC_Main' }]

    // 2. Concurrently fetch episode sections for each player line
    const roads: Road[] = []
    await Promise.all(
      playFromList.map(async (line, idx) => {
        try {
          const code = line.code.trim() || 'cychub'
          const sectionsUrl = `${CYCANI_BASE_URL}/api/videos/${videoId}/sections?player_code=${encodeURIComponent(code)}&page=1&page_size=100`
          assertPublicHttpUrl(sectionsUrl, 'CYCani Sections')

          const sectionsRes = await fetchPublic(
            sectionsUrl,
            {
              method: 'GET',
              headers: getBaseHeaders(),
            },
            { timeoutMs: 8_000 },
          )

          if (!sectionsRes.ok) return

          const sectionsJson = (await sectionsRes.json()) as VideoSectionsResponse
          const epList = sectionsJson.data?.list || []
          if (!epList.length) return

          const roadName = (line.title || `播放线路${idx + 1}`).trim()
          const data = epList.map(
            (ep) =>
              `${CYCANI_BASE_URL}/play/${videoId}/${ep.id}?player_code=${encodeURIComponent(code)}`,
          )
          const identifier = epList.map(
            (ep, epIdx) => (ep.title || `第${epIdx + 1}集`).trim(),
          )

          roads.push({
            name: roadName,
            data,
            identifier,
          })
        } catch {
          /* ignore single road error */
        }
      }),
    )

    if (roads.length > 0) {
      // Sort roads to preserve original play_from order
      roads.sort((a, b) => {
        const idxA = playFromList.findIndex((p) => (p.title || '').trim() === a.name)
        const idxB = playFromList.findIndex((p) => (p.title || '').trim() === b.name)
        return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99)
      })

      diagnostics.push(
        `成功解析 ${roads.length} 条线路，共 ${roads.reduce((sum, r) => sum + r.data.length, 0)} 集`,
      )
      return {
        pluginName: rule.name,
        roads,
        diagnostics,
      }
    }

    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['未能获取到有效选集数据'],
    }
  } catch (e) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: [e instanceof Error ? e.message : String(e)],
    }
  }
}

function extractSectionId(pageUrl: string): number | null {
  const trimmed = pageUrl.trim()
  try {
    const u = new URL(trimmed)
    const match = u.pathname.match(/\/play\/\d+\/(\d+)/i) || u.pathname.match(/\/sections\/(\d+)/i)
    if (match) return Number(match[1])
    const qMatch = u.searchParams.get('section_id') || u.searchParams.get('id')
    if (qMatch && /^\d+$/.test(qMatch)) return Number(qMatch)
  } catch {
    const playMatch = trimmed.match(/\/play\/\d+\/(\d+)/i) || trimmed.match(/\/sections\/(\d+)/i)
    if (playMatch) return Number(playMatch[1])
  }
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return null
}

interface PlayUrlResponse {
  code: number
  msg?: string
  data?: {
    name?: string
    url?: string
  }
}

export async function resolveCycani(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const sectionId = extractSectionId(pageUrl)
  if (!sectionId) {
    throw new Error(`无法从播放链接提取选集 ID (section_id): ${pageUrl}`)
  }

  const playApiUrl = `${CYCANI_BASE_URL}/api/v2/sections/${sectionId}/play-url`
  assertPublicHttpUrl(playApiUrl, 'CYCani Play URL')

  let token = await ensureValidToken()

  let res = await fetchPublic(
    playApiUrl,
    {
      method: 'GET',
      headers: getBaseHeaders(token),
    },
    { timeoutMs: 10_000 },
  )

  // 401 Self-healing: Refresh token and retry once
  if (res.status === 401) {
    token = await ensureValidToken(true)
    res = await fetchPublic(
      playApiUrl,
      {
        method: 'GET',
        headers: getBaseHeaders(token),
      },
      { timeoutMs: 10_000 },
    )
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(
      `CYCani 解析接口返回 HTTP ${res.status}: ${errText.slice(0, 100) || res.statusText}`,
    )
  }

  const json = (await res.json()) as PlayUrlResponse
  if (json.code === 401) {
    // Retry once on business-level 401
    token = await ensureValidToken(true)
    const retryRes = await fetchPublic(
      playApiUrl,
      {
        method: 'GET',
        headers: getBaseHeaders(token),
      },
      { timeoutMs: 10_000 },
    )
    const retryJson = (await retryRes.json()) as PlayUrlResponse
    if (retryJson.code !== 0 || !retryJson.data?.url) {
      throw new Error(`CYCani 解析鉴权失败: ${retryJson.msg || '请检查账号权限'}`)
    }
    json.data = retryJson.data
  }

  if (json.code !== 0 || !json.data?.url) {
    throw new Error(`CYCani 解析失败: ${json.msg || '未能生成有效播放直链'}`)
  }

  const playUrl = json.data.url
  const referer = CYCANI_BASE_URL + '/'
  const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(playUrl)}&referer=${encodeURIComponent(referer)}`

  return {
    playUrl,
    proxyUrl,
    referer,
    headers: {
      'User-Agent': rule.userAgent || config.defaultUserAgent,
      Referer: referer,
    },
    diagnostics: [`成功解析 CYCani 直链: ${playUrl}`],
  }
}
