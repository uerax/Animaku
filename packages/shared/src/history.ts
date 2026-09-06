export interface WatchHistoryEntry {
  id: string
  bangumiId: number
  title: string
  cover?: string
  episode: number
  road: number
  pluginName: string
  /** Episode play-page URL (used for resolve + deep-link resume). */
  pageUrl: string
  /**
   * Source/detail URL used for chapters fetch (search hit `src`).
   * Optional for legacy rows; cold resume should prefer this over pageUrl.
   */
  sourceUrl?: string
  playUrl?: string
  position: number
  duration: number
  updatedAt: number
}

export function historyId(
  bangumiId: number,
  _pluginName?: string,
  episode: number = 1,
  _road?: number,
): string {
  return `${bangumiId}::ep${episode}`
}

/**
 * Record of watched episodes per anime.
 * Map: bangumiId -> { [canonicalEp: number]: watchedTimestamp }
 */
export type WatchedEpisodesMap = Record<number, Record<number, number>>

export type HistoryTimeGroupKey = 'today' | 'yesterday' | 'last7Days' | 'earlier'

export interface HistoryTimeGroup {
  key: HistoryTimeGroupKey
  label: string
  subLabel: string
  items: WatchHistoryEntry[]
}

/**
 * 获取本地自然日零点时间戳 (00:00:00.000)
 */
export function getLocalDayStart(timestamp: number): number {
  const d = new Date(timestamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 格式化播放时长（支持秒数换算为 mm:ss 或 hh:mm:ss）
 */
export function formatPlaybackTime(sec: number): string {
  if (!sec || sec < 0 || !Number.isFinite(sec)) return '0:00'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 格式化观看进度百分比 (0-100)
 */
export function getPlaybackPercentage(position: number, duration: number): number {
  if (!duration || duration <= 0 || !Number.isFinite(duration)) return 0
  const pos = Math.max(0, position || 0)
  return Math.min(100, Math.max(0, Math.round((pos / duration) * 100)))
}

/**
 * 判断是否已看完整集（进度达到 90% 或剩余时长不足 60 秒）
 */
export function isPlaybackFinished(position: number, duration: number): boolean {
  if (!duration || duration <= 0) return false
  if (duration > 120 && duration - position <= 60) return true
  return getPlaybackPercentage(position, duration) >= 90
}

/**
 * 格式化精细相对时间标注：
 * - 今天：1分钟内显示「刚刚」，1小时内显示「X分钟前」，否则显示「HH:mm」
 * - 昨天：显示「昨天 HH:mm」
 * - 过去 7 天：显示「X天前」
 * - 更早：今年显示「MM-DD」，跨年显示「YYYY-MM-DD」
 */
export function formatRelativeWatchTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  if (!timestamp || !Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp)
  const todayStart = getLocalDayStart(now)
  const yesterdayStart = todayStart - 86_400_000
  const last7DaysStart = todayStart - 6 * 86_400_000

  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (timestamp >= todayStart) {
    const diff = Math.max(0, now - timestamp)
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}分钟前`
    return timeStr
  }

  if (timestamp >= yesterdayStart) {
    return `昨天 ${timeStr}`
  }

  if (timestamp >= last7DaysStart) {
    const days = Math.floor((todayStart - timestamp) / 86_400_000) + 1
    return `${days}天前`
  }

  const nowDate = new Date(now)
  const isSameYear = date.getFullYear() === nowDate.getFullYear()
  const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return isSameYear ? monthDay : `${date.getFullYear()}-${monthDay}`
}

/**
 * 业界主流四段式历史记录分组算法：
 * - 今天 (Today): 本地自然日今日 00:00:00 至今
 * - 昨天 (Yesterday): 本地自然日昨日 00:00:00 至 今日 00:00:00
 * - 过去 7 天 (Last 7 Days): 距今 7 天内除去今天与昨天
 * - 更早以前 (Earlier): 7 天以前的记录
 */
export function groupWatchHistory(
  entries: WatchHistoryEntry[],
  now: number = Date.now(),
): HistoryTimeGroup[] {
  if (!Array.isArray(entries) || entries.length === 0) return []

  const todayStart = getLocalDayStart(now)
  const yesterdayStart = todayStart - 86_400_000
  const last7DaysStart = todayStart - 6 * 86_400_000

  const todayItems: WatchHistoryEntry[] = []
  const yesterdayItems: WatchHistoryEntry[] = []
  const last7DaysItems: WatchHistoryEntry[] = []
  const earlierItems: WatchHistoryEntry[] = []

  for (const item of entries) {
    const t = item.updatedAt || 0
    if (t >= todayStart) {
      todayItems.push(item)
    } else if (t >= yesterdayStart) {
      yesterdayItems.push(item)
    } else if (t >= last7DaysStart) {
      last7DaysItems.push(item)
    } else {
      earlierItems.push(item)
    }
  }

  const groups: HistoryTimeGroup[] = []

  if (todayItems.length > 0) {
    groups.push({
      key: 'today',
      label: '今天',
      subLabel: 'Today',
      items: todayItems,
    })
  }
  if (yesterdayItems.length > 0) {
    groups.push({
      key: 'yesterday',
      label: '昨天',
      subLabel: 'Yesterday',
      items: yesterdayItems,
    })
  }
  if (last7DaysItems.length > 0) {
    groups.push({
      key: 'last7Days',
      label: '过去 7 天',
      subLabel: 'Last 7 Days',
      items: last7DaysItems,
    })
  }
  if (earlierItems.length > 0) {
    groups.push({
      key: 'earlier',
      label: '更早以前',
      subLabel: 'Earlier',
      items: earlierItems,
    })
  }

  return groups
}

/**
 * 历史统计指标数据
 */
export interface HistoryStatsSummary {
  totalCount: number
  todayCount: number
  finishedCount: number
  totalWatchMinutes: number
  totalWatchHoursText: string
}

export function computeHistoryStats(
  entries: WatchHistoryEntry[],
  now: number = Date.now(),
): HistoryStatsSummary {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      totalCount: 0,
      todayCount: 0,
      finishedCount: 0,
      totalWatchMinutes: 0,
      totalWatchHoursText: '0 小时',
    }
  }

  const todayStart = getLocalDayStart(now)
  let todayCount = 0
  let finishedCount = 0
  let totalPositionSec = 0

  for (const item of entries) {
    if ((item.updatedAt || 0) >= todayStart) {
      todayCount++
    }
    if (isPlaybackFinished(item.position, item.duration)) {
      finishedCount++
    }
    if (item.position > 0 && Number.isFinite(item.position)) {
      totalPositionSec += item.position
    }
  }

  const totalWatchMinutes = Math.round(totalPositionSec / 60)
  const hours = (totalPositionSec / 3600).toFixed(1)
  const totalWatchHoursText =
    totalPositionSec >= 3600 ? `${hours} 小时` : `${totalWatchMinutes} 分钟`

  return {
    totalCount: entries.length,
    todayCount,
    finishedCount,
    totalWatchMinutes,
    totalWatchHoursText,
  }
}

