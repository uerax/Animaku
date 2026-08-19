import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PluginMeta, PluginRule } from '@animaku/shared'
import { parsePluginRule, comparePluginOrder } from '@animaku/shared'
import { DEFAULT_PLUGIN_RULES } from '../data/default-plugins'
import { migrateLocalStorageKey } from '../lib/storage'

migrateLocalStorageKey('animaku-plugins', [
  'aniku-plugins',
  'kazumi-web-plugins',
])

/** Bump when built-in rule set changes so empty/legacy stores re-seed */
/** v8: default adBlocker only on MXdm; Anime1/otage/xifan off */
/** v9: add omofun (211dm/omofuns) built-in */
/** v10: Anime1 last (needs MEDIA_FULL_PROXY); HLS sources first */
/** v11: add pluginOrder for user-custom sorting */
/** v12: update built-in plugin rules (e.g. LIBVIO suggest API 403 -> xpath static search) */
/** v13: add xifan-next (next.xifanacg.com) built-in */
/** v14: fix xifan-next rule searchURL & searchMode definition */
/** v15: add weight to built-in rules (weight sorting > alphabetical; external rules default to lowest weight) */
/** v16: tune weights (xifan-next: 70, libvio/anime1: 60, mxdm: 55, default builtin: 50, external/third-party: 0) */
/** v17: reset legacy pluginOrder on defaults upgrade to enforce weight-first ordering */
/** v18: normalize all built-in plugin names and JSON files to lowercase */
/** v19: add preferOriginalTitle support (xifan-next, libvio, omofun prefer Japanese title) */
/** v20: add cycani (cycani.org) built-in */
/** v21: retire otage from default built-ins, set cycani weight to 70 */
/** v22: add tvtfun (tvtfun.net) built-in with weight 70 */
export const PLUGIN_DEFAULTS_VERSION = 22

interface PluginState {
  plugins: PluginMeta[]
  /** version of built-in defaults last applied (0 = never / legacy empty) */
  defaultsVersion: number
  /** User-defined display order of plugin names (first = default source). */
  pluginOrder: string[]
  importRule: (
    raw: unknown,
    opts?: { source?: PluginMeta['source']; enabled?: boolean },
  ) => PluginMeta
  removePlugin: (id: string) => void
  togglePlugin: (id: string, enabled?: boolean) => void
  /** Per-rule HLS ad filter */
  setPluginAdBlocker: (id: string, adBlocker: boolean) => void
  /** Per-rule media proxy toggle */
  setPluginProxy: (id: string, proxy: boolean) => void
  /** Reorder plugins by name list (first = top, becomes default). */
  setPluginOrder: (order: string[]) => void
  /** Get enabled plugins sorted by user order (or alphabetical fallback). */
  getEnabled: () => PluginMeta[]
  getByName: (name: string) => PluginMeta | undefined
  /** If store is empty, write built-in rules (safe to call often) */
  ensureDefaults: () => void
  resetToDefaults: () => void
}

function toMeta(
  rule: PluginRule,
  source: PluginMeta['source'] = 'import',
  enabled = true,
): PluginMeta {
  return {
    ...rule,
    id: `${rule.name}-${rule.version || '0'}`,
    enabled,
    proxy: rule.requiresFullMediaProxy === true ? true : undefined,
    importedAt: Date.now(),
    source,
  }
}

export function seedFromDefaults(): PluginMeta[] {
  const list = DEFAULT_PLUGIN_RULES.map((raw) => {
    try {
      return toMeta(parsePluginRule(raw), 'builtin', true)
    } catch {
      return toMeta(raw as PluginRule, 'builtin', true)
    }
  }).filter(
      (p) =>
        p.name &&
        p.baseURL &&
        (p.searchURL || p.searchMode === 'api' || p.searchApiConfig),
    )
  if (!list.length) {
    console.warn('[plugins] DEFAULT_PLUGIN_RULES produced empty list')
  }
  return [...list].sort(comparePluginOrder)
}

const BUILTIN_NAMES = new Set(
  DEFAULT_PLUGIN_RULES.map((r) => (r.name || '').toLowerCase()),
)

export function isBuiltinPlugin(plugin: PluginMeta): boolean {
  if (plugin.source === 'builtin') return true
  if (plugin.name && BUILTIN_NAMES.has(plugin.name.toLowerCase())) return true
  return false
}

/**
 * Default plugin order: weight descending > alphabetical by name.
 * Used as fallback when user has no custom `pluginOrder`.
 */
export function defaultPluginOrder(plugins: PluginMeta[]): string[] {
  const sorted = [...plugins].sort(comparePluginOrder)
  const seen = new Set<string>()
  const result: string[] = []
  for (const p of sorted) {
    const key = p.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(p.name)
    }
  }
  return result
}

function normalizePlugins(raw: unknown): PluginMeta[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (p): p is PluginMeta =>
      Boolean(p && typeof p === 'object' && typeof (p as PluginMeta).name === 'string'),
  )
}

/**
 * Sort plugins by stored order, falling back to weight > alphabetical.
 * Plugins not in the order list appear at the end, sorted by weight > alphabetical.
 */
function sortByOrder(plugins: PluginMeta[], order: string[]): PluginMeta[] {
  if (!order.length) {
    return [...plugins].sort(comparePluginOrder)
  }
  const rank = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    rank.set(order[i].toLowerCase(), i)
  }
  const withFallback = plugins.map((p, idx) => ({
    p,
    rank: rank.get(p.name.toLowerCase()) ?? order.length,
    idx,
  }))
  withFallback.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return comparePluginOrder(a.p, b.p)
  })
  return withFallback.map((w) => w.p)
}

export const usePluginStore = create<PluginState>()(
  persist(
    (set, get) => ({
      plugins: seedFromDefaults(),
      defaultsVersion: PLUGIN_DEFAULTS_VERSION,
      pluginOrder: [],
      importRule: (raw, opts) => {
        const rule = parsePluginRule(raw)
        const meta = toMeta(
          rule,
          opts?.source ?? 'import',
          opts?.enabled ?? true,
        )
        set((s) => {
          const prev = normalizePlugins(s.plugins)
          const existing = prev.find(
            (p) => p.name.toLowerCase() === meta.name.toLowerCase(),
          )
          if (existing && opts?.enabled === undefined) {
            meta.enabled = existing.enabled
          }
          const rest = prev.filter(
            (p) => p.name.toLowerCase() !== meta.name.toLowerCase(),
          )
          // If user has a custom pluginOrder, preserve the new rule at the end of custom order (or let fallback rank it)
          const newOrder = s.pluginOrder.slice()
          if (
            newOrder.length > 0 &&
            !newOrder.some((n) => n.toLowerCase() === meta.name.toLowerCase())
          ) {
            newOrder.push(meta.name)
          }
          return {
            plugins: [meta, ...rest],
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
            pluginOrder: newOrder,
          }
        })
        return meta
      },
      removePlugin: (id) =>
        set((s) => {
          const plugin = normalizePlugins(s.plugins).find((p) => p.id === id)
          if (plugin && isBuiltinPlugin(plugin)) return s
          return {
            plugins: normalizePlugins(s.plugins).filter((p) => p.id !== id),
            pluginOrder: plugin
              ? s.pluginOrder.filter(
                  (n) => n.toLowerCase() !== plugin.name.toLowerCase(),
                )
              : s.pluginOrder,
          }
        }),
      togglePlugin: (id, enabled) =>
        set((s) => ({
          plugins: normalizePlugins(s.plugins).map((p) =>
            p.id === id ? { ...p, enabled: enabled ?? !p.enabled } : p,
          ),
        })),
      setPluginAdBlocker: (id, adBlocker) =>
        set((s) => ({
          plugins: normalizePlugins(s.plugins).map((p) =>
            p.id === id ? { ...p, adBlocker } : p,
          ),
        })),
      setPluginProxy: (id, proxy) =>
        set((s) => ({
          plugins: normalizePlugins(s.plugins).map((p) =>
            p.id === id ? { ...p, proxy } : p,
          ),
        })),
      setPluginOrder: (order) => set({ pluginOrder: order.filter(Boolean) }),
      getEnabled: () => {
        const enabled = normalizePlugins(get().plugins).filter(
          (p) => p.enabled !== false,
        )
        const order = get().pluginOrder || []
        return sortByOrder(enabled, order)
      },
      getByName: (name) => {
        const key = name.toLowerCase()
        return normalizePlugins(get().plugins).find(
          (p) => p.name.toLowerCase() === key,
        )
      },
      ensureDefaults: () => {
        const plugins = normalizePlugins(get().plugins)
        const ver = get().defaultsVersion ?? 0
        // Empty → seed; version bump → re-seed only if still purely old built-ins
        // or empty. User-imported/catalog rules are kept.
        if (plugins.length === 0) {
          set({
            plugins: seedFromDefaults(),
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
          })
          return
        }
        // Already on current defaults version: still merge any *new* built-ins
        // and sync weights without touching user/catalog rules; apply new ordering strategy.
        if (ver >= PLUGIN_DEFAULTS_VERSION) {
          const seedByName = new Map(
            seedFromDefaults().map((p) => [p.name.toLowerCase(), p]),
          )
          const have = new Set(plugins.map((p) => p.name.toLowerCase()))
          const missing = seedFromDefaults().filter(
            (p) => !have.has(p.name.toLowerCase()),
          )
          let changed = missing.length > 0
          let next = plugins.map((p) => {
            if (p.source !== 'builtin' && p.source !== undefined) return p
            const seed = seedByName.get(p.name.toLowerCase())
            if (!seed) return p
            if (
              p.weight !== seed.weight ||
              p.preferOriginalTitle !== seed.preferOriginalTitle
            ) {
              changed = true
              return {
                ...p,
                weight: seed.weight,
                preferOriginalTitle: seed.preferOriginalTitle,
              }
            }
            return p
          })
          if (missing.length) next = [...next, ...missing]
          if (changed) {
            next = next.sort(comparePluginOrder)
            set({
              plugins: next,
              defaultsVersion: PLUGIN_DEFAULTS_VERSION,
            })
          }
          return
        }

        // Replace legacy default-only stores with current defaults.
        // v6: drop 7sefun from defaults, add ose (MacCMS / plaintext m3u8).
        // v7: add xifan (稀饭 MacCMS; suggest API search + player_aaaa).
        // v8: adBlocker defaults — only MXdm on among built-ins.
        // v9: add omofun (211dm / omofuns).
        // v10: Anime1 last (MEDIA_FULL_PROXY).
        // v11: pluginOrder for user sort.
        // v12: update built-in plugin rules (e.g. LIBVIO searchMode api -> xpath).
        // v13: add xifan-next (next.xifanacg.com).
        // v14: fix xifan-next rule searchURL & searchMode definition.
        // v15: add weight to built-in rules (weight sorting > alphabetical; external rules default to lowest weight).
        // v16: tune weights (xifan-next: 70, libvio/anime1: 60, mxdm: 55, default builtin: 50, external/third-party: 0).
        // v17: reset legacy pluginOrder on defaults upgrade to enforce weight-first ordering.
        // v20: add cycani (cycani.org).
        const legacyBuiltinNames = new Set(
          [
            '7sefun',
            'dm84',
            'enlie',
            'age',
            'gugu3',
            'mxdm',
            'anime1',
            'otage',
            'xifan',
            'xifan-next',
            'omofun',
            'libvio',
            'cycani',
            'tvtfun',
          ].map((s) => s.toLowerCase()),
        )
        const onlyLegacyBuiltins = plugins.every(
          (p) =>
            p.source === 'builtin' ||
            legacyBuiltinNames.has(p.name.toLowerCase()),
        )
        if (onlyLegacyBuiltins) {
          set({
            plugins: seedFromDefaults(),
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
            pluginOrder: [],
          })
          return
        }
        // Mixed store: add any new built-ins; drop retired default 7sefun/otage
        // only when it was backend marked builtin (user re-import keeps source=import).
        // Also align *builtin* rule definitions and adBlocker/proxy flags to current
        // DEFAULT_PLUGIN_RULES without overwriting user/catalog rules.
        const seedByName = new Map(
          seedFromDefaults().map((p) => [p.name.toLowerCase(), p]),
        )
        const have = new Set(plugins.map((p) => p.name.toLowerCase()))
        const missing = seedFromDefaults().filter(
          (p) => !have.has(p.name.toLowerCase()),
        )
        let next = plugins.filter(
          (p) =>
            !(
              (p.name.toLowerCase() === '7sefun' || p.name.toLowerCase() === 'otage') &&
              (p.source === 'builtin' || p.source === undefined)
            ),
        )
        next = next.map((p) => {
          if (p.source !== 'builtin' && p.source !== undefined) return p
          const seed = seedByName.get(p.name.toLowerCase())
          if (!seed) return p
          return {
            ...seed,
            enabled: p.enabled ?? seed.enabled,
            adBlocker: p.adBlocker ?? Boolean(seed.adBlocker),
            proxy: p.proxy ?? (seed.requiresFullMediaProxy === true ? true : undefined),
            importedAt: p.importedAt ?? seed.importedAt,
          }
        })
        if (missing.length) next = [...next, ...missing]
        next = next.sort(comparePluginOrder)
        set({
          plugins: next,
          defaultsVersion: PLUGIN_DEFAULTS_VERSION,
          pluginOrder: [],
        })
      },
      resetToDefaults: () => {
        set({
          plugins: seedFromDefaults(),
          defaultsVersion: PLUGIN_DEFAULTS_VERSION,
          pluginOrder: [],
        })
      },
    }),
    {
      name: 'animaku-plugins',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        plugins: s.plugins,
        defaultsVersion: s.defaultsVersion,
        pluginOrder: s.pluginOrder,
      }),
      migrate: (persisted, fromVersion) => {
        const p = (persisted || {}) as {
          plugins?: unknown
          defaultsVersion?: number
          _seeded?: boolean
          pluginOrder?: string[]
        }
        let plugins = normalizePlugins(p.plugins)
        const wasEmpty = plugins.length === 0
        // v0 / legacy empty list → seed
        if (wasEmpty || fromVersion < 1) {
          if (wasEmpty) plugins = seedFromDefaults()
        }
        const persistedVer =
          typeof p.defaultsVersion === 'number' && Number.isFinite(p.defaultsVersion)
            ? p.defaultsVersion
            : 0
        // Preserve version so ensureDefaults can migrate builtins; only stomp
        // current when we just seeded an empty store.
        return {
          plugins,
          defaultsVersion: wasEmpty ? PLUGIN_DEFAULTS_VERSION : persistedVer,
        }
      },
      merge: (persisted, current) => {
        if (persisted == null) {
          return {
            ...current,
            plugins: seedFromDefaults(),
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
            pluginOrder: [],
          }
        }
        const p = persisted as Partial<PluginState> & { _seeded?: boolean }
        let plugins = normalizePlugins(p.plugins)
        // Empty after rehydrate (old empty localStorage) → seed
        const wasEmpty = plugins.length === 0
        if (wasEmpty) {
          plugins = seedFromDefaults()
        }
        // One-time default: full-proxy sources get proxy=true when unset.
        plugins = plugins.map((pl) =>
          pl.proxy === undefined && pl.requiresFullMediaProxy === true
            ? { ...pl, proxy: true }
            : pl,
        )
        const persistedVer =
          typeof p.defaultsVersion === 'number' && Number.isFinite(p.defaultsVersion)
            ? p.defaultsVersion
            : 0
        return {
          ...current,
          plugins,
          defaultsVersion: wasEmpty ? PLUGIN_DEFAULTS_VERSION : persistedVer,
          pluginOrder: Array.isArray(p.pluginOrder) ? p.pluginOrder : [],
        }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[plugins] rehydrate failed', error)
        }
        // Always fix empty after rehydrate
        state?.ensureDefaults()
      },
    },
  ),
)

/** Call once at app boot so empty localStorage is fixed before any page reads store */
export function bootstrapPlugins() {
  try {
    usePluginStore.persist.rehydrate?.()
  } catch {
    /* ignore */
  }
  usePluginStore.getState().ensureDefaults()
}
