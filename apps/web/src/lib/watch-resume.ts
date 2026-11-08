import {
  CONTINUE_PLAY_MIN_THRESHOLD_SEC,
  CONTINUE_PLAY_END_THRESHOLD_SEC,
  CONTINUE_PLAY_END_RATIO_THRESHOLD,
  type WatchHistoryEntry,
} from '@animaku/shared'
import { useHistoryStore } from '../stores/history'

/** Minimum history progress in seconds before continue-play seeks. */
export const RESUME_MIN_POSITION = CONTINUE_PLAY_MIN_THRESHOLD_SEC

/**
 * 格式化播放时间（分:秒）
 */
export function formatMinutesSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/**
 * 判断当前集播放是否已接近片尾/已完播
 */
export function isPlaybackFinished(pos: number, dur: number): boolean {
  if (!dur || dur <= 0) return false
  if (dur > 30) {
    return (
      pos >= dur - CONTINUE_PLAY_END_THRESHOLD_SEC ||
      pos / dur >= CONTINUE_PLAY_END_RATIO_THRESHOLD
    )
  }
  return pos >= dur - 2
}

/**
 * 从历史记录列表中检索指定番剧、视频源、集数和线路的续播进度
 */
export function calculateResumePositionFromList(
  items: WatchHistoryEntry[] | null | undefined,
  bangumiId: number,
  pluginName: string,
  episode: number,
  road: number,
  entryEp?: number,
): number {
  const list = Array.isArray(items) ? items : []

  // 1. 精确匹配：番剧 + 插件 + 集数 + 线路 (优先 entryEp 对齐，回退 episode 对齐)
  const exact = list.find(
    (i) =>
      i.bangumiId === bangumiId &&
      i.pluginName === pluginName &&
      i.road === road &&
      ((entryEp !== undefined && i.entryEp === entryEp) || i.episode === episode),
  )
  if (exact) {
    if (isPlaybackFinished(exact.position, exact.duration)) return 0
    return exact.position || 0
  }

  // 2. 跨线路/源回退：同番剧同集数（继承已有进度）
  const sameEp = list.find(
    (i) =>
      i.bangumiId === bangumiId &&
      ((entryEp !== undefined && i.entryEp === entryEp) || i.episode === episode),
  )
  if (sameEp) {
    if (isPlaybackFinished(sameEp.position, sameEp.duration)) return 0
    return sameEp.position || 0
  }

  return 0
}

/**
 * 快捷读取历史 Store 并查询续播进度
 */
export function lookupResumePosition(
  bangumiId: number,
  pluginName: string,
  episode: number,
  road: number,
  entryEp?: number,
): number {
  const items = useHistoryStore.getState().items
  return calculateResumePositionFromList(
    items,
    bangumiId,
    pluginName,
    episode,
    road,
    entryEp,
  )
}

/**
 * 快捷读取历史 Store 并查询某番剧指定展示集数对应的 entryEp (0ms 本地同步读取)
 */
export function lookupHistoryEntryEp(
  bangumiId: number,
  episode?: number,
): number | undefined {
  if (episode === undefined) return undefined
  const items = useHistoryStore.getState().items
  const list = Array.isArray(items) ? items : []
  const hit = list.find((i) => i.bangumiId === bangumiId && i.episode === episode)
  return hit?.entryEp
}

/**
 * 从历史记录列表中检索对应番剧/视频源的详情页 sourceUrl（优先按 pageUrl 严格匹配，备用取任意已知 sourceUrl）
 */
export function calculateHistorySourceUrlFromList(
  items: WatchHistoryEntry[] | null | undefined,
  bangumiId: number,
  pluginName: string,
  pageUrl?: string,
): string {
  const list = Array.isArray(items) ? items : []
  const norm = (u: string) => (u || '').replace(/\/+$/, '')
  const target = norm(pageUrl || '')

  if (target) {
    const hit = list.find(
      (i) =>
        i.bangumiId === bangumiId &&
        i.pluginName === pluginName &&
        (norm(i.pageUrl) === target ||
          (i.sourceUrl && norm(i.sourceUrl) === target)),
    )
    if (hit?.sourceUrl) return hit.sourceUrl.trim()
  }

  const hitAny = list.find(
    (i) =>
      i.bangumiId === bangumiId &&
      i.pluginName === pluginName &&
      Boolean(i.sourceUrl),
  )
  return (hitAny?.sourceUrl || '').trim()
}

/**
 * 快捷读取历史 Store 并查询历史 sourceUrl
 */
export function lookupHistorySourceUrl(
  bangumiId: number,
  pluginName: string,
  pageUrl?: string,
): string {
  const items = useHistoryStore.getState().items
  return calculateHistorySourceUrlFromList(items, bangumiId, pluginName, pageUrl)
}
