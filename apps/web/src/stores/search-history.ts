import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateLocalStorageKey } from '../lib/storage'

migrateLocalStorageKey('animaku-search-history', [
  'kazumi-search-history',
  'aniku-search-history',
])

const MAX_SEARCH_HISTORY_ITEMS = 15

export interface SearchHistoryState {
  /** 历史搜索关键词列表（由新到旧排列） */
  queries: string[]
  /** 添加/更新一条搜索关键词（置顶、去重并限制条数） */
  addSearch: (query: string) => void
  /** 删除单条历史搜索词 */
  removeSearch: (query: string) => void
  /** 清空全部搜索历史 */
  clearAll: () => void
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      queries: [],

      addSearch: (query: string) => {
        const trimmed = query.trim()
        if (!trimmed) return

        set((state) => {
          const next = [trimmed, ...state.queries.filter((item) => item !== trimmed)]
          return {
            queries: next.slice(0, MAX_SEARCH_HISTORY_ITEMS),
          }
        })
      },

      removeSearch: (query: string) => {
        set((state) => ({
          queries: state.queries.filter((item) => item !== query),
        }))
      },

      clearAll: () => {
        set({ queries: [] })
      },
    }),
    {
      name: 'animaku-search-history',
    },
  ),
)
