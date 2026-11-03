import type { PlayableSlot } from '@animaku/shared'

export type CurrentEpisodeRef = {
  pageUrl: string
  episode: number
  sourceIndex?: number
}

/**
 * 精准定位当前播放集在当前线路 PlayableSlot 列表中的索引位置：
 * 1. 优先按 pageUrl 严格比对
 * 2. 备用按 sourceIndex 比对（需保证处于 slots 合法区间）
 * 3. 备用按 canonicalEp（标准集数号）比对
 */
export function findCurrentSlotIndex(
  episode: CurrentEpisodeRef | null | undefined,
  slots: PlayableSlot[],
): number {
  if (!episode || !slots.length) return -1
  // 1. 优先按 pageUrl 严格比对
  const byUrl = slots.findIndex((s) => s.pageUrl === episode.pageUrl)
  if (byUrl >= 0) return byUrl
  // 2. 备用按 sourceIndex 比对（需保证合法区间）
  if (
    episode.sourceIndex !== undefined &&
    episode.sourceIndex >= 0 &&
    episode.sourceIndex < slots.length
  ) {
    const bySourceIdx = slots.findIndex((s) => s.sourceIndex === episode.sourceIndex)
    if (bySourceIdx >= 0) return bySourceIdx
  }
  // 3. 备用按 canonicalEp（标准集数号）比对
  const byEp = slots.findIndex((s) => s.canonicalEp === episode.episode)
  if (byEp >= 0) return byEp
  return -1
}

/**
 * 计算当前集在当前线路中的边界信息与上下集可用性
 */
export function resolveEpisodeBoundaries(
  episode: CurrentEpisodeRef | null | undefined,
  slots: PlayableSlot[],
): {
  currentSlotIndex: number
  hasPrevEpisode: boolean
  hasNextEpisode: boolean
} {
  const currentSlotIndex = findCurrentSlotIndex(episode, slots)
  const hasPrevEpisode = currentSlotIndex > 0
  const hasNextEpisode =
    currentSlotIndex >= 0 && currentSlotIndex < slots.length - 1

  return {
    currentSlotIndex,
    hasPrevEpisode,
    hasNextEpisode,
  }
}

/**
 * 根据位移 delta 获取相邻集槽位，越界时返回 null
 */
export function getAdjacentEpisodeSlot(
  slots: PlayableSlot[],
  currentSlotIndex: number,
  delta: number,
): PlayableSlot | null {
  if (!slots.length || currentSlotIndex < 0) return null
  const nextIdx = currentSlotIndex + delta
  if (nextIdx < 0 || nextIdx >= slots.length) return null
  return slots[nextIdx] ?? null
}
