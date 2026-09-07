/**
 * 量子资源网 (lzizy.net / cj.lziapi.com) 专有视频源适配器。
 *
 * 架构特性：
 * 1. 接口协议：
 *    - 标准苹果 CMS V10 RESTful JSON API（免鉴权、免 Cloudflare 盾、响应极速）；
 *    - 搜索与详情合并端点：GET https://cj.lziapi.com/api.php/provide/vod/?ac=detail&wd={keyword}
 *    - 单项详情回退端点：GET https://cj.lziapi.com/api.php/provide/vod/?ac=detail&ids={id}
 * 2. 智能品类白名单与杂质过滤：
 *    - 完整支持：电影片 (pid=1)、连续剧 (pid=2)、综艺片 (pid=3)、动漫片 (pid=4)、短剧 (tid=46)、AI漫剧 (tid=52)；
 *    - 严格剔除：电影解说 (tid=35)、预告片 (tid=45)、体育赛事 (pid=36)、新闻资讯 (pid=42)、演员 (tid=41)、伦理片 (tid=34)；
 *    - 标题正则二次去噪：彻底过滤标题含「解说/预告/花絮」的低质噪点。
 * 3. 性能优化：
 *    - 搜索时全量分集瞬时预热缓存（Cache Write-Through），选集通常 0ms 返回；
 *    - 直链播放解析 0ms 零往返下发，彻底绕过海外 VPS 服务端 GeoIP 阻断与无意义 HTML 探测；
 *    - 默认全量客户端直连源站 CDN 播放（requiresProxy: false），零服务端带宽消耗。
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

const LZIZY_DEFAULT_BASE_URL = 'https://lzizy.net'
const LZIZY_DEFAULT_API_URL = 'https://cj.lziapi.com'

// 允许的主分类父级 PID（正片影视）
const ALLOWED_PARENT_PIDS = new Set([1, 2, 3, 4]) // 1=电影, 2=连续剧, 3=综艺, 4=动漫
// 允许的独立品类 TID
const ALLOWED_DIRECT_TIDS = new Set([1, 2, 3, 4, 46, 52]) // 46=短剧, 52=AI漫剧
// 严格阻断的黑名单分类 TID
const BLOCKED_TIDS = new Set([
  34, // 伦理片
  35, // 电影解说
  36, 37, 38, 39, 40, // 体育 (足球/篮球/网球/斯诺克)
  41, // 演员
  42, 43, 44, // 新闻资讯
  45, // 预告片
])

// 标题噪点正则（剔除带有解说、预告、花絮的视频）
const JUNK_TITLE_REGEX = /(?:\[|\()?(?:电影解说|电视剧解说|解说|预告片|预告|花絮)(?:\]|\))?/i

export function isLzizyRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  if (
    name === 'lzizy' ||
    name === '量子资源' ||
    name === '量子' ||
    name === 'liangzi' ||
    name === '量子云'
  ) {
    return true
  }
  const base = (rule.baseURL || '').toLowerCase()
  return base.includes('lzizy') || base.includes('lziapi.com')
}

function getBaseUrl(rule?: PluginRule): string {
  if (rule?.baseURL && /^https?:\/\//i.test(rule.baseURL)) {
    return rule.baseURL.replace(/\/+$/, '')
  }
  return LZIZY_DEFAULT_BASE_URL
}

function getApiBaseUrl(): string {
  return LZIZY_DEFAULT_API_URL
}

function getJsonHeaders(referer?: string): Record<string, string> {
  return {
    'User-Agent': config.defaultUserAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
  }
}

export interface LzizyVodItem {
  vod_id: number | string
  vod_name: string
  type_id: number | string
  type_pid?: number | string
  type_name?: string
  vod_en?: string
  vod_time?: string
  vod_remarks?: string
  vod_play_from?: string
  vod_play_server?: string
  vod_play_note?: string
  vod_play_url?: string
}

interface LzizyApiResponse {
  code: number
  msg?: string
  page?: number | string
  pagecount?: number
  limit?: number | string
  total?: number
  list?: LzizyVodItem[]
}

interface CachedVod {
  vod_id: string
  vod_name: string
  vod_play_from?: string
  vod_play_url?: string
  timestamp: number
}

// 短效缓存：将搜索阶段全量返回的分集数据缓存 5 分钟，降低网络往返
const vodCache = new Map<string, CachedVod>()
const CACHE_TTL_MS = 5 * 60 * 1000

function setVodCache(item: LzizyVodItem): void {
  if (!item.vod_id || !item.vod_name) return
  const idStr = String(item.vod_id)
  vodCache.set(idStr, {
    vod_id: idStr,
    vod_name: item.vod_name,
    vod_play_from: item.vod_play_from,
    vod_play_url: item.vod_play_url,
    timestamp: Date.now(),
  })
}

function getVodCache(vodId: string): CachedVod | undefined {
  const cached = vodCache.get(vodId)
  if (!cached) return undefined
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    vodCache.delete(vodId)
    return undefined
  }
  return cached
}

/**
 * 校验条目是否属于正片影视，过滤掉解说、预告、体育等杂质。
 */
export function isUsefulVodItem(item: LzizyVodItem): boolean {
  const tid = Number(item.type_id)
  const pid = item.type_pid != null ? Number(item.type_pid) : undefined

  // 1. 黑名单 ID 快速剔除
  if (BLOCKED_TIDS.has(tid)) return false
  if (pid != null && BLOCKED_TIDS.has(pid)) return false

  // 2. 分类名称去噪
  const typeName = item.type_name || ''
  if (
    typeName.includes('解说') ||
    typeName.includes('预告') ||
    typeName.includes('资讯') ||
    typeName.includes('体育')
  ) {
    return false
  }

  // 3. 标题正则去噪（如：间谍过家家[电影解说]）
  const name = item.vod_name || ''
  if (JUNK_TITLE_REGEX.test(name) || /解说$/i.test(name)) {
    return false
  }

  // 4. 白名单判定
  if (pid != null && ALLOWED_PARENT_PIDS.has(pid)) return true
  if (ALLOWED_DIRECT_TIDS.has(tid)) return true

  // 默认放行其他未在明确黑名单中的未知子类
  return true
}

/**
 * 1. 搜索影视条目 (searchLzizy)
 * 采用 ac=detail&wd= 参数，单次网络请求直接获取详情与全量分集数据
 */
export async function searchLzizy(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    return { pluginName: rule.name, items: [] }
  }

  const apiBase = getApiBaseUrl()
  const webBase = getBaseUrl(rule)
  const searchUrl = `${apiBase}/api.php/provide/vod/?ac=detail&wd=${encodeURIComponent(trimmed)}`
  assertPublicHttpUrl(searchUrl)

  const diagnostics: string[] = []
  const items: SearchItem[] = []
  const seenIds = new Set<string>()

  try {
    const res = await fetchPublic(
      searchUrl,
      { headers: getJsonHeaders(`${webBase}/`) },
      { timeoutMs: 8_000 },
    )

    if (!res.ok) {
      diagnostics.push(`量子云搜索 API 返回 HTTP ${res.status}`)
      return { pluginName: rule.name, items: [], diagnostics }
    }

    const data = (await res.json()) as LzizyApiResponse
    if (data && Array.isArray(data.list) && data.list.length > 0) {
      for (const item of data.list) {
        if (!item.vod_id || !item.vod_name) continue

        // 过滤非正片与解说噪点
        if (!isUsefulVodItem(item)) {
          continue
        }

        const idStr = String(item.vod_id)
        if (seenIds.has(idStr)) continue
        seenIds.add(idStr)

        // 预热短效缓存，后续选集可 0ms 返回
        setVodCache(item)

        // 拼接详情标识，兼容 URL 形式与裸 ID
        items.push({
          name: item.vod_name.trim(),
          src: `${webBase}/detail/${idStr}`,
        })
      }
    }
  } catch (err) {
    diagnostics.push(
      `量子云搜索异常: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  return {
    pluginName: rule.name,
    items,
    diagnostics: items.length > 0 ? undefined : diagnostics,
  }
}

/**
 * 提取 vod_id。兼容 `/detail/1499`、`?ids=1499` 或纯数字 `1499`。
 */
function extractVodId(source: string): string {
  const trimmed = source.trim()
  const matchDetail = trimmed.match(/\/detail\/(\d+)/)
  if (matchDetail?.[1]) return matchDetail[1]

  const matchIds = trimmed.match(/[?&]ids=(\d+)/)
  if (matchIds?.[1]) return matchIds[1]

  const matchVodId = trimmed.match(/\/vod\/(\d+)/)
  if (matchVodId?.[1]) return matchVodId[1]

  if (/^\d+$/.test(trimmed)) return trimmed

  return trimmed
}

/**
 * 将 MacCMS 格式的 vod_play_from 和 vod_play_url 解析为标准 Road[]
 * 优先保留并突出 lzm3u8 纯切片直链线路，过滤或降级 liangzi 网页分享线路。
 */
export function parseLzizyRoads(
  playFrom: string,
  playUrl: string,
): Road[] {
  if (!playUrl || !playUrl.trim()) return []

  const fromList = (playFrom || '').split('$$$').map((s) => s.trim())
  const urlGroups = playUrl.split('$$$').map((s) => s.trim())

  const rawRoads: Array<{ fromName: string; road: Road }> = []

  for (let i = 0; i < urlGroups.length; i++) {
    const rawFrom = fromList[i] || `线路${i + 1}`
    const groupStr = urlGroups[i]
    if (!groupStr) continue

    const epEntries = groupStr.split('#')
    const urls: string[] = []
    const identifiers: string[] = []

    for (let epIdx = 0; epIdx < epEntries.length; epIdx++) {
      const entry = epEntries[epIdx].trim()
      if (!entry) continue

      const dollarIdx = entry.indexOf('$')
      let epName = `第${epIdx + 1}集`
      let epUrl = entry

      if (dollarIdx !== -1) {
        epName = entry.slice(0, dollarIdx).trim() || epName
        epUrl = entry.slice(dollarIdx + 1).trim()
      }

      if (epUrl && /^https?:\/\//i.test(epUrl)) {
        urls.push(epUrl)
        identifiers.push(epName)
      }
    }

    if (urls.length > 0) {
      rawRoads.push({
        fromName: rawFrom,
        road: {
          name: rawFrom,
          data: urls,
          identifier: identifiers,
        },
      })
    }
  }

  // 线路排序与精炼：
  // 1. 优先提取 lzm3u8 线路，命名为更亲和的「量子极速(直链)」
  // 2. 其余可用 m3u8 线路保留；
  // 3. 若存在直链线路，则自动过滤掉 liangzi 网页线路，避免用户点进无法原生播放的网页
  const m3u8Roads: Road[] = []
  const otherRoads: Road[] = []

  for (const item of rawRoads) {
    const lowerFrom = item.fromName.toLowerCase()
    const isM3u8Line =
      lowerFrom.includes('lzm3u8') ||
      lowerFrom.includes('m3u8') ||
      item.road.data.some((u) => u.includes('.m3u8'))

    if (isM3u8Line) {
      m3u8Roads.push({
        ...item.road,
        name: lowerFrom.includes('lzm3u8') ? '量子极速(直链)' : item.fromName,
      })
    } else {
      otherRoads.push(item.road)
    }
  }

  if (m3u8Roads.length > 0) {
    return m3u8Roads
  }

  return otherRoads
}

/**
 * 2. 获取分集与播放线路 (chaptersLzizy)
 * 优先读取短效缓存（0ms 响应）；未命中时按 ID 查询详情 API。
 */
export async function chaptersLzizy(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const vodId = extractVodId(source)
  const diagnostics: string[] = []

  // 1. 优先命中短效缓存
  const cached = getVodCache(vodId)
  if (cached && cached.vod_play_url) {
    const roads = parseLzizyRoads(
      cached.vod_play_from || 'lzm3u8',
      cached.vod_play_url,
    )
    if (roads.length > 0) {
      return {
        pluginName: rule.name,
        roads,
      }
    }
  }

  // 2. 缓存未命中，调用详情 API 查询
  const apiBase = getApiBaseUrl()
  const webBase = getBaseUrl(rule)
  const detailUrl = `${apiBase}/api.php/provide/vod/?ac=detail&ids=${encodeURIComponent(vodId)}`
  assertPublicHttpUrl(detailUrl)

  try {
    const res = await fetchPublic(
      detailUrl,
      { headers: getJsonHeaders(`${webBase}/`) },
      { timeoutMs: 10_000 },
    )

    if (!res.ok) {
      throw new Error(`量子云详情 API 返回 HTTP ${res.status}`)
    }

    const data = (await res.json()) as LzizyApiResponse
    const item = data?.list?.[0]
    if (!item || !item.vod_play_url) {
      throw new Error(`未找到 ID 为 ${vodId} 的影视剧集数据`)
    }

    // 写入缓存供后续切集复用
    setVodCache(item)

    const roads = parseLzizyRoads(
      item.vod_play_from || 'lzm3u8',
      item.vod_play_url,
    )

    return {
      pluginName: rule.name,
      roads,
    }
  } catch (err) {
    diagnostics.push(
      `获取量子云分集失败: ${err instanceof Error ? err.message : String(err)}`,
    )
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics,
    }
  }
}

/**
 * 3. 播放直链解析 (resolveLzizy)
 *
 * 核心设计：
 * - 量子云的 lzm3u8 线路在分集中已经是 index.m3u8 真实直链；
 * - 0ms 零网络往返直接下发，坚决不在服务端发起任何 fetch 或 HEAD 探测（避免海外 VPS 被 GeoIP 404 阻断）；
 * - 设定 requiresProxy: false，遵循 Zero Auto Proxy Fallback 铁律，由国内客户端直连播放。
 */
export async function resolveLzizy(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const trimmedUrl = pageUrl.trim()
  if (!trimmedUrl) {
    throw new Error('播放地址不能为空')
  }

  const webBase = getBaseUrl(rule)
  const isM3u8 = trimmedUrl.toLowerCase().includes('.m3u8')
  const isMp4 = trimmedUrl.toLowerCase().includes('.mp4')
  const format: 'hls' | 'mp4' = isMp4 ? 'mp4' : 'hls'

  // 直链模式：URL 已经是流媒体直接地址
  if (isM3u8 || isMp4) {
    return {
      playUrl: trimmedUrl,
      proxyUrl: `/api/media/proxy?${new URLSearchParams({
        url: trimmedUrl,
        referer: webBase,
      }).toString()}`,
      format,
      requiresProxy: false,
      referer: webBase,
      headers: {
        'User-Agent': config.defaultUserAgent,
        Referer: webBase,
      },
      diagnostics: ['量子云直链 0ms 零往返极速下发'],
    }
  }

  // 兜底：若传入的是非直链地址，返回原始地址
  return {
    playUrl: trimmedUrl,
    proxyUrl: `/api/media/proxy?${new URLSearchParams({
      url: trimmedUrl,
      referer: webBase,
    }).toString()}`,
    format,
    requiresProxy: false,
    referer: webBase,
    diagnostics: ['量子云兜底返回播放地址'],
  }
}
