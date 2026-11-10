/**
 * 跨端同构 SEO 工具函数集合（Title、Description 与 Keywords 生成器）
 */

export const DEFAULT_SITE_NAME = 'Animaku 动漫'

/**
 * 格式化站点首页的标准 SEO 标题。
 * 遵循 Google 最佳实践：精炼短小，控制在 20-25 字符安全区间，避免多重短横线截断。
 * - 有副标题：{品牌} - {副标题}（如：扎口动漫 - 弹幕播放与多源聚合平台）
 * - 无副标题：{品牌} - 高清动漫在线观看与弹幕聚合平台
 */
export function formatHomeTitle(siteName?: string, siteTagline?: string): string {
  const brand = (siteName || '').trim() || DEFAULT_SITE_NAME
  const tagline = (siteTagline || '').trim()
  if (tagline) {
    return `${brand} - ${tagline}`
  }
  return `${brand} - 高清动漫在线观看与弹幕聚合平台`
}

/**
 * 格式化番剧列表/目录页的标准 SEO 标题。
 * 遵循 Google 最佳实践：核心词在前，单短横线分隔，品牌在后，杜绝样板词堆砌。
 * 格式：番剧列表 - 高清动漫在线 - {自定义站点名称}
 */
export function formatAnimeListTitle(siteName?: string): string {
  const brand = (siteName || '').trim() || DEFAULT_SITE_NAME
  return `番剧列表 - 高清动漫在线 - ${brand}`
}

/**
 * 格式化每日新番放送时间表页的标准 SEO 标题。
 * 遵循 Google 最佳实践：核心词在前，单短横线分隔，品牌在后，杜绝样板词堆砌。
 * 格式：新番放送时间表 - 每日连载更新 - {自定义站点名称}
 */
export function formatTimelineTitle(siteName?: string): string {
  const brand = (siteName || '').trim() || DEFAULT_SITE_NAME
  return `新番放送时间表 - 每日连载更新 - ${brand}`
}

/**
 * 格式化番剧详情/播放页的标准 SEO 标题。
 * 遵循 Google 最佳实践：单一分隔符 + 黄金字数控制在 28-30 字符内，杜绝触发搜索重写截断。
 * 格式：
 * - 有原名：《中文名》（日文原名）在线观看 - 站点名
 * - 无原名 / 原名与中文名相同：《中文名》在线观看 - 站点名
 * - 超长保护：若日文原名过长导致总长超 32 字符，自适应收敛日文名，确保中文名与品牌词 100% 完整可见。
 */
export function formatSubjectTitle(
  name: string,
  altName?: string,
  siteName = DEFAULT_SITE_NAME,
): string {
  const baseName = (name || '').trim() || '番剧'
  const cleanAlt = (altName || '').trim()
  const effectiveSiteName = (siteName || '').trim() || DEFAULT_SITE_NAME

  // 基础无副标题格式：《片名》在线观看 - 站点名
  const baseTitle = `《${baseName}》在线观看 - ${effectiveSiteName}`
  if (!cleanAlt || cleanAlt === baseName) {
    return baseTitle
  }

  // Google 搜索结果标题建议上限约为 32 字符（约 580-600px 物理像素宽度）
  const MAX_TITLE_LEN = 32
  const fullTitle = `《${baseName}》（${cleanAlt}）在线观看 - ${effectiveSiteName}`
  if (fullTitle.length <= MAX_TITLE_LEN) {
    return fullTitle
  }

  // 当日文名过长时，优先保证中文名与品牌词完整展示，对日文原名做平滑收敛
  // 32 - (baseTitle.length + 括号2字符 + 省略号1字符)
  const allowedAltLen = MAX_TITLE_LEN - baseTitle.length - 3
  if (allowedAltLen >= 4) {
    const truncatedAlt = `${cleanAlt.slice(0, allowedAltLen)}…`
    return `《${baseName}》（${truncatedAlt}）在线观看 - ${effectiveSiteName}`
  }

  // 若中文名本身较长，省略日文原名，确保主标题不受截断
  return baseTitle
}

/**
 * 格式化站点全局 / 首页的标准 SEO Meta Description（精确达到 150-160 字符）。
 * 联动用户在后台设置的网站名称与副标题。
 */
export function formatDefaultDescription(
  siteName?: string,
  siteTagline?: string,
): string {
  const brand = (siteName || '').trim() || DEFAULT_SITE_NAME
  const cleanTagline = (siteTagline || '').trim()
  const sub = cleanTagline ? `（${cleanTagline}）` : ''
  const full = `${brand}${sub}致力于为广大动漫爱好者提供优质的高清日漫新番、剧场版动画以及热门国创在线观看服务。平台采用先进的多线路多源聚合技术，保证播放流畅与极速换源，同时支持自研高性能弹幕互动、画质超分辨率增强、OP/ED智能跳过、Bangumi每日更新时间表与云端追番历史记录，打造极致纯净舒适的在线观影追番体验。`
  if (full.length > 160) {
    return `${full.slice(0, 159)}…`
  }
  return full
}

/**
 * 格式化番剧列表/目录页的标准 SEO Meta Description（精确达到 150-160 字符）。
 */
export function formatAnimeListDescription(siteName?: string): string {
  const brand = (siteName || '').trim() || DEFAULT_SITE_NAME
  const full = `${brand}番剧列表分类频道为您提供全网丰富的日本动画与热门国创索引。支持按放送年份、上线季度、题材类型以及Bangumi权威评分与热度排行榜进行多维度精准筛选。所有收录番剧均提供多线路高清视频源一键快速切换播放，搭配自研实时弹幕互动与分集选集，帮助广大动漫爱好者轻松探索、发现并在线畅享海量精彩动画番剧。`
  if (full.length > 160) {
    return `${full.slice(0, 159)}…`
  }
  return full
}

/**
 * 格式化每日新番放送时间表页的标准 SEO Meta Description（精确达到 150-160 字符）。
 */
export function formatTimelineDescription(siteName?: string): string {
  const brand = (siteName || '').trim() || DEFAULT_SITE_NAME
  const full = `${brand}每日新番放送时间表为您实时呈现本季每周一至周日的日本动画连载更新日历。同步Bangumi官方最新放送日程，清晰展示每日开播新番剧集、更新集数、首播档期与开播预告。平台支持一键直达对应番剧详情与多线路高清播放，搭配实时弹幕互动与追番日程管理，让您第一时间掌握最新连载番剧动态，追番更新绝不错过。`
  if (full.length > 160) {
    return `${full.slice(0, 159)}…`
  }
  return full
}

export interface SubjectDescriptionOptions {
  rawSummary?: string
  siteName?: string
  tags?: string[]
  airDate?: string
  maxLen?: number
  minLen?: number
}

/**
 * 格式化番剧详情/播放页的标准 SEO Meta Description。
 * 采用智能动态拼接 + 兜底垫字引擎，确保在 Bing 等搜索引擎中恒定在 150-160 字符黄金区间。
 */
export function formatSubjectDescription(
  name: string,
  summaryOrOptions?: string | SubjectDescriptionOptions,
  legacyMaxLen = 160,
  legacySiteName = DEFAULT_SITE_NAME,
): string {
  let rawSummary = ''
  let siteName = legacySiteName
  let tags: string[] | undefined
  let airDate: string | undefined
  let maxLen = legacyMaxLen
  let minLen = 150

  if (typeof summaryOrOptions === 'object' && summaryOrOptions !== null) {
    rawSummary = summaryOrOptions.rawSummary || ''
    siteName = summaryOrOptions.siteName || DEFAULT_SITE_NAME
    tags = summaryOrOptions.tags
    airDate = summaryOrOptions.airDate
    if (typeof summaryOrOptions.maxLen === 'number') maxLen = summaryOrOptions.maxLen
    if (typeof summaryOrOptions.minLen === 'number') minLen = summaryOrOptions.minLen
  } else if (typeof summaryOrOptions === 'string') {
    rawSummary = summaryOrOptions
    siteName = legacySiteName
    maxLen = legacyMaxLen
  }

  const baseName = (name || '').trim() || '番剧'
  const effectiveSiteName = (siteName || '').trim() || DEFAULT_SITE_NAME
  const prefix = `《${baseName}》全集高清正片在线观看。${effectiveSiteName}聚合多个优质视频源，提供流畅极速播放与实时弹幕互动。`
  const summary = (rawSummary || '').replace(/\s+/g, ' ').trim()

  // 附加结构化标签与年代（增强 SEO 上下文与语义）
  const metaParts: string[] = []
  if (airDate && airDate.trim()) {
    const yearMonth = airDate.trim().slice(0, 7)
    metaParts.push(`【首播：${yearMonth}】`)
  }
  if (Array.isArray(tags) && tags.length > 0) {
    const cleanTags = tags.map((t) => t.trim()).filter(Boolean).slice(0, 3)
    if (cleanTags.length > 0) {
      metaParts.push(`【类型：${cleanTags.join('/')}】`)
    }
  }
  const metaInfo = metaParts.join('')

  const featureFiller =
    '全站支持画质超分辨率增强、OP/ED智能跳过、多源极速切换与播放历史云端同步，带来纯净无广告追番体验。'
  const emptySummaryFallback =
    '平台收录全网官方多线路高清视频源，支持自研高性能弹幕互动、画质超分辨率增强、OP/ED智能跳过、分集播放与历史同步，致力于为动漫爱好者打造纯净流畅的极致观影体验。'

  let assembled = ''
  if (summary) {
    assembled = `${prefix}${metaInfo}剧情简介：${summary}`
    // 如果加上简介依然少于下限，将特性说明填充进去
    if (assembled.length < minLen) {
      assembled = `${prefix}${metaInfo}剧情简介：${summary} ${featureFiller}`
    }
  } else {
    assembled = `${prefix}${metaInfo}${emptySummaryFallback}`
  }

  // 二次垫字兜底
  if (assembled.length < minLen) {
    assembled = `${assembled}Bangumi权威评分与每日时间表同步更新，精彩好番不容错过。`
  }

  if (assembled.length <= maxLen) {
    return assembled
  }

  return `${assembled.slice(0, maxLen - 1)}…`
}

/**
 * 生成番剧页核心搜索关键词列表（用于 Schema.org keywords 与 Meta Keywords）。
 */
export function generateSubjectKeywords(
  name: string,
  altName?: string,
  tags?: string[],
): string[] {
  const baseName = (name || '').trim()
  if (!baseName) return ['番剧在线', '在线观看']

  const list = [
    baseName,
    `${baseName}在线`,
    `${baseName} 在线`,
    `${baseName}动漫`,
    `${baseName} 在线观看`,
    `${baseName}全集高清`,
    '番剧在线',
    '在线观看',
  ]
  if (altName && altName.trim() && altName.trim() !== baseName) {
    const cleanAlt = altName.trim()
    list.splice(1, 0, cleanAlt, `${cleanAlt}在线`, `${cleanAlt} 在线`, `${cleanAlt}动漫`)
  }
  if (Array.isArray(tags) && tags.length > 0) {
    for (const tag of tags.slice(0, 6)) {
      const t = tag?.trim()
      if (t && !list.includes(t)) {
        list.push(t)
      }
    }
  }
  return list
}
