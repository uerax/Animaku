import { createContext, useContext, useSyncExternalStore } from 'react'

export interface PlayerTimeDisplayState {
  current: number
  duration: number
}

export interface PlayerTimeSnapshot {
  current: number
  duration: number
  progress: number
  time: PlayerTimeDisplayState
}

export type PlayerTimeListener = () => void

export interface PlayerTimeStore {
  subscribe: (listener: PlayerTimeListener) => () => void
  getSnapshot: () => PlayerTimeSnapshot
  updateTime: (current: number, duration: number) => void
  reset: () => void
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
    updateTime(cur: number, dur: number) {
      const safeCur = Math.max(0, cur)
      const safeDur = Math.max(0, dur)
      const p =
        safeDur > 0
          ? Math.min(100, Math.max(0, (safeCur / safeDur) * 100))
          : 0

      // 避免无效触发
      if (
        Math.abs(snapshot.current - safeCur) < 0.05 &&
        snapshot.duration === safeDur
      ) {
        return
      }

      snapshot = {
        current: safeCur,
        duration: safeDur,
        progress: p,
        time: { current: safeCur, duration: safeDur },
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
