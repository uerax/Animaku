/**
 * neosek.ai (neosek) dedicated adapter.
 *
 * 注意 / 特殊限制说明：
 * 该站部署了地区封锁策略，明确禁用了日本地区 IP (Ban Japan IP)，
 * 请求与部署时请确保出站节点非日本 IP，否则将导致网络握手被阻断或接口返回异常。
 *
 * neosek.ai 搜索分类参数说明 (Search Category Parameter):
 * - 全部: GET https://neosek.ai/api/v1/search?q={keyword}
 *   (不传递 content_type，同时检索动画、漫画、同人志、图集等全站资源)
 * - 漫画: GET https://neosek.ai/api/v1/search?q={keyword}&content_type=manga
 *   (仅检索漫画、同人志、图集资源)
 * - 动画: GET https://neosek.ai/api/v1/search?q={keyword}&content_type=anime
 *   (本次接入所使用的参数：严格过滤非动画资源，仅检索动画番剧 TV/剧场版/OAD)
 */
import {
  extractBaseTitle,
  type PluginChapterResult,
  type PluginRule,
  type PluginSearchResult,
  type ResolvePlayResult,
  type Road,
  type SearchItem,
  type SubtitleBundle,
  type SubtitleTrack,
} from '@animaku/shared'
import { config } from '../config'
import { assertPublicHttpUrl, fetchPublic } from './private-host'

const NEOSEK_BASE_URL = 'https://neosek.ai'

export function isNeosekRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (name === 'neosek' || name === 'neosekai') {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('neosek.ai')
}

function getBaseHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : { Referer: `${NEOSEK_BASE_URL}/` }),
  }
}

interface NeosekSearchResponse {
  code?: number
  message?: string
  data?: {
    total?: number
    items?: Array<{
      id: number
      content_type?: string
      title?: string
    }>
  }
}

interface NeosekUnitsResponse {
  code?: number
  message?: string
  data?: {
    items?: Array<{
      id: number
      work_id?: number
      sort: number
      title?: string
    }>
  }
}

interface NeosekUnitItemsResponse {
  code?: number
  message?: string
  data?: {
    items?: Array<{
      id: number
      video?: {
        container?: string
        hls?: {
          url?: string
          fallbacks?: string[]
        }
        original?: {
          url?: string
          fallbacks?: string[]
        }
        subtitles?: Array<{
          id?: string
          language?: string | null
          label?: string
          default?: boolean
          vtt?: { url?: string }
          ass?: { url?: string }
        }>
        fonts?: Array<{
          id?: string
          name?: string
          families?: string[]
          file?: { url?: string }
        }>
      }
    }>
  }
}

function extractWorkId(source: string): string | null {
  const trimmed = source.trim()
  const m = trimmed.match(/\/anime\/(\d+)/i) || trimmed.match(/^(\d+)$/)
  return m ? m[1] : null
}

function extractUnitId(pageUrl: string): string | null {
  const trimmed = pageUrl.trim()
  const m = trimmed.match(/\/anime\/\d+\/(\d+)/i) || trimmed.match(/^(\d+)$/)
  return m ? m[1] : null
}

/**
 * 1. 搜索番剧
 *
 * neosek.ai 搜索分类参数说明 (Search Category Parameter):
 * - 全部: GET https://neosek.ai/api/v1/search?q={keyword}
 * - 漫画: GET https://neosek.ai/api/v1/search?q={keyword}&content_type=manga
 * - 动画: GET https://neosek.ai/api/v1/search?q={keyword}&content_type=anime (本次接入使用)
 */
export async function searchNeosek(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const queriesToTry = [trimmed]
  const stripped = extractBaseTitle(trimmed)
  if (stripped && stripped !== trimmed) {
    queriesToTry.push(stripped)
  }

  const items: SearchItem[] = []
  const seenIds = new Set<number>()

  for (const q of queriesToTry) {
    // 采用 content_type=anime 精准过滤非动画内容（图集/同人志）
    const searchUrl = `${NEOSEK_BASE_URL}/api/v1/search?q=${encodeURIComponent(q)}&content_type=anime`
    assertPublicHttpUrl(searchUrl, 'Neosek Search')

    try {
      const res = await fetchPublic(
        searchUrl,
        {
          headers: getBaseHeaders(`${NEOSEK_BASE_URL}/`),
        },
        { source: 'neosekai', timeoutMs: 10_000 },
      )

      if (!res.ok) continue

      const json = (await res.json()) as NeosekSearchResponse
      if (json.code !== 0 || !Array.isArray(json.data?.items)) continue

      for (const item of json.data.items) {
        if (!item.id || seenIds.has(item.id)) continue
        const title = (item.title || '').trim()
        if (!title) continue

        seenIds.add(item.id)
        items.push({
          name: title,
          src: `${NEOSEK_BASE_URL}/anime/${item.id}`,
        })
      }

      if (items.length > 0) break
    } catch {
      // 容错降级重试下一轮 query
    }
  }

  return {
    pluginName: rule.name,
    items,
  }
}

/**
 * 2. 获取分集列表
 */
export async function chaptersNeosek(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const workId = extractWorkId(source)
  if (!workId) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: [`无法从链接解析番剧 ID: ${source}`],
    }
  }

  const unitsUrl = `${NEOSEK_BASE_URL}/api/v1/works/${workId}/units`
  assertPublicHttpUrl(unitsUrl, 'Neosek Units')

  try {
    const res = await fetchPublic(
      unitsUrl,
      {
        headers: getBaseHeaders(`${NEOSEK_BASE_URL}/anime/${workId}`),
      },
      { source: 'neosekai', timeoutMs: 10_000 },
    )

    if (!res.ok) {
      return {
        pluginName: rule.name,
        roads: [],
        diagnostics: [`Neosek units API 返回 HTTP ${res.status}`],
      }
    }

    const json = (await res.json()) as NeosekUnitsResponse
    if (json.code !== 0 || !Array.isArray(json.data?.items)) {
      return {
        pluginName: rule.name,
        roads: [],
        diagnostics: [`Neosek units 数据格式异常: ${json.message || '未知错误'}`],
      }
    }

    const urls: string[] = []
    const identifiers: string[] = []
    for (const u of json.data.items) {
      urls.push(`${NEOSEK_BASE_URL}/anime/${workId}/${u.id}`)
      identifiers.push((u.title || `第 ${u.sort + 1} 话`).trim())
    }

    const road: Road = {
      name: 'Neosek',
      data: urls,
      identifier: identifiers,
    }

    return {
      pluginName: rule.name,
      roads: [road],
      diagnostics: [`成功解析 ${urls.length} 集`],
    }
  } catch (e) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: [e instanceof Error ? e.message : String(e)],
    }
  }
}

/**
 * 3. 解析播放地址
 */
export async function resolveNeosek(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const unitId = extractUnitId(pageUrl)
  if (!unitId) {
    throw new Error(`无法从播放页链接解析单集 ID: ${pageUrl}`)
  }

  const itemsUrl = `${NEOSEK_BASE_URL}/api/v1/units/${unitId}/items`
  assertPublicHttpUrl(itemsUrl, 'Neosek Unit Items')

  const res = await fetchPublic(
    itemsUrl,
    {
      headers: getBaseHeaders(`${NEOSEK_BASE_URL}/anime/0/${unitId}`),
    },
    { source: 'neosekai', timeoutMs: 10_000 },
  )

  if (!res.ok) {
    throw new Error(`Neosek items API 返回 HTTP ${res.status}`)
  }

  const json = (await res.json()) as NeosekUnitItemsResponse
  if (json.code !== 0 || !Array.isArray(json.data?.items) || json.data.items.length === 0) {
    throw new Error(`Neosek 未返回有效视频项: ${json.message || '空数据'}`)
  }

  const videoItem = json.data.items[0]
  const originalUrl = videoItem?.video?.original?.url
  const hlsUrl = videoItem?.video?.hls?.url

  // 特殊处理说明：
  // 若原站提供有独立 mp4 原画直链，优先以 mp4 交付；否则回退 hls 直链
  const isDirectMp4 = Boolean(originalUrl && originalUrl.toLowerCase().includes('.mp4'))
  const playUrl = isDirectMp4 ? originalUrl! : (hlsUrl || originalUrl)

  if (!playUrl) {
    throw new Error('未获取到有效播放直链')
  }

  const isHls = playUrl.includes('.m3u8')

  // 特殊处理说明：
  // 提取外挂字幕与字体包资源（优先保留 ASS 特效字幕与中文字幕规范化）：
  // 1. Netflix 原生流识别：若标签带有 [NF] 或 _NF，表明为 Netflix 官方流。
  //    该类流原生格式为 WebVTT，转存的 ASS 会强行指定 Trebuchet MS 纯英文字体导致 Web 端缺字炸成豆腐块。
  //    因此对 [NF] 流优先将原生 VTT 置为默认轨，ASS 作为备用；常规字幕组番剧则保持 ASS 优先高保真渲染；
  // 2. 当源站 label 为空但 language 字段明确为 zh 时，自动兜底为“中文”，配合播放器自动化精准匹配；
  // 3. 字体包提取供底层 libass / JASSUB 引擎高保真渲染。
  const subtitles: SubtitleTrack[] = []
  const rawSubtitles = videoItem?.video?.subtitles || (videoItem as any)?.subtitles
  if (Array.isArray(rawSubtitles)) {
    const seenUrls = new Set<string>()
    for (const sub of rawSubtitles) {
      const rawLabel = (sub.label || '').trim()
      const rawLang = (sub.language || '').toLowerCase().trim()
      const label = rawLabel || (rawLang.includes('zh') ? '中文' : (rawLang || '外挂字幕'))
      const baseId = sub.id || `sub-${subtitles.length}`

      const assUrl = sub.ass?.url?.trim()
      const vttUrl = sub.vtt?.url?.trim()
      const flatUrl = (sub.url || (sub as any).file?.url)?.trim()

      const isNetflix = /\[nf\]|_nf/i.test(rawLabel)

      if (isNetflix) {
        // Netflix 官方流：优先交付原生 VTT 文本字幕并置为 default，避免 Web 端无中文字体跌入豆腐块
        if (vttUrl && !seenUrls.has(vttUrl)) {
          seenUrls.add(vttUrl)
          const isFirstSub = subtitles.length === 0
          subtitles.push({
            id: `${baseId}-vtt`,
            label,
            url: vttUrl,
            format: 'vtt',
            default: Boolean(sub.default) || isFirstSub,
          })
        }
        if (assUrl && !seenUrls.has(assUrl)) {
          seenUrls.add(assUrl)
          subtitles.push({
            id: `${baseId}-ass`,
            label: `${label} (ASS)`,
            url: assUrl,
            format: 'ass',
            default: false,
          })
        }
      } else {
        // 常规字幕组番剧：优先保留 ASS 特效字幕与字体包渲染
        if (assUrl && !seenUrls.has(assUrl)) {
          seenUrls.add(assUrl)
          subtitles.push({
            id: `${baseId}-ass`,
            label,
            url: assUrl,
            format: 'ass',
            default: Boolean(sub.default),
          })
        }

        if (vttUrl && !seenUrls.has(vttUrl)) {
          seenUrls.add(vttUrl)
          const hasAss = Boolean(assUrl)
          subtitles.push({
            id: `${baseId}-vtt`,
            label: hasAss ? `${label} (VTT)` : label,
            url: vttUrl,
            format: 'vtt',
            default: hasAss ? false : Boolean(sub.default),
          })
        }
      }

      if (!assUrl && !vttUrl && flatUrl && !seenUrls.has(flatUrl)) {
        seenUrls.add(flatUrl)
        const format = ((sub as any).format || (flatUrl.endsWith('.ass') ? 'ass' : 'vtt')).toLowerCase()
        subtitles.push({
          id: baseId,
          label,
          url: flatUrl,
          format: format as 'ass' | 'vtt',
          default: Boolean(sub.default),
        })
      }
    }
  }

  const fonts: string[] = []
  const rawFonts = videoItem?.video?.fonts || (videoItem as any)?.fonts
  if (Array.isArray(rawFonts)) {
    const seenFonts = new Set<string>()
    for (const f of rawFonts) {
      const fontUrl = f?.file?.url?.trim() || (f as any)?.url?.trim()
      if (fontUrl && !seenFonts.has(fontUrl)) {
        seenFonts.add(fontUrl)
        fonts.push(fontUrl)
      }
    }
  }

  const subtitle: SubtitleBundle | undefined =
    subtitles.length > 0 || fonts.length > 0
      ? {
          subtitles: subtitles.length > 0 ? subtitles : undefined,
          fonts: fonts.length > 0 ? fonts : undefined,
        }
      : undefined

  return {
    playUrl,
    proxyUrl: isHls ? `/api/media/m3u8?url=${encodeURIComponent(playUrl)}` : `/api/media/proxy?url=${encodeURIComponent(playUrl)}`,
    format: isHls ? 'hls' : 'mp4',
    contentType: isHls ? 'application/vnd.apple.mpegurl' : 'video/mp4',
    referer: `${NEOSEK_BASE_URL}/`,
    headers: {
      'User-Agent': config.defaultUserAgent,
      Referer: `${NEOSEK_BASE_URL}/`,
    },
    diagnostics: [`成功解析 neosek 直链: ${playUrl}`],
    subtitle,
    subtitles: subtitles.length > 0 ? subtitles : undefined,
    fonts: fonts.length > 0 ? fonts : undefined,
  }
}
