import { createContext, useContext, useSyncExternalStore } from 'react'

export interface PlayerTimeDisplayState {
  current: number
  duration: number
}

export type TimeRangeTuple = [number, number]

export interface PlayerTimeSnapshot {
  current: number
  duration: number
  progress: number
  time: PlayerTimeDisplayState
  playedRanges: TimeRangeTuple[]
}

export type PlayerTimeListener = () => void

export interface PlayerTimeStore {
  subscribe: (listener: PlayerTimeListener) => () => void
  getSnapshot: () => PlayerTimeSnapshot
  updateTime: (
    current: number,
    duration: number,
    rawRanges?: TimeRangeTuple[],
  ) => void
  reset: () => void
}

export function normalizeRanges(
  rawRanges: TimeRangeTuple[],
  mergeTolerance = 1.0,
): TimeRangeTuple[] {
  if (!rawRanges || rawRanges.length === 0) return []
  const sorted = [...rawRanges].sort((a, b) => a[0] - b[0])
  const merged: TimeRangeTuple[] = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = sorted[i]
    if (curr[0] <= prev[1] + mergeTolerance) {
      prev[1] = Math.max(prev[1], curr[1])
    } else {
      merged.push([curr[0], curr[1]])
    }
  }
  return merged
}

function areRangesEqual(a: TimeRangeTuple[], b: TimeRangeTuple[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i][0] - b[i][0]) > 0.05 || Math.abs(a[i][1] - b[i][1]) > 0.05) {
      return false
    }
  }
  return true
}

export function createPlayerTimeStore(
  initialCurrent = 0,
  initialDuration = 0,
): PlayerTimeStore {
  let snapshot: PlayerTimeSnapshot = {
    current: initialCurrent,
    duration: initialDuration,
    progress:
      initialDuration > 0
        ? Math.min(100, Math.max(0, (initialCurrent / initialDuration) * 100))
        : 0,
    time: { current: initialCurrent, duration: initialDuration },
    playedRanges: initialCurrent > 0 ? [[0, initialCurrent]] : [],
  }

  const listeners = new Set<PlayerTimeListener>()

  return {
    subscribe(listener: PlayerTimeListener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return snapshot
    },
    updateTime(cur: number, dur: number, rawRanges?: TimeRangeTuple[]) {
      const safeCur = Math.max(0, cur)
      const safeDur = Math.max(0, dur)
      const p =
        safeDur > 0
          ? Math.min(100, Math.max(0, (safeCur / safeDur) * 100))
          : 0

      let nextRanges = snapshot.playedRanges
      if (rawRanges && rawRanges.length > 0) {
        const merged = normalizeRanges([...snapshot.playedRanges, ...rawRanges])
        if (!areRangesEqual(snapshot.playedRanges, merged)) {
          nextRanges = merged
        }
      }

      // 避免无效触发
      if (
        Math.abs(snapshot.current - safeCur) < 0.05 &&
        snapshot.duration === safeDur &&
        nextRanges === snapshot.playedRanges
      ) {
        return
      }

      snapshot = {
        current: safeCur,
        duration: safeDur,
        progress: p,
        time: { current: safeCur, duration: safeDur },
        playedRanges: nextRanges,
      }

      listeners.forEach((listener) => {
        try {
          listener()
        } catch (err) {
          console.error('[PlayerTimeStore] Listener error:', err)
        }
      })
    },
    reset() {
      snapshot = {
        current: 0,
        duration: 0,
        progress: 0,
        time: { current: 0, duration: 0 },
        playedRanges: [],
      }
      listeners.forEach((listener) => {
        try {
          listener()
        } catch (err) {
          console.error('[PlayerTimeStore] Reset listener error:', err)
        }
      })
    },
  }
}

export const PlayerTimeContext = createContext<PlayerTimeStore | null>(null)

export function usePlayerTimeStore(): PlayerTimeStore {
  const store = useContext(PlayerTimeContext)
  if (!store) {
    throw new Error(
      'usePlayerTimeStore must be used within PlayerTimeContext.Provider',
    )
  }
  return store
}

const SERVER_FALLBACK_TIME: PlayerTimeDisplayState = { current: 0, duration: 0 }

/**
 * 局部订阅：当前播放时间与总时长（用于时间戳显示 01:23 / 24:00）
 * 内部返回稳定引用的不可变对象，杜绝 useSyncExternalStore 引用抖动
 */
export function usePlayerTime(): PlayerTimeDisplayState {
  const store = usePlayerTimeStore()
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().time,
    () => SERVER_FALLBACK_TIME,
  )
}

/**
 * 局部订阅：当前播放进度百分比（0 ~ 100，用于进度滑块与 CSS --kz-progress）
 */
export function usePlayerProgress(): number {
  const store = usePlayerTimeStore()
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().progress,
    () => 0,
  )
}

/**
 * 局部订阅：仅读取当前秒数（原始 number）
 */
export function usePlayerCurrentTime(): number {
  const store = usePlayerTimeStore()
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().current,
    () => 0,
  )
}

const EMPTY_RANGES: TimeRangeTuple[] = []

/**
 * 局部订阅：实际播放过的有效区间集合（[[startSec, endSec], ...]）
 * 跳过的区间不会包含在此列表中，用于热力图精准区分“已观看区间”与“跳过区间”
 */
export function usePlayerPlayedRanges(): TimeRangeTuple[] {
  const store = usePlayerTimeStore()
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().playedRanges,
    () => EMPTY_RANGES,
  )
}
