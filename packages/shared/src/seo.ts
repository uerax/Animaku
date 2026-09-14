/**
 * 跨端同构 SEO 工具函数集合（Title、Description 与 Keywords 生成器）
 */

export const DEFAULT_SITE_NAME = 'Animaku'

/**
 * 格式化番剧详情/播放页的标准 SEO 标题。
 * 覆盖场景：A在线、A 在线、A动漫、A 在线观看、A 全集、1080P高清播放。
 * 示例：
 * - 有原名/别名：《葬送的芙莉莲》（葬送のフリーレン）动漫在线观看全集 - 1080P高清播放 · Animaku
 * - 无原名：《葬送的芙莉莲》动漫在线观看全集 - 1080P高清播放 · Animaku
 */
export function formatSubjectTitle(
  name: string,
  altName?: string,
  siteName = DEFAULT_SITE_NAME,
): string {
  const baseName = (name || '').trim() || '番剧'
  const cleanAlt = (altName || '').trim()
  const displayTitle =
    cleanAlt && cleanAlt !== baseName
      ? `《${baseName}》（${cleanAlt}）`
      : `《${baseName}》`
  return `${displayTitle}动漫在线观看全集 - 1080P高清播放 · ${siteName}`
}

/**
 * 格式化番剧详情/播放页的标准 SEO Meta Description。
 * 覆盖场景：前置引导核心意图词（全集在线观看、在线播放、无广告弹幕、画质超分），后接剧情简介截取。
 */
export function formatSubjectDescription(
  name: string,
  rawSummary?: string,
  maxLen = 160,
): string {
  const baseName = (name || '').trim() || '番剧'
  const prefix = `《${baseName}》动漫全集高清在线观看！Animaku 为您提供《${baseName}》无广告弹幕在线播放与画质超分。`
  const summary = (rawSummary || '').replace(/\s+/g, ' ').trim()
  if (!summary) {
    return prefix
  }
  // 留出前缀和 "剧情简介：" 的字符预算
  const availableLen = Math.max(20, maxLen - prefix.length - 6)
  const truncatedSummary =
    summary.length <= availableLen
      ? summary
      : `${summary.slice(0, availableLen - 1)}…`
  return `${prefix}剧情简介：${truncatedSummary}`
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
  if (!baseName) return ['番剧在线', '在线观看', '1080P高清播放', '无广告动漫']

  const list = [
    baseName,
    `${baseName}在线`,
    `${baseName} 在线`,
    `${baseName}动漫`,
    `${baseName} 在线观看`,
    `${baseName}全集`,
    '番剧在线',
    '在线观看',
    '1080P高清播放',
    '无广告动漫',
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
