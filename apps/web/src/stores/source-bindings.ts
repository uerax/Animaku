import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { bestTitleSimilarity } from '@animaku/shared'
import { migrateLocalStorageKey } from '../lib/storage'

migrateLocalStorageKey('animaku-source-bindings', [
  'aniku-source-bindings',
  'kazumi-source-bindings',
])

const MAX_BINDINGS = 1000
const MIN_PERSIST_SIMILARITY = 0.5

export interface SourceBindingEntry {
  bangumiId: number
  pluginName: string
  sourceUrl: string
  title: string
  similarity?: number
  isManual?: boolean
  /** Relative offset for danmaku episode alignment (e.g. -1 for prologue shift) */
  danmakuOffset?: number
  updatedAt: number
}

export interface SourceBindingState {
  bindings: Record<string, SourceBindingEntry>
  getBinding: (bangumiId: number, pluginName: string) => SourceBindingEntry | undefined
  setBinding: (
    bangumiId: number,
    pluginName: string,
    entry: { sourceUrl: string; title: string; similarity?: number; isManual?: boolean; danmakuOffset?: number },
    referenceTitles?: Array<string | null | undefined>,
    isManual?: boolean,
  ) => boolean
  setDanmakuOffset: (
    bangumiId: number,
    pluginName: string,
    offset: number,
  ) => void
  removeBinding: (bangumiId: number, pluginName: string) => void
  clearBindings: () => void
}

function makeKey(bangumiId: number, pluginName: string): string {
  return `${bangumiId}:${pluginName}`
}

function enforceLRU(
  dict: Record<string, SourceBindingEntry>,
  maxItems: number,
): Record<string, SourceBindingEntry> {
  const keys = Object.keys(dict)
  if (keys.length <= maxItems) return dict

  // Sort by updatedAt ascending (oldest first)
  const entries = Object.entries(dict).sort(
    ([, a], [, b]) => (a.updatedAt || 0) - (b.updatedAt || 0),
  )

  const toRemove = entries.length - maxItems
  const next = { ...dict }
  for (let i = 0; i < toRemove; i++) {
    delete next[entries[i][0]]
  }
  return next
}

export const useSourceBindingStore = create<SourceBindingState>()(
  persist(
    (set, get) => ({
      bindings: {},

      getBinding: (bangumiId, pluginName) => {
        if (!Number.isFinite(bangumiId) || !pluginName) return undefined
        const key = makeKey(bangumiId, pluginName)
        const binding = get().bindings[key]
        if (!binding) return undefined

        // Fast update touch in memory / persist on access if needed
        return binding
      },

      setBinding: (bangumiId, pluginName, entry, referenceTitles, isManual) => {
        if (!Number.isFinite(bangumiId) || !pluginName || !entry.sourceUrl) {
          return false
        }

        const manual = Boolean(isManual || entry.isManual)
        let sim = entry.similarity
        if (
          sim === undefined &&
          referenceTitles &&
          referenceTitles.some((t) => Boolean(t?.trim()))
        ) {
          sim = bestTitleSimilarity(entry.title, referenceTitles)
        }

        // Silent contamination gatekeeper:
        // Only block unverified automated guesses with low similarity (< 0.50).
        // User manual picks (isManual = true) are always trusted and persisted!
        if (!manual && sim !== undefined && sim < MIN_PERSIST_SIMILARITY) {
          return false
        }

        const key = makeKey(bangumiId, pluginName)
        const existing = get().bindings[key]
        const newEntry: SourceBindingEntry = {
          bangumiId,
          pluginName,
          sourceUrl: entry.sourceUrl.trim(),
          title: entry.title.trim(),
          similarity: sim,
          isManual: manual,
          danmakuOffset: entry.danmakuOffset !== undefined ? entry.danmakuOffset : existing?.danmakuOffset,
          updatedAt: Date.now(),
        }

        set((state) => {
          const updated = {
            ...state.bindings,
            [key]: newEntry,
          }
          return {
            bindings: enforceLRU(updated, MAX_BINDINGS),
          }
        })

        return true
      },

      setDanmakuOffset: (bangumiId, pluginName, offset) => {
        if (!Number.isFinite(bangumiId) || !pluginName) return
        const key = makeKey(bangumiId, pluginName)
        const existing = get().bindings[key]

        if (!existing && (!offset || offset === 0)) {
          return
        }

        const newEntry: SourceBindingEntry = existing
          ? {
              ...existing,
              danmakuOffset: offset !== 0 ? offset : undefined,
              updatedAt: Date.now(),
            }
          : {
              bangumiId,
              pluginName,
              sourceUrl: '',
              title: '',
              isManual: true,
              danmakuOffset: offset !== 0 ? offset : undefined,
              updatedAt: Date.now(),
            }

        set((state) => {
          const updated = {
            ...state.bindings,
            [key]: newEntry,
          }
          return {
            bindings: enforceLRU(updated, MAX_BINDINGS),
          }
        })
      },

      removeBinding: (bangumiId, pluginName) => {
        const key = makeKey(bangumiId, pluginName)
        set((state) => {
          if (!(key in state.bindings)) return state
          const next = { ...state.bindings }
          delete next[key]
          return { bindings: next }
        })
      },

      clearBindings: () => {
        set({ bindings: {} })
      },
    }),
    {
      name: 'animaku-source-bindings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ bindings: s.bindings }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<SourceBindingState>
        return {
          ...current,
          bindings:
            p.bindings && typeof p.bindings === 'object'
              ? p.bindings
              : current.bindings,
        }
      },
    },
  ),
)
