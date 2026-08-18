import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from 'react'
import type { PointerMode } from './usePointerMode'

export interface ShellPointerHandlerApi {
  togglePlay: () => void
  toggleFs: () => void
  bumpBar: () => void
  hideBar: () => void
  showBarRef: MutableRefObject<boolean>
  /** Close speed / SR menus if open; return true if something was closed. */
  closeMenus: () => boolean
  /** Close danmaku panel if open; return true if closed. */
  closePanel: () => boolean
  /** When false, desktop mouseleave keeps the bar (paused). */
  isPlaying: () => boolean
}

function isPlayerChromeTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el?.closest) return false
  return Boolean(
    el.closest(
      '.kz-bar, .kz-big-play, .kz-speed-menu, .kz-sr-menu, .kz-vol-popup, .kz-settings-popover, .kz-context-menu, .kz-stats-overlay, button, a, input, select, textarea, label, [role="dialog"], [data-player-chrome]',
    ),
  )
}

/** Max gap between taps to count as double-tap (mobile). */
const MOBILE_DOUBLE_TAP_MS = 320
/** Delay before treating a lone tap as chrome toggle (mobile). */
const MOBILE_SINGLE_TAP_DELAY_MS = 320
/**
 * Desktop single-click dispatch delay (ms).
 * Waits 220ms so a double-click cancels the timer before togglePlay is ever called,
 * aligning 100% with Bilibili/YouTube standards where double-click never triggers play/pause.
 */
const DESKTOP_SINGLE_CLICK_DELAY_MS = 220
/** Max interval between clicks to register as double-click on desktop (ms). */
const DESKTOP_DOUBLE_CLICK_MS = 250
/** Max distance (px) between two clicks to count as double-click (desktop). */
const DESKTOP_DOUBLE_CLICK_DIST_PX = 24
/**
 * Mobile browsers often fire: click → click (our double-tap) → dblclick.
 * Without dedup, togglePlay runs twice (pause then immediate play).
 */
const PLAY_TOGGLE_DEDUP_MS = 420

/**
 * Stage pointer handlers. Desktop and mobile policies live in separate branches
 * so edits to one path do not risk the other.
 *
 * Desktop (fine pointer):
 * - single-click play/pause (debounced via 220ms timer)
 * - deliberate fast double-click fullscreen (cancels single-click timer; 0 play/pause interference)
 * - mouse enter/move show bar; leave hide while playing
 *
 * Mobile / touch:
 * - single-tap toggle chrome
 * - double-tap play/pause (timestamp-based — Safari often never fires dblclick)
 * - no hover path (synthetic mouse would fight tap toggle)
 */
export function useShellPointerHandlers(
  pointerMode: PointerMode,
  api: ShellPointerHandlerApi,
) {
  const apiRef = useRef(api)
  apiRef.current = api
  const mobileClickTimerRef = useRef(0)
  const desktopClickTimerRef = useRef(0)
  /** Last stage tap time for mobile double-tap (dblclick is unreliable on iOS). */
  const lastTapAtRef = useRef(0)
  /** Last play/pause toggle from stage gestures (dedup click+dblclick). */
  const lastPlayToggleAtRef = useRef(0)
  /** Last desktop click info for tight double-click timing & coordinate validation. */
  const lastDesktopClickRef = useRef({
    time: 0,
    x: 0,
    y: 0,
  })

  useEffect(() => {
    return () => {
      window.clearTimeout(mobileClickTimerRef.current)
      window.clearTimeout(desktopClickTimerRef.current)
    }
  }, [])

  const requestTogglePlay = useCallback(() => {
    const now = Date.now()
    if (now - lastPlayToggleAtRef.current < PLAY_TOGGLE_DEDUP_MS) return
    lastPlayToggleAtRef.current = now
    apiRef.current.togglePlay()
  }, [])

  const onShellClick = useCallback(
    (e: ReactMouseEvent) => {
      if (isPlayerChromeTarget(e.target)) return
      const a = apiRef.current

      if (pointerMode === 'desktop') {
        if (a.closeMenus() || a.closePanel()) {
          window.clearTimeout(desktopClickTimerRef.current)
          desktopClickTimerRef.current = 0
          lastDesktopClickRef.current = { time: 0, x: 0, y: 0 }
          a.bumpBar()
          return
        }

        const now = Date.now()
        const prev = lastDesktopClickRef.current
        const dt = now - prev.time
        const dist = Math.hypot(e.clientX - prev.x, e.clientY - prev.y)

        // 1. Fast second click (Double Click) within threshold (≤ 250ms & ≤ 24px)
        if (dt > 0 && dt <= DESKTOP_DOUBLE_CLICK_MS && dist <= DESKTOP_DOUBLE_CLICK_DIST_PX) {
          // CANCEL the pending single-click timer so play/pause is NEVER toggled
          window.clearTimeout(desktopClickTimerRef.current)
          desktopClickTimerRef.current = 0
          lastDesktopClickRef.current = { time: 0, x: 0, y: 0 }

          // ONLY toggle fullscreen (maintains current paused or playing state)
          a.toggleFs()
          return
        }

        // 2. First click (or click after threshold elapsed): start short timer
        window.clearTimeout(desktopClickTimerRef.current)
        lastDesktopClickRef.current = {
          time: now,
          x: e.clientX,
          y: e.clientY,
        }

        desktopClickTimerRef.current = window.setTimeout(() => {
          desktopClickTimerRef.current = 0
          lastDesktopClickRef.current = { time: 0, x: 0, y: 0 }
          a.togglePlay()
        }, DESKTOP_SINGLE_CLICK_DELAY_MS)

        return
      }

      // Mobile: detect double-tap via timing (do not rely on onDoubleClick alone)
      const now = Date.now()
      const sinceLast = now - lastTapAtRef.current
      if (sinceLast > 0 && sinceLast < MOBILE_DOUBLE_TAP_MS) {
        window.clearTimeout(mobileClickTimerRef.current)
        mobileClickTimerRef.current = 0
        lastTapAtRef.current = 0
        requestTogglePlay()
        return
      }
      lastTapAtRef.current = now

      // Single tap: wait in case a second tap arrives
      window.clearTimeout(mobileClickTimerRef.current)
      mobileClickTimerRef.current = window.setTimeout(() => {
        mobileClickTimerRef.current = 0
        // Only clear lastTap if no second tap started a new window
        if (Date.now() - lastTapAtRef.current >= MOBILE_SINGLE_TAP_DELAY_MS - 20) {
          lastTapAtRef.current = 0
        }
        if (a.closeMenus() || a.closePanel()) {
          a.bumpBar()
          return
        }
        if (a.showBarRef.current) a.hideBar()
        else a.bumpBar()
      }, MOBILE_SINGLE_TAP_DELAY_MS)
    },
    [pointerMode, requestTogglePlay],
  )

  const onShellDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      if (isPlayerChromeTarget(e.target)) return
      e.preventDefault()
      window.clearTimeout(mobileClickTimerRef.current)
      mobileClickTimerRef.current = 0
      lastTapAtRef.current = 0
      const a = apiRef.current
      if (pointerMode === 'desktop') {
        // Desktop double-click is strictly managed in onShellClick via timer cancellation
        // to ensure zero unwanted play/pause toggling, matching Bilibili standard.
        return
      }
      // Fallback if browser still emits dblclick (some Androids).
      // Deduped: click-path double-tap usually already toggled.
      requestTogglePlay()
    },
    [pointerMode, requestTogglePlay],
  )

  const onShellMouseMove = useCallback(() => {
    if (pointerMode !== 'desktop') return
    apiRef.current.bumpBar()
  }, [pointerMode])

  const onShellMouseLeave = useCallback(() => {
    if (pointerMode !== 'desktop') return
    if (!apiRef.current.isPlaying()) return
    apiRef.current.hideBar()
  }, [pointerMode])

  const onShellMouseEnter = useCallback(() => {
    if (pointerMode !== 'desktop') return
    apiRef.current.bumpBar()
  }, [pointerMode])

  return {
    onShellClick,
    onShellDoubleClick,
    onShellMouseMove,
    onShellMouseLeave,
    onShellMouseEnter,
  }
}
