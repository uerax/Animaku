import {
  buildSearchKeywords,
  comparePluginOrder,
  resolvePluginDefaultKeyword,
  type BangumiItem,
  type BangumiSeed,
  type PluginMeta,
} from '@animaku/shared'

export type BangumiItemLike = BangumiItem | BangumiSeed | null | undefined

/**
 * 提取番剧有效标题与别名引用列表（用于相似度比对与弹幕匹配）
 */
export function deriveTitleRefs(resolvedItem: BangumiItemLike): string[] {
  if (!resolvedItem) return []
  return [resolvedItem.nameCn, resolvedItem.name, ...(resolvedItem.alias || [])].filter(
    Boolean,
  ) as string[]
}

/**
 * 根据番剧元数据与当前视频源标题偏好（中文/日文原名/紧凑中文），推导全量候选搜索词列表
 */
export function deriveKeywordCandidates(
  resolvedItem: BangumiItemLike,
  activeTargetPlugin?: PluginMeta | null,
  preferOriginal = false,
): string[] {
  if (!resolvedItem) return []

  const pref = activeTargetPlugin?.titlePreference || (preferOriginal ? 'original' : 'chinese')
  const primary = (
    pref === 'original'
      ? resolvedItem.name || resolvedItem.nameCn || ''
      : pref === 'chinese_compact'
        ? (resolvedItem.nameCn || resolvedItem.name || '').replace(
            /\s+(第\s*[一二三四五六七八九十\d]+\s*[季期部])/g,
            '$1',
          )
        : resolvedItem.nameCn || resolvedItem.name || ''
  ).trim()

  const variants = buildSearchKeywords(
    resolvedItem.nameCn,
    resolvedItem.name,
    resolvedItem.alias,
  )
  const seen = new Set<string>()
  const out: string[] = []
  const titleOrder = preferOriginal
    ? [primary, resolvedItem.name, resolvedItem.nameCn, ...variants]
    : [primary, resolvedItem.nameCn, resolvedItem.name, ...variants]

  for (const k of titleOrder) {
    const t = (k || '').trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  return out
}

/**
 * 推导默认搜索词（优先中文展示名，其次原名，最后取首个候选词）
 */
export function deriveDefaultKeyword(
  resolvedItem: BangumiItemLike,
  keywordCandidates: string[] = [],
): string {
  return (
    resolvedItem?.nameCn ||
    resolvedItem?.name ||
    keywordCandidates[0] ||
    ''
  ).trim()
}

/**
 * 为特定视频源解析生效搜索词：
 * 1. 优先使用用户手动输入/选中的记忆词
 * 2. 否则依据视频源规则与偏好生成默认词
 */
export function resolveKeywordForPlugin(
  plugin: PluginMeta,
  resolvedItem: BangumiItemLike,
  defaultKeyword: string,
  manualKeywords: Record<string, string> = {},
): string {
  if (manualKeywords[plugin.name]) {
    return manualKeywords[plugin.name]
  }
  return resolvePluginDefaultKeyword(
    plugin,
    resolvedItem as BangumiItem | undefined,
    defaultKeyword || '',
  )
}

/**
 * 对视频源搜索行按用户设定顺序排布（未设定时按能力打分与字母序排序）
 */
export function orderSearchRows<T extends { plugin: PluginMeta }>(
  rows: T[],
  order: string[],
  isOldAnime = false,
  boostedPluginNames?: Set<string>,
): T[] {
  if (!order.length) {
    return [...rows].sort((a, b) =>
      comparePluginOrder(a.plugin, b.plugin, isOldAnime, boostedPluginNames),
    )
  }
  const rank = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    rank.set(order[i].toLowerCase(), i)
  }
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.plugin.name.toLowerCase()) ?? order.length
    const rb = rank.get(b.plugin.name.toLowerCase()) ?? order.length
    if (ra !== rb) return ra - rb
    return comparePluginOrder(a.plugin, b.plugin, isOldAnime, boostedPluginNames)
  })
}
