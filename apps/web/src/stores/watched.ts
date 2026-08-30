import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { WatchedEpisodesMap } from '@animaku/shared'
import { migrateLocalStorageKey } from '../lib/storage'

migrateLocalStorageKey('animaku-watched-episodes', [
  'aniku-watched-episodes',
  'kazumi-watched-episodes',
])

export interface WatchedState {
  /** Map: bangumiId -> { [canonicalEp: number]: timestamp } */
  records: WatchedEpisodesMap
  /** 标记某番剧的某集为已看 */
  markWatched: (bangumiId: number, episode: number) => void
  /** 取消某番剧某集的已看状态 */
  unmarkWatched: (bangumiId: number, episode: number) => void
  /** 切换某集的已看状态 */
  toggleWatched: (bangumiId: number, episode: number) => void
  /** 清空某部番剧的所有已看记录 */
  clearBangumi: (bangumiId: number) => void
  /** 清空所有番剧的已看记录 */
  clearAll: () => void
  /** 查询某番剧某集是否已看 */
  isWatched: (bangumiId: number, episode: number) => boolean
  /** 获取某部番剧已看集数列表 */
  getWatchedEpisodes: (bangumiId: number) => number[]
}

export const useWatchedStore = create<WatchedState>()(
  persist(
    (set, get) => ({
      records: {},

      markWatched: (bangumiId, episode) => {
        if (
          !Number.isFinite(bangumiId) ||
          bangumiId <= 0 ||
          typeof episode !== 'number' ||
          !Number.isFinite(episode) ||
          episode < 0
        ) {
          return
        }

        set((state) => {
          const prevMap = state.records[bangumiId] || {}
          if (prevMap[episode]) return state

          return {
            records: {
              ...state.records,
              [bangumiId]: {
                ...prevMap,
                [episode]: Date.now(),
              },
            },
          }
        })
      },

      unmarkWatched: (bangumiId, episode) => {
        if (!bangumiId || typeof episode !== 'number') return
        set((state) => {
          const prevMap = state.records[bangumiId]
          if (!prevMap || prevMap[episode] === undefined) return state

          const nextMap = { ...prevMap }
          delete nextMap[episode]

          // If no episodes remain for this bangumi, clean up the bangumi key
          const nextRecords = { ...state.records }
          if (Object.keys(nextMap).length === 0) {
            delete nextRecords[bangumiId]
          } else {
            nextRecords[bangumiId] = nextMap
          }

          return { records: nextRecords }
        })
      },

      toggleWatched: (bangumiId, episode) => {
        const watched = get().isWatched(bangumiId, episode)
        if (watched) {
          get().unmarkWatched(bangumiId, episode)
        } else {
          get().markWatched(bangumiId, episode)
        }
      },

      clearBangumi: (bangumiId) => {
        if (!bangumiId) return
        set((state) => {
          if (!state.records[bangumiId]) return state
          const nextRecords = { ...state.records }
          delete nextRecords[bangumiId]
          return { records: nextRecords }
        })
      },

      clearAll: () => {
        set({ records: {} })
      },

      isWatched: (bangumiId, episode) => {
        if (!bangumiId || typeof episode !== 'number') return false
        const bgmMap = get().records[bangumiId]
        return Boolean(bgmMap && bgmMap[episode] !== undefined)
      },

      getWatchedEpisodes: (bangumiId) => {
        if (!bangumiId) return []
        const bgmMap = get().records[bangumiId]
        if (!bgmMap) return []
        return Object.keys(bgmMap).map(Number).sort((a, b) => a - b)
      },
    }),
    {
      name: 'animaku-watched-episodes',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ records: s.records }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<WatchedState>
        return {
          ...current,
          records: p.records && typeof p.records === 'object' ? p.records : {},
        }
      },
    },
  ),
)
