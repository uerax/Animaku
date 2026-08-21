/**
 * xifan-next (next.xifanacg.com) adapter.
 *
 * Architecture:
 * - Frontend: Next.js 15+ App Router SPA (next.xifanacg.com)
 * - Backend: Supabase BaaS (rzmsnqblptbceicadbyd.supabase.co)
 * - Search: POST /rest/v1/rpc/suggest_animes (fallback to animes table ilike)
 * - Chapters: Parse Next.js SSR multi-sources RSC payload (fallback to REST episodes table)
 * - Playback: POST /functions/v1/issue-web-playback (action: fallback -> high-bitrate direct stream)
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
import { fetchPublic } from './private-host'

const DEFAULT_SUPABASE_URL = 'https://rzmsnqblptbceicadbyd.supabase.co'
const DEFAULT_PUBLISHABLE_KEY =
  'sb_publishable_aCb7uwyLN6H-sMjze4dRGA_2MDuROLF'

let cachedKey = DEFAULT_PUBLISHABLE_KEY
let keyLastRefreshedAt = 0

export function isXifanNextRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'xifan-next' || name === 'xifan_next' || name === 'xifannext') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return (
    base.includes('next.xifanacg.com') ||
    base.includes('rzmsnqblptbceicadbyd.supabase.co')
  )
}

function getHeaders(customKey?: string): Record<string, string> {
  const key = customKey || cachedKey
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    'x-region': 'ap-southeast-1',
    'User-Agent': config.defaultUserAgent,
  }
}

/**
 * Auto-recover publishable key from next.xifanacg.com JS chunks if Supabase returns 401/403.
 */
async function refreshPublishableKey(): Promise<string> {
  const now = Date.now()
  if (now - keyLastRefreshedAt < 60_000 && cachedKey !== DEFAULT_PUBLISHABLE_KEY) {
    return cachedKey
  }
  keyLastRefreshedAt = now

  try {
    const homeRes = await fetchPublic(
      'https://next.xifanacg.com',
      {
        headers: { 'User-Agent': config.defaultUserAgent },
      },
      { timeoutMs: 5_000 },
    )
    if (!homeRes.ok) return cachedKey
    const html = await homeRes.text()

    const chunkPaths = [
      ...html.matchAll(/src=["'](\/_next\/static\/chunks\/[^"']+\.js)["']/g),
    ].map((m) => m[1])

    // Concurrently probe up to 6 JS chunks to quickly extract publishable key
    const targets = chunkPaths.slice(0, 6)
    const results = await Promise.allSettled(
      targets.map(async (chunkPath) => {
        const chunkRes = await fetchPublic(
          `https://next.xifanacg.com${chunkPath}`,
          { headers: { 'User-Agent': config.defaultUserAgent } },
          { timeoutMs: 4_000 },
        )
        if (!chunkRes.ok) return null
        const chunkText = await chunkRes.text()
        const match = chunkText.match(/sb_publishable_[A-Za-z0-9_-]+/)
        return match ? match[0] : null
      }),
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        cachedKey = r.value
        return cachedKey
      }
    }
  } catch {
    /* ignore refresh failure */
  }
  return cachedKey
}

async function fetchSupabaseJson<T>(
  endpoint: string,
  options: {
    method?: string
    body?: unknown
    timeoutMs?: number
    headers?: Record<string, string>
  } = {},
): Promise<T> {
  let url = `${DEFAULT_SUPABASE_URL}${endpoint}`
  if (endpoint.startsWith('/functions/v1/')) {
    const separator = url.includes('?') ? '&' : '?'
    if (!url.includes('forceFunctionRegion=')) {
      url = `${url}${separator}forceFunctionRegion=ap-southeast-1`
    }
  }
  const method = options.method || (options.body ? 'POST' : 'GET')
  const timeoutMs = options.timeoutMs ?? 10_000

  let res = await fetchPublic(
    url,
    {
      method,
      headers: {
        ...getHeaders(),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    { timeoutMs },
  )

  if (res.status === 401 || res.status === 403) {
    const newKey = await refreshPublishableKey()
    res = await fetchPublic(
      url,
      {
        method,
        headers: {
          ...getHeaders(newKey),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
      { timeoutMs },
    )
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(
      `稀饭Next接口异常 (${res.status}): ${errorText.slice(0, 150) || res.statusText}`,
    )
  }

  return (await res.json()) as T
}

interface SuggestAnimeItem {
  id: number
  title: string
  title_original?: string
  cover_url?: string
  bangumi_score?: number
  release_year?: number
}

interface EpisodeItem {
  id: number
  anime_id?: number
  episode_number?: number
  title?: string
  kind?: string
}

interface SourceLineItem {
  id?: number
  code?: string
  name?: string
  episodes?: EpisodeItem[]
}

interface PlaybackResponse {
  ok: boolean
  action?: string
  episode_id?: number
  anime_id?: number
  url?: string
  error?: string
}

export async function searchXifanNext(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const q = keyword.trim()
  if (!q) {
    return { pluginName: rule.name, items: [], diagnostics: ['缺少搜索关键词'] }
  }

  const diagnostics: string[] = []
  let items: SearchItem[] = []

  // 1. Primary search via suggest_animes RPC
  try {
    const res = await fetchSupabaseJson<SuggestAnimeItem[]>(
      '/rest/v1/rpc/suggest_animes',
      {
        method: 'POST',
        body: { q, lim: 12 },
      },
    )
    if (Array.isArray(res) && res.length > 0) {
      items = res.map((a) => ({
        name: a.title || a.title_original || `番剧 #${a.id}`,
        src: `https://next.xifanacg.com/anime/${a.id}`,
      }))
      diagnostics.push(`suggest_animes 命中 ${items.length} 条`)
    }
  } catch (e) {
    diagnostics.push(`RPC 搜索异常: ${(e as Error).message}`)
  }

  // 2. Fallback search via animes table ilike
  if (items.length === 0) {
    try {
      const encoded = encodeURIComponent(`*${q}*`)
      const res = await fetchSupabaseJson<SuggestAnimeItem[]>(
        `/rest/v1/animes?or=(title.ilike.${encoded},search_title.ilike.${encoded},title_original.ilike.${encoded})&select=id,title,title_original&limit=10`,
      )
      if (Array.isArray(res) && res.length > 0) {
        items = res.map((a) => ({
          name: a.title || a.title_original || `番剧 #${a.id}`,
          src: `https://next.xifanacg.com/anime/${a.id}`,
        }))
        diagnostics.push(`animes 表模糊搜索回退命中 ${items.length} 条`)
      }
    } catch (e) {
      diagnostics.push(`表搜索异常: ${(e as Error).message}`)
    }
  }

  if (items.length === 0) {
    diagnostics.push('未找到相关番剧，可尝试别名或简写关键词')
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics,
  }
}

function extractAnimeId(source: string): number | null {
  const trimmed = source.trim()
  const directMatch = trimmed.match(/\/anime\/(\d+)/i)
  if (directMatch) return Number(directMatch[1])
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return null
}

/**
 * Extract Next.js streaming RSC chunks (self.__next_f.push) from HTML.
 */
function extractNextFPushes(html: string): string[] {
  const chunks: string[] = []
  let pos = 0
  const token = 'self.__next_f.push(['
  while ((pos = html.indexOf(token, pos)) !== -1) {
    const start = pos + token.length - 1
    let depth = 0
    let inStr = false
    let esc = false
    let quote = ''
    let end = -1
    for (let i = start; i < html.length; i++) {
      const ch = html[i]
      if (inStr) {
        if (esc) {
          esc = false
          continue
        }
        if (ch === '\\') {
          esc = true
          continue
        }
        if (ch === quote) {
          inStr = false
          continue
        }
        continue
      }
      if (ch === '"' || ch === "'") {
        inStr = true
        quote = ch
        continue
      }
      if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    if (end > 0) {
      try {
        const parsed = JSON.parse(html.slice(start, end)) as unknown
        if (Array.isArray(parsed) && typeof parsed[1] === 'string') {
          chunks.push(parsed[1])
        }
      } catch {
        /* ignore malformed chunk */
      }
      pos = end
    } else {
      pos += token.length
    }
  }
  return chunks
}

/**
 * Extract full multi-source lines from Next.js SSR HTML.
 */
function extractSourcesFromHtml(html: string): SourceLineItem[] | null {
  const chunks = extractNextFPushes(html)
  for (const chunkStr of chunks) {
    const idx = chunkStr.indexOf('"sources":[')
    if (idx >= 0) {
      let depth = 0
      let inStr = false
      let esc = false
      let end = -1
      const start = idx + 10
      for (let i = start; i < chunkStr.length; i++) {
        const ch = chunkStr[i]
        if (inStr) {
          if (esc) {
            esc = false
            continue
          }
          if (ch === '\\') {
            esc = true
            continue
          }
          if (ch === '"') {
            inStr = false
            continue
          }
          continue
        }
        if (ch === '"') {
          inStr = true
          continue
        }
        if (ch === '[') depth++
        else if (ch === ']') {
          depth--
          if (depth === 0) {
            end = i + 1
            break
          }
        }
      }
      if (end > 0) {
        try {
          return JSON.parse(chunkStr.slice(start, end)) as SourceLineItem[]
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null
}

export async function chaptersXifanNext(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const diagnostics: string[] = []
  const animeId = extractAnimeId(source)
  if (!animeId) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: [`无法从链接解析番剧 ID: ${source}`],
    }
  }

  // 1. Primary: fetch anime detail page HTML and parse full multi-source roads
  try {
    const pageUrl = `https://next.xifanacg.com/anime/${animeId}`
    const htmlRes = await fetchPublic(
      pageUrl,
      {
        headers: { 'User-Agent': config.defaultUserAgent },
      },
      { timeoutMs: 8_000 },
    )
    if (htmlRes.ok) {
      const html = await htmlRes.text()
      const sources = extractSourcesFromHtml(html)
      if (Array.isArray(sources) && sources.length > 0) {
        const roads: Road[] = []
        for (const s of sources) {
          const episodes = s.episodes || []
          if (!episodes.length) continue
          const roadName = (s.name || s.code || `线路${roads.length + 1}`).trim()
          const data = episodes.map(
            (e) =>
              `https://next.xifanacg.com/anime/${animeId}/play/${e.id}?source=${encodeURIComponent(s.code || '')}`,
          )
          const identifier = episodes.map(
            (e) => (e.title || `第${e.episode_number ?? 1}集`).trim(),
          )
          roads.push({
            name: roadName,
            data,
            identifier,
          })
        }
        if (roads.length > 0) {
          diagnostics.push(
            `页面解析成功: ${roads.length} 条线路，共 ${roads.reduce((acc, r) => acc + r.data.length, 0)} 集`,
          )
          return {
            pluginName: rule.name,
            roads,
            diagnostics,
          }
        }
      }
    }
  } catch (e) {
    diagnostics.push(`SSR 页面线路解析异常: ${(e as Error).message}`)
  }

  // 2. Fallback: query Supabase REST episodes table
  try {
    const rawEpisodes = await fetchSupabaseJson<EpisodeItem[]>(
      `/rest/v1/episodes?anime_id=eq.${animeId}&select=id,title,episode_number,kind&order=episode_number.asc`,
    )
    if (Array.isArray(rawEpisodes) && rawEpisodes.length > 0) {
      const mainEps = rawEpisodes.filter((e) => !e.kind || e.kind === 'main')
      const spEps = rawEpisodes.filter((e) => e.kind && e.kind !== 'main')
      const roads: Road[] = []

      if (mainEps.length > 0) {
        roads.push({
          name: '稀饭新番主线',
          data: mainEps.map(
            (e) => `https://next.xifanacg.com/anime/${animeId}/play/${e.id}`,
          ),
          identifier: mainEps.map((e) => (e.title || `第${e.episode_number}集`).trim()),
        })
      }
      if (spEps.length > 0) {
        roads.push({
          name: 'SP / 特典',
          data: spEps.map(
            (e) => `https://next.xifanacg.com/anime/${animeId}/play/${e.id}`,
          ),
          identifier: spEps.map((e) => (e.title || `SP ${e.episode_number}`).trim()),
        })
      }
      if (roads.length === 0) {
        roads.push({
          name: '稀饭新番主线',
          data: rawEpisodes.map(
            (e) => `https://next.xifanacg.com/anime/${animeId}/play/${e.id}`,
          ),
          identifier: rawEpisodes.map((e) => (e.title || `第${e.episode_number}集`).trim()),
        })
      }

      diagnostics.push(`回退至 REST 表: ${roads.length} 条线路，共 ${rawEpisodes.length} 集`)
      return {
        pluginName: rule.name,
        roads,
        diagnostics,
      }
    }
  } catch (e) {
    diagnostics.push(`REST 分集查询异常: ${(e as Error).message}`)
  }

  return {
    pluginName: rule.name,
    roads: [],
    diagnostics: diagnostics.length ? diagnostics : ['未查询到可用分集数据'],
  }
}

function extractEpisodeIdAndSource(pageUrl: string): {
  episodeId: number | null
  sourceCode: string
} {
  const trimmed = pageUrl.trim()
  let episodeId: number | null = null
  let sourceCode = ''

  try {
    const u = new URL(trimmed)
    sourceCode = u.searchParams.get('source') || ''
    const match = u.pathname.match(/\/play\/(\d+)/i)
    if (match) episodeId = Number(match[1])
  } catch {
    const playMatch = trimmed.match(/\/play\/(\d+)/i)
    if (playMatch) episodeId = Number(playMatch[1])
    const srcMatch = trimmed.match(/[?&]source=([^&]+)/i)
    if (srcMatch) sourceCode = decodeURIComponent(srcMatch[1])
  }

  if (!episodeId) {
    const queryMatch = trimmed.match(/[?&]episode_?id=(\d+)/i)
    if (queryMatch) episodeId = Number(queryMatch[1])
  }
  if (!episodeId && /^\d+$/.test(trimmed)) {
    episodeId = Number(trimmed)
  }

  return { episodeId, sourceCode }
}

/**
 * Extract highest available resolution/bitrate (e.g. 1080P -> 720P -> max available) sub-playlist URL from master m3u8.
 * This locks playback to the best available rendition and prevents player ABR from automatically degrading to 480P/360P.
 */
async function extractHighestResolutionHls(masterUrl: string): Promise<string> {
  try {
    const res = await fetchPublic(
      masterUrl,
      {
        headers: {
          'User-Agent': config.defaultUserAgent,
        },
      },
      { timeoutMs: 3_000 },
    )
    if (!res.ok) return masterUrl
    const m3u8Text = await res.text()
    if (!m3u8Text.includes('#EXT-X-STREAM-INF')) return masterUrl

    const lines = m3u8Text.split('\n')
    let highestUrl = ''
    let maxScore = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        let score = 0
        const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i)
        if (resMatch) {
          score = Number(resMatch[1]) * Number(resMatch[2])
        } else {
          const bwMatch = line.match(/BANDWIDTH=(\d+)/i)
          if (bwMatch) {
            score = Number(bwMatch[1])
          }
        }
        const nextUrl = lines[i + 1]?.trim()
        if (score > maxScore && nextUrl && !nextUrl.startsWith('#')) {
          maxScore = score
          highestUrl = nextUrl.startsWith('http')
            ? nextUrl
            : new URL(nextUrl, masterUrl).href
        }
      }
    }

    return highestUrl || masterUrl
  } catch {
    return masterUrl
  }
}

export async function resolveXifanNext(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const { episodeId, sourceCode } = extractEpisodeIdAndSource(pageUrl)
  if (!episodeId) {
    throw new Error(`无法从播放链接提取分集 ID: ${pageUrl}`)
  }

  let playUrl = ''
  let playbackAction = ''

  const fbBody: Record<string, unknown> = {
    action: 'fallback',
    episode_id: episodeId,
  }
  if (sourceCode) {
    fbBody.source = sourceCode
  }

  // Concurrently dispatch requests to Supabase (ap-southeast-1 region)
  const hlsPromise = fetchSupabaseJson<PlaybackResponse>(
    '/functions/v1/issue-web-playback',
    {
      method: 'POST',
      body: {
        action: 'hls',
        episode_id: episodeId,
      },
      timeoutMs: 4_000,
    },
  ).catch((e) => ({ ok: false as const, error: (e as Error).message }))

  const fbPromise = fetchSupabaseJson<PlaybackResponse>(
    '/functions/v1/issue-web-playback',
    {
      method: 'POST',
      body: fbBody,
      timeoutMs: 4_000,
    },
  ).catch((e) => ({ ok: false as const, error: (e as Error).message }))

  // Priority-aware race with 2.0s grace window:
  // 1. If domestic 1080P MP4 (fallback) succeeds within 2000ms, immediately pick it
  const fbEarlyResult = await Promise.race([
    fbPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
  ])

  if (fbEarlyResult && 'ok' in fbEarlyResult && fbEarlyResult.ok && fbEarlyResult.url) {
    playUrl = fbEarlyResult.url
    playbackAction = fbEarlyResult.action || 'fallback'
  } else {
    // 2. If fallback timed out or failed, check HLS immediately without blocking
    const hlsResult = await hlsPromise
    if (hlsResult && 'ok' in hlsResult && hlsResult.ok && hlsResult.url) {
      const masterHlsUrl = hlsResult.url
      const highResHlsUrl = await extractHighestResolutionHls(masterHlsUrl)
      playUrl = highResHlsUrl
      playbackAction = 'hls-1080p'
    } else {
      // 3. HLS not available or failed; await remaining fallback as last resort
      const fbLateResult = await fbPromise
      if (fbLateResult && 'ok' in fbLateResult && fbLateResult.ok && fbLateResult.url) {
        playUrl = fbLateResult.url
        playbackAction = fbLateResult.action || 'fallback'
      } else {
        const errorMsg =
          ('error' in fbLateResult && fbLateResult.error ? fbLateResult.error : null) ||
          ('error' in hlsResult && hlsResult.error ? hlsResult.error : null) ||
          '未能生成有效播放直链'
        throw new Error(`稀饭Next解析失败: ${errorMsg}`)
      }
    }
  }

  // pan.wo.cn rejects cross-origin referers with 400 Bad Request; use pan.wo.cn or empty
  const isWoPan =
    playUrl.includes('pan.wo.cn') ||
    playUrl.includes('moedot.net') ||
    playUrl.includes('apn.moedot.net')
  const referer = isWoPan ? 'https://pan.wo.cn/' : 'https://next.xifanacg.com/'
  const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(playUrl)}&referer=${encodeURIComponent(referer)}`

  return {
    playUrl,
    proxyUrl,
    referer,
    headers: {
      'User-Agent': rule.userAgent || config.defaultUserAgent,
      Referer: referer,
    },
    diagnostics: [
      playbackAction.startsWith('hls')
        ? `成功解析 HLS 1080P 专线切片流: ${playUrl}`
        : `成功解析 1080P 国内原画直链 (${playbackAction}): ${playUrl}`,
    ],
  }
}
