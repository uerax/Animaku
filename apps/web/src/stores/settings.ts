import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  defaultDanmakuSettings,
  defaultPlayerSettings,
  PLAYER_SPEEDS,
  type DanmakuSettings,
  type PlayerSettings,
  type SiteDefaultSettings,
  setBangumiImageHost as setBangumiImageHostShared,
} from '@animaku/shared'
import { createDebouncedStorage } from '../lib/debounced-storage'
import { migrateLocalStorageKey } from '../lib/storage'
import {
  DEFAULT_BANGUMI_IMAGE_HOST,
  resolveBangumiImageHost,
} from '../lib/bangumi-image-host'

/** Debounce settings disk writes (volume scrub / slider spam). */
const SETTINGS_PERSIST_DEBOUNCE_MS = 800

migrateLocalStorageKey('animaku-settings', [
  'aniku-settings',
])

export type AppTheme = 'dark' | 'light'

function envBool(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return fallback
  const s = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(s)) return true
  if (['0', 'false', 'no', 'off'].includes(s)) return false
  return fallback
}

function envTheme(raw: unknown, fallback: AppTheme): AppTheme {
  if (raw === undefined || raw === null || raw === '') return fallback
  const s = String(raw).trim().toLowerCase()
  if (s === 'dark' || s === 'light') return s
  return fallback
}

export const DEFAULT_APP_THEME: AppTheme = envTheme(
  import.meta.env.VITE_DEFAULT_THEME,
  'light',
)

export interface NavSettings {
  showUserMenu: boolean
  showHistory: boolean
  showThemeToggle: boolean
  showGitHub: boolean
  /** 点击番剧卡片是否在新标签页打开（默认 true，方便淘番保留列表浏览进度） */
  openInNewTab: boolean
}

export const defaultNavSettings: NavSettings = {
  showUserMenu: envBool(import.meta.env.VITE_NAV_SHOW_USER_MENU, true),
  showHistory: envBool(import.meta.env.VITE_NAV_SHOW_HISTORY, true),
  showThemeToggle: envBool(import.meta.env.VITE_NAV_SHOW_THEME_TOGGLE, true),
  showGitHub: envBool(import.meta.env.VITE_NAV_SHOW_GITHUB, true),
  openInNewTab: envBool(import.meta.env.VITE_NAV_OPEN_IN_NEW_TAB, true),
}

export interface CustomizedFlags {
  theme?: boolean
  bangumiImageHost?: boolean
  danmaku?: boolean
  player?: boolean
  nav?: boolean
}

export function getSiteDefaults(): SiteDefaultSettings | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem('animaku-site-config-cache')
    if (raw) {
      const parsed = JSON.parse(raw) as { defaultSettings?: SiteDefaultSettings }
      return parsed.defaultSettings || null
    }
  } catch {}
  return null
}

export function getEffectiveDefaultPlayerSettings(defaults?: SiteDefaultSettings | null): PlayerSettings {
  const d = defaults ?? getSiteDefaults()
  const dp = d?.player
  if (!dp) return { ...defaultPlayerSettings }
  return {
    ...defaultPlayerSettings,
    ...(dp.speed !== undefined ? { speed: clampPlayerSpeed(dp.speed) } : {}),
    ...(dp.autoplay !== undefined ? { autoplay: Boolean(dp.autoplay) } : {}),
    ...(dp.autoNext !== undefined ? { autoNext: Boolean(dp.autoNext) } : {}),
    ...(dp.continuePlay !== undefined ? { continuePlay: Boolean(dp.continuePlay) } : {}),
    ...(dp.customSeekTime !== undefined ? { customSeekTime: dp.customSeekTime } : {}),
    ...(dp.superResolution !== undefined ? { superResolution: dp.superResolution } : {}),
    ...(dp.preferBangumiOped !== undefined ? { preferBangumiOped: Boolean(dp.preferBangumiOped) } : {}),
    ...(dp.firstEpisodeProtect !== undefined ? { firstEpisodeProtect: Boolean(dp.firstEpisodeProtect) } : {}),
    skipOp: {
      ...defaultPlayerSettings.skipOp,
      ...(dp.skipOp || {}),
    },
    skipEd: {
      ...defaultPlayerSettings.skipEd,
      ...(dp.skipEd || {}),
    },
  }
}

export function getEffectiveDefaultDanmakuSettings(defaults?: SiteDefaultSettings | null): DanmakuSettings {
  const d = defaults ?? getSiteDefaults()
  const dd = d?.danmaku
  if (!dd) return { ...defaultDanmakuSettings }
  return {
    ...defaultDanmakuSettings,
    ...(dd.enabled !== undefined ? { enabled: Boolean(dd.enabled) } : {}),
    ...(dd.opacity !== undefined ? { opacity: dd.opacity } : {}),
    ...(dd.fontSize !== undefined ? { fontSize: dd.fontSize } : {}),
    ...(dd.speed !== undefined ? { speed: dd.speed } : {}),
    ...(dd.area !== undefined ? { area: dd.area } : {}),
    ...(dd.showTop !== undefined ? { showTop: Boolean(dd.showTop) } : {}),
    ...(dd.showBottom !== undefined ? { showBottom: Boolean(dd.showBottom) } : {}),
    ...(dd.showScroll !== undefined ? { showScroll: Boolean(dd.showScroll) } : {}),
    ...(dd.showColor !== undefined ? { showColor: Boolean(dd.showColor) } : {}),
    ...(dd.simplify !== undefined ? { simplify: Boolean(dd.simplify) } : {}),
    ...(Array.isArray(dd.filters) ? { filters: dd.filters } : {}),
  }
}

export function getEffectiveDefaultNavSettings(defaults?: SiteDefaultSettings | null): NavSettings {
  const d = defaults ?? getSiteDefaults()
  const dn = d?.nav
  if (!dn) return { ...defaultNavSettings }
  return {
    ...defaultNavSettings,
    ...(dn.showUserMenu !== undefined ? { showUserMenu: Boolean(dn.showUserMenu) } : {}),
    ...(dn.showHistory !== undefined ? { showHistory: Boolean(dn.showHistory) } : {}),
    ...(dn.showThemeToggle !== undefined ? { showThemeToggle: Boolean(dn.showThemeToggle) } : {}),
    ...(dn.showGitHub !== undefined ? { showGitHub: Boolean(dn.showGitHub) } : {}),
    ...(dn.openInNewTab !== undefined ? { openInNewTab: Boolean(dn.openInNewTab) } : {}),
  }
}

export function getEffectiveDefaultTheme(defaults?: SiteDefaultSettings | null): AppTheme {
  const d = defaults ?? getSiteDefaults()
  if (d?.theme === 'light' || d?.theme === 'dark') return d.theme
  return DEFAULT_APP_THEME
}

export function getEffectiveDefaultBangumiImageHost(defaults?: SiteDefaultSettings | null): string {
  const d = defaults ?? getSiteDefaults()
  if (d?.bangumiImageHost) return resolveBangumiImageHost(d.bangumiImageHost)
  return DEFAULT_BANGUMI_IMAGE_HOST
}

interface SettingsState {
  bangumiToken: string
  theme: AppTheme
  /** 封面图片源 host（默认取 .env 的 BANGUMI_IMAGE / VITE_BANGUMI_IMAGE_HOST） */
  bangumiImageHost: string
  danmaku: DanmakuSettings
  player: PlayerSettings
  nav: NavSettings
  customized?: CustomizedFlags
  setBangumiToken: (token: string) => void
  setBangumiImageHost: (host: string) => void
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
  setDanmaku: (partial: Partial<DanmakuSettings>) => void
  resetDanmaku: () => void
  setPlayer: (partial: Partial<PlayerSettings>) => void
  resetPlayer: () => void
  setNav: (partial: Partial<NavSettings>) => void
  resetNav: () => void
}

/** Apply theme to <html> for CSS tokens + native color-scheme. */
export function applyDocumentTheme(theme: AppTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
}

const PLAYER_SPEED_MIN = PLAYER_SPEEDS[0]
const PLAYER_SPEED_MAX = PLAYER_SPEEDS[PLAYER_SPEEDS.length - 1]

function clampPlayerSpeed(speed: unknown): number {
  const n = typeof speed === 'number' && Number.isFinite(speed) ? speed : 1
  return Math.min(PLAYER_SPEED_MAX, Math.max(PLAYER_SPEED_MIN, n))
}

function mergePlayer(partial?: Partial<PlayerSettings>): PlayerSettings {
  const p = partial && typeof partial === 'object' ? partial : {}
  const sr = p.superResolution
  const superResolution =
    sr === 'efficiency' || sr === 'quality' || sr === 'off'
      ? sr
      : defaultPlayerSettings.superResolution
  // Drop legacy playLayout if present in localStorage (unified WatchPage only).
  const { playLayout: _legacyLayout, ...rest } = p as Partial<PlayerSettings> & {
    playLayout?: unknown
  }
  void _legacyLayout
  return {
    ...defaultPlayerSettings,
    ...rest,
    speed: clampPlayerSpeed(rest.speed ?? defaultPlayerSettings.speed),
    superResolution,
    preferBangumiOped: Boolean(
      p.preferBangumiOped ?? defaultPlayerSettings.preferBangumiOped,
    ),
    firstEpisodeProtect: Boolean(
      p.firstEpisodeProtect ?? defaultPlayerSettings.firstEpisodeProtect,
    ),
    skipOp: {
      ...defaultPlayerSettings.skipOp,
      ...(p.skipOp && typeof p.skipOp === 'object' ? p.skipOp : {}),
    },
    skipEd: {
      ...defaultPlayerSettings.skipEd,
      ...(p.skipEd && typeof p.skipEd === 'object' ? p.skipEd : {}),
    },
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => {
      const initialSiteDefaults = getSiteDefaults()
      return {
        bangumiToken: '',
        theme: getEffectiveDefaultTheme(initialSiteDefaults),
        bangumiImageHost: getEffectiveDefaultBangumiImageHost(initialSiteDefaults),
        danmaku: getEffectiveDefaultDanmakuSettings(initialSiteDefaults),
        player: getEffectiveDefaultPlayerSettings(initialSiteDefaults),
        nav: getEffectiveDefaultNavSettings(initialSiteDefaults),
        customized: {},
        setBangumiToken: (bangumiToken) => set({ bangumiToken }),
        setBangumiImageHost: (raw) => {
          const bangumiImageHost = resolveBangumiImageHost(raw)
          // shared 状态先更新，再 set 触发重渲染 → 新 URL 立即生效
          setBangumiImageHostShared(bangumiImageHost)
          set((s) => ({
            bangumiImageHost,
            customized: { ...s.customized, bangumiImageHost: true },
          }))
        },
        setTheme: (theme) => {
          applyDocumentTheme(theme)
          set((s) => ({
            theme,
            customized: { ...s.customized, theme: true },
          }))
        },
        toggleTheme: () =>
          set((s) => {
            const theme: AppTheme = s.theme === 'light' ? 'dark' : 'light'
            applyDocumentTheme(theme)
            return {
              theme,
              customized: { ...s.customized, theme: true },
            }
          }),
        setDanmaku: (partial) =>
          set((s) => ({
            danmaku: { ...s.danmaku, ...partial },
            customized: { ...s.customized, danmaku: true },
          })),
        resetDanmaku: () =>
          set((s) => ({
            danmaku: getEffectiveDefaultDanmakuSettings(),
            customized: { ...s.customized, danmaku: false },
          })),
        setPlayer: (partial) =>
          set((s) => ({
            player: mergePlayer({ ...s.player, ...partial }),
            customized: { ...s.customized, player: true },
          })),
        resetPlayer: () =>
          set((s) => ({
            player: getEffectiveDefaultPlayerSettings(),
            customized: { ...s.customized, player: false },
          })),
        setNav: (partial) =>
          set((s) => ({
            nav: { ...s.nav, ...partial },
            customized: { ...s.customized, nav: true },
          })),
        resetNav: () =>
          set((s) => ({
            nav: getEffectiveDefaultNavSettings(),
            customized: { ...s.customized, nav: false },
          })),
      }
    },
    {
      name: 'animaku-settings',
      version: 3,
      migrate: (persisted, version) => {
        const p = (persisted || {}) as Record<string, unknown>
        const player =
          p.player && typeof p.player === 'object'
            ? (p.player as Record<string, unknown>)
            : null
        const nav =
          p.nav && typeof p.nav === 'object'
            ? (p.nav as Record<string, unknown>)
            : null
        if (version < 1) {
          // v0→v1: preferBangumiOped + autoNext defaults changed from true to false.
          if (player) {
            player.preferBangumiOped = false
            player.autoNext = false
          }
        }
        if (version < 2) {
          if (player) {
            delete player.forceMediaProxy
            delete player.serverProxy
            delete player.forceAdBlocker
          }
        }
        if (version < 3) {
          // v2→v3: showUserMenu introduced. Reset old v2 cache to adopt site's defaultNavSettings.showUserMenu
          if (nav && 'showUserMenu' in nav) {
            delete nav.showUserMenu
          }
        }
        return persisted as Record<string, unknown>
      },
      storage: createJSONStorage(() =>
        createDebouncedStorage(SETTINGS_PERSIST_DEBOUNCE_MS),
      ),
      partialize: (s) => ({
        bangumiToken: s.bangumiToken,
        theme: s.theme,
        bangumiImageHost: s.bangumiImageHost,
        danmaku: s.danmaku,
        player: s.player,
        nav: s.nav,
        customized: s.customized,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<SettingsState>
        const siteDefaults = getSiteDefaults()
        const customized = p.customized || {}

        // Theme: if user customized, use saved. Otherwise use site default.
        const effectiveTheme =
          customized.theme && (p.theme === 'light' || p.theme === 'dark')
            ? p.theme
            : getEffectiveDefaultTheme(siteDefaults)

        // Image Host: if user customized, use saved. Otherwise use site default.
        const effectiveImageHost =
          customized.bangumiImageHost && p.bangumiImageHost
            ? resolveBangumiImageHost(p.bangumiImageHost)
            : getEffectiveDefaultBangumiImageHost(siteDefaults)

        // Danmaku: if user customized, merge user's danmaku. Otherwise use site default danmaku.
        const effectiveDanmaku =
          customized.danmaku && p.danmaku && typeof p.danmaku === 'object'
            ? {
                ...getEffectiveDefaultDanmakuSettings(siteDefaults),
                ...p.danmaku,
              }
            : getEffectiveDefaultDanmakuSettings(siteDefaults)

        // Player: if user customized, merge user's player. Otherwise use site default player.
        const effectivePlayer =
          customized.player && p.player && typeof p.player === 'object'
            ? mergePlayer(p.player)
            : getEffectiveDefaultPlayerSettings(siteDefaults)

        // Nav: if user customized, merge user's nav. Otherwise use site default nav.
        const effectiveNav =
          customized.nav && p.nav && typeof p.nav === 'object'
            ? {
                ...getEffectiveDefaultNavSettings(siteDefaults),
                ...p.nav,
              }
            : getEffectiveDefaultNavSettings(siteDefaults)

        return {
          ...current,
          bangumiToken:
            typeof p.bangumiToken === 'string'
              ? p.bangumiToken
              : current.bangumiToken,
          theme: effectiveTheme,
          bangumiImageHost: effectiveImageHost,
          danmaku: effectiveDanmaku,
          player: effectivePlayer,
          nav: effectiveNav,
          customized,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyDocumentTheme(state.theme)
        // 水合后同步 shared 模块状态（此前用的是 .env 默认）
        setBangumiImageHostShared(resolveBangumiImageHost(state?.bangumiImageHost))
      },
    },
  ),
)

export function applySiteDefaultsIfUncustomized(defaults: SiteDefaultSettings) {
  const state = useSettingsStore.getState()
  const customized = state.customized || {}
  const updates: Partial<SettingsState> = {}

  if (!customized.theme && defaults.theme) {
    updates.theme = defaults.theme
    applyDocumentTheme(defaults.theme)
  }
  if (!customized.bangumiImageHost && defaults.bangumiImageHost) {
    const host = resolveBangumiImageHost(defaults.bangumiImageHost)
    setBangumiImageHostShared(host)
    updates.bangumiImageHost = host
  }
  if (!customized.player && defaults.player) {
    updates.player = getEffectiveDefaultPlayerSettings(defaults)
  }
  if (!customized.danmaku && defaults.danmaku) {
    updates.danmaku = getEffectiveDefaultDanmakuSettings(defaults)
  }
  if (!customized.nav && defaults.nav) {
    updates.nav = getEffectiveDefaultNavSettings(defaults)
  }

  if (Object.keys(updates).length > 0) {
    useSettingsStore.setState(updates)
  }
}

// Only seed default if index.html early script didn't already set data-theme.
if (
  typeof document !== 'undefined' &&
  !document.documentElement.getAttribute('data-theme')
) {
  applyDocumentTheme(DEFAULT_APP_THEME)
}
