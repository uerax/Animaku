/**
 * huazidm.com (花子动漫) dedicated adapter.
 *
 * Architecture:
 * - Frontend: Vite + React SPA (huazidm.com)
 * - Backend: RESTful JSON API (Nginx / Node / Go)
 * - Search: GET /api/videos?q={keyword} (Public & bypasses frontend slide captcha gate)
 * - Chapters: GET /api/videos/{vodId} (Public)
 * - Play Resolution: POST /api/play/resolve with { url: "hz1.*", sourceCode: "..." }
 * - Media: High-bitrate 1080P MP4 / HLS direct streams (Akamai, BytePlus, Tencent, etc.)
 *   - 100% Zero-proxy browser direct stream compliant (Zero Egress Bandwidth)
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

export const HUAZI_BASE_URL = 'https://www.huazidm.com'

export function isHuaziRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (
    name === 'huazi' ||
    name === 'huazidm' ||
    name === 'huazi_dm' ||
    name === '花子' ||
    name === '花子动漫'
  ) {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return (
    base.includes('huazidm.com') ||
    base.includes('huazidm')
  )
}

function getBaseHeaders(referer: string = `${HUAZI_BASE_URL}/`): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer,
    Origin: HUAZI_BASE_URL,
  }
}

interface HuaziSearchResponse {
  list?: Array<{
    vodId: number
    vodName: string
    vodPic?: string
    vodRemarks?: string
    vodBgmId?: number
    vodYear?: string
    vodScore?: string
  }>
  total?: number
}

interface HuaziDetailResponse {
  data?: {
    vodId: number
    vodName: string
    vodPic?: string
    vodRemarks?: string
    vodContent?: string
    vodCopyright?: number
    playSources?: Array<{
      sourceCode: string
      sourceName: string
      episodes?: Array<{
        name: string
        url: string
      }>
    }>
  }
  playSources?: Array<{
    sourceCode: string
    sourceName: string
    episodes?: Array<{
      name: string
      url: string
    }>
  }>
}

interface HuaziResolveResponse {
  ok?: boolean
  kind?: string
  playUrl?: string
  sourceCode?: string
  message?: string
  copyright?: boolean
  code?: string | number
  headers?: Record<string, string>
}

/**
 * 1. 搜索链路 (Search)
 * 调用免验证码聚合列表检索端点 /api/videos?q={keyword}
 */
export async function searchHuazi(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const items: SearchItem[] = []
  const diagnostics: string[] = []

  try {
    const searchUrl = `${HUAZI_BASE_URL}/api/videos?q=${encodeURIComponent(trimmed)}`
    assertPublicHttpUrl(searchUrl)

    const res = await fetchPublic(
      searchUrl,
      { headers: getBaseHeaders(`${HUAZI_BASE_URL}/`) },
      { timeoutMs: 10_000, source: 'huazi' },
    )

    if (res.ok) {
      const data = (await res.json()) as HuaziSearchResponse
      const list = data.list || []
      for (const item of list) {
        if (!item.vodId || !item.vodName) continue
        const title = item.vodName.trim()
        if (!title) continue

        items.push({
          name: title,
          src: `${HUAZI_BASE_URL}/anime/${item.vodId}`,
          cover: item.vodPic || undefined,
        })
      }
    } else {
      diagnostics.push(`花子动漫搜索上游响应异常 (HTTP ${res.status})`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    diagnostics.push(`花子动漫搜索请求失败: ${msg}`)
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics: diagnostics.length ? diagnostics : undefined,
  }
}

/**
 * 2. 分集与线路链路 (Chapters)
 * 请求 /api/videos/{vodId} 提取全线路分集列表
 */
export async function chaptersHuazi(
  rule: PluginRule,
  sourceUrlOrId: string,
): Promise<PluginChapterResult> {
  let vodId = ''
  try {
    const u = new URL(sourceUrlOrId)
    const match = u.pathname.match(/\/(?:anime|videos?|detail)\/(\d+)/i)
    if (match) {
      vodId = match[1]
    } else {
      const qId = u.searchParams.get('id') || u.searchParams.get('vodId')
      if (qId && /^\d+$/.test(qId)) {
        vodId = qId
      }
    }
  } catch {
    const match = sourceUrlOrId.match(/(?:\b|\/)(\d+)(?:\.html|\b|\/|$)/)
    if (match) {
      vodId = match[1]
    }
  }

  if (!vodId && /^\d+$/.test(sourceUrlOrId.trim())) {
    vodId = sourceUrlOrId.trim()
  }

  if (!vodId) {
    throw new Error(`无法从参数提取花子动漫番剧 ID: ${sourceUrlOrId}`)
  }

  const detailUrl = `${HUAZI_BASE_URL}/api/videos/${vodId}`
  assertPublicHttpUrl(detailUrl)

  const res = await fetchPublic(
    detailUrl,
    { headers: getBaseHeaders(`${HUAZI_BASE_URL}/anime/${vodId}`) },
    { timeoutMs: 10_000, source: 'huazi' },
  )

  if (!res.ok) {
    throw new Error(`花子动漫详情接口请求失败 (HTTP ${res.status})`)
  }

  const json = (await res.json()) as HuaziDetailResponse
  const data = json.data || json
  const playSources = data.playSources || []

  if (!playSources.length) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: ['花子动漫未返回任何有效播放线路'],
    }
  }

  const roads: Road[] = []
  for (const src of playSources) {
    const sourceCode = src.sourceCode || ''
    const sourceName = src.sourceName || sourceCode || '默认线路'
    const episodes = src.episodes || []
    if (!episodes.length) continue

    const identifiers: string[] = []
    const data: string[] = []

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i]
      identifiers.push(ep.name || `第 ${i + 1} 集`)
      const encodedUrl = encodeURIComponent(ep.url || '')
      const encodedCode = encodeURIComponent(sourceCode)
      data.push(`${HUAZI_BASE_URL}/play/${vodId}?source=${encodedCode}&url=${encodedUrl}`)
    }

    roads.push({
      name: sourceName,
      data,
      identifier: identifiers,
    })
  }

  return {
    pluginName: rule.name,
    roads,
  }
}

/**
 * 3. 播放直链解析链路 (Resolve)
 * 向 /api/play/resolve 提交加密的集数标识与线路代码获取直链
 */
export async function resolveHuazi(
  _rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  let targetUrl = ''
  let sourceCode = ''

  try {
    if (pageUrl.startsWith('{') && pageUrl.endsWith('}')) {
      const parsed = JSON.parse(pageUrl)
      targetUrl = parsed.url || ''
      sourceCode = parsed.sourceCode || parsed.source || ''
    } else {
      const u = new URL(pageUrl)
      targetUrl = u.searchParams.get('url') || ''
      sourceCode = u.searchParams.get('source') || u.searchParams.get('sourceCode') || ''
    }
  } catch {
    // Fallback: 如果直接传入了 hz1. 开头的加密串
    if (pageUrl.includes('hz1.')) {
      const match = pageUrl.match(/(hz1\.[a-zA-Z0-9_-]+)/)
      if (match) targetUrl = match[1]
    }
  }

  if (!targetUrl) {
    throw new Error(`无法从参数提取花子动漫加密播放凭据: ${pageUrl}`)
  }

  const resolveApiUrl = `${HUAZI_BASE_URL}/api/play/resolve`
  assertPublicHttpUrl(resolveApiUrl)

  const res = await fetchPublic(
    resolveApiUrl,
    {
      method: 'POST',
      headers: {
        ...getBaseHeaders(`${HUAZI_BASE_URL}/`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        sourceCode: sourceCode || undefined,
      }),
    },
    { timeoutMs: 10_000, source: 'huazi' },
  )

  if (!res.ok) {
    throw new Error(`花子动漫解析接口响应异常 (HTTP ${res.status})`)
  }

  const result = (await res.json()) as HuaziResolveResponse

  if (result.copyright === true || result.message === '该内容已下架') {
    throw new Error(`花子动漫：该内容已下架 (${result.message || '版权保护'})`)
  }

  if (!result.ok || !result.playUrl) {
    throw new Error(`花子动漫解析失败: ${result.message || '源站未返回播放直链'}`)
  }

  let finalPlayUrl = result.playUrl.trim()
  // 避免浏览器在全站 HTTPS 环境下发生 Mixed Content 阻断
  if (finalPlayUrl.startsWith('http://')) {
    // 针对常见知名 CDN 域名自动无损升级为 https://
    finalPlayUrl = finalPlayUrl.replace(/^http:\/\//i, 'https://')
  }

  const isHls =
    result.kind === 'hls' ||
    finalPlayUrl.includes('.m3u8') ||
    finalPlayUrl.includes('m3u8')
  const format: 'hls' | 'mp4' = isHls ? 'hls' : 'mp4'
  const referer = `${HUAZI_BASE_URL}/`
  const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(finalPlayUrl)}&referer=${encodeURIComponent(referer)}`

  return {
    playUrl: finalPlayUrl,
    proxyUrl,
    referer,
    format,
    headers: result.headers,
    diagnostics: [
      `成功解析花子动漫线路 (${sourceCode || '默认'}): ${finalPlayUrl}`,
    ],
  }
}
