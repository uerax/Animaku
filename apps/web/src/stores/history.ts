import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { WatchHistoryEntry } from '@animaku/shared'
import { historyId } from '@animaku/shared'
import { createDebouncedStorage } from '../lib/debounced-storage'
import { migrateLocalStorageKey } from '../lib/storage'

migrateLocalStorageKey('animaku-history', [
  'aniku-history',
  'kazumi-web-history',
])

/** Cap persisted history rows */
const MAX_ITEMS = 200
/** Debounce localStorage writes (progress ticks are frequent) */
const PERSIST_DEBOUNCE_MS = 12_000

interface HistoryState {
  items: WatchHistoryEntry[]
  upsert: (
    entry: Omit<WatchHistoryEntry, 'id' | 'updatedAt'> & { id?: string },
  ) => void
  remove: (id: string) => void
  removeMany: (ids: string[]) => void
  clear: () => void
  get: (id: string) => WatchHistoryEntry | undefined
  forBangumi: (bangumiId: number) => WatchHistoryEntry | undefined
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      upsert: (entry) => {
        const id =
          entry.id ||
          historyId(
            entry.bangumiId,
            entry.pluginName,
            entry.episode,
            entry.road,
          )
        const full: WatchHistoryEntry = {
          ...entry,
          id,
          updatedAt: Date.now(),
        }
        set((s) => {
          const prev = Array.isArray(s.items) ? s.items : []
          // Newest-first: 同一番剧的同一集数只保留一条最新记录（不区分 plugin，保存最后看的那个源）
          const rest: WatchHistoryEntry[] = []
          for (const i of prev) {
            const isSameBangumiAndEp =
              i.bangumiId === entry.bangumiId && i.episode === entry.episode
            if (i.id !== id && !isSameBangumiAndEp) {
              rest.push(i)
            }
          }
          return {
            items: [full, ...rest].slice(0, MAX_ITEMS),
          }
        })
      },
      remove: (id) =>
        set((s) => ({
          items: (Array.isArray(s.items) ? s.items : []).filter(
            (i) => i.id !== id,
          ),
        })),
      removeMany: (ids) => {
        if (!ids || ids.length === 0) return
        const setIds = new Set(ids)
        set((s) => ({
          items: (Array.isArray(s.items) ? s.items : []).filter(
            (i) => !setIds.has(i.id),
          ),
        }))
      },
      clear: () => set({ items: [] }),
      get: (id) => {
        const items = get().items
        return (Array.isArray(items) ? items : []).find((i) => i.id === id)
      },
      forBangumi: (bangumiId) => {
        const items = get().items
        return (Array.isArray(items) ? items : []).find(
          (i) => i.bangumiId === bangumiId,
        )
      },
    }),
    {
      name: 'animaku-history',
      storage: createJSONStorage(() => createDebouncedStorage(PERSIST_DEBOUNCE_MS)),
      partialize: (s) => ({ items: s.items }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<HistoryState>
        const rawItems = Array.isArray(p.items) ? p.items : current.items
        // 一次性无感收敛历史旧数据：同一番剧同一集数仅保留最新一条记录（不区分 plugin，消除同集多源冗余）
        const seen = new Set<string>()
        const deduplicated: WatchHistoryEntry[] = []
        for (const item of rawItems) {
          if (!item || !item.bangumiId) continue
          const key = `${item.bangumiId}::ep${item.episode ?? 1}`
          if (!seen.has(key)) {
            seen.add(key)
            deduplicated.push({
              ...item,
              id: historyId(
                item.bangumiId,
                item.pluginName,
                item.episode ?? 1,
                item.road ?? 0,
              ),
            })
          }
        }
        return {
          ...current,
          items: deduplicated.slice(0, MAX_ITEMS),
        }
      },
    },
  ),
)
