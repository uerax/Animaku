import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  defaultDanmakuSettings,
  defaultPlayerSettings,
  PLAYER_SPEEDS,
  type DanmakuSettings,
  type PlayerSettings,
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
}

export const defaultNavSettings: NavSettings = {
  showUserMenu: envBool(import.meta.env.VITE_NAV_SHOW_USER_MENU, true),
  showHistory: envBool(import.meta.env.VITE_NAV_SHOW_HISTORY, true),
  showThemeToggle: envBool(import.meta.env.VITE_NAV_SHOW_THEME_TOGGLE, true),
  showGitHub: envBool(import.meta.env.VITE_NAV_SHOW_GITHUB, true),
}

interface SettingsState {
  bangumiToken: string
  /** 管理员服务器代理授权口令（用于解锁媒体流代理出站） */
  proxyToken: string
  theme: AppTheme
  /** 封面图片源 host（默认取 .env 的 BANGUMI_IMAGE / VITE_BANGUMI_IMAGE_HOST） */
  bangumiImageHost: string
  danmaku: DanmakuSettings
  player: PlayerSettings
  nav: NavSettings
  setBangumiToken: (token: string) => void
  setProxyToken: (token: string) => void
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
    forceAdBlocker: Boolean(
      p.forceAdBlocker ?? defaultPlayerSettings.forceAdBlocker,
    ),
    // serverProxy is the new master switch; fall back to legacy forceMediaProxy
    // value so users upgrading don't silently lose their old preference.
    serverProxy: Boolean(
      (p as Record<string, unknown>).serverProxy ??
        (p as Record<string, unknown>).forceMediaProxy ??
        defaultPlayerSettings.serverProxy,
    ),
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
    (set) => ({
      bangumiToken: '',
      proxyToken: '',
      theme: DEFAULT_APP_THEME,
      bangumiImageHost: DEFAULT_BANGUMI_IMAGE_HOST,
      danmaku: { ...defaultDanmakuSettings },
      player: { ...defaultPlayerSettings },
      nav: { ...defaultNavSettings },
      setBangumiToken: (bangumiToken) => set({ bangumiToken }),
      setProxyToken: (proxyToken) => set({ proxyToken }),
      setBangumiImageHost: (raw) => {
        const bangumiImageHost = resolveBangumiImageHost(raw)
        // shared 状态先更新，再 set 触发重渲染 → 新 URL 立即生效
        setBangumiImageHostShared(bangumiImageHost)
        set({ bangumiImageHost })
      },
      setTheme: (theme) => {
        applyDocumentTheme(theme)
        set({ theme })
      },
      toggleTheme: () =>
        set((s) => {
          const theme: AppTheme = s.theme === 'light' ? 'dark' : 'light'
          applyDocumentTheme(theme)
          return { theme }
        }),
      setDanmaku: (partial) =>
        set((s) => ({ danmaku: { ...s.danmaku, ...partial } })),
      resetDanmaku: () => set({ danmaku: { ...defaultDanmakuSettings } }),
      setPlayer: (partial) =>
        set((s) => ({
          player: mergePlayer({ ...s.player, ...partial }),
        })),
      resetPlayer: () => set({ player: { ...defaultPlayerSettings } }),
      setNav: (partial) =>
        set((s) => ({ nav: { ...s.nav, ...partial } })),
      resetNav: () => set({ nav: { ...defaultNavSettings } }),
    }),
    {
      name: 'animaku-settings',
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted || {}) as Record<string, unknown>
        const player =
          p.player && typeof p.player === 'object'
            ? (p.player as Record<string, unknown>)
            : null
        if (version < 1) {
          // v0→v1: preferBangumiOped + autoNext defaults changed from true to false.
          if (player) {
            player.preferBangumiOped = false
            player.autoNext = false
          }
        }
        if (version < 2) {
          // v1→v2: forceMediaProxy renamed to serverProxy.
          if (player && 'forceMediaProxy' in player && !('serverProxy' in player)) {
            player.serverProxy = player.forceMediaProxy
            delete player.forceMediaProxy
          }
        }
        return persisted as Record<string, unknown>
      },
      storage: createJSONStorage(() =>
        createDebouncedStorage(SETTINGS_PERSIST_DEBOUNCE_MS),
      ),
      partialize: (s) => ({
        bangumiToken: s.bangumiToken,
        proxyToken: s.proxyToken,
        theme: s.theme,
        bangumiImageHost: s.bangumiImageHost,
        danmaku: s.danmaku,
        player: s.player,
        nav: s.nav,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<SettingsState>
        return {
          ...current,
          bangumiToken:
            typeof p.bangumiToken === 'string'
              ? p.bangumiToken
              : current.bangumiToken,
          proxyToken:
            typeof p.proxyToken === 'string'
              ? p.proxyToken
              : current.proxyToken,
          theme:
            p.theme === 'light' || p.theme === 'dark' ? p.theme : DEFAULT_APP_THEME,
          bangumiImageHost: resolveBangumiImageHost(p.bangumiImageHost),
          danmaku: {
            ...defaultDanmakuSettings,
            ...(p.danmaku && typeof p.danmaku === 'object' ? p.danmaku : {}),
          },
          player: mergePlayer(
            p.player && typeof p.player === 'object' ? p.player : undefined,
          ),
          nav: {
            ...defaultNavSettings,
            ...(p.nav && typeof p.nav === 'object' ? p.nav : {}),
          },
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

// Only seed default if index.html early script didn't already set data-theme.
if (
  typeof document !== 'undefined' &&
  !document.documentElement.getAttribute('data-theme')
) {
  applyDocumentTheme(DEFAULT_APP_THEME)
}
