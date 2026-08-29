/**
 * Native <video> + hls.js player (no Plyr / DPlayer).
 * Plyr fought MSE (black screen while .ts still 200). This path matches
 * what worked with DPlayer: attach HLS to a real video element and paint it full-size.
 *
 * Shell owns media engine (HLS / danmaku / Anime4K / FS actions).
 * Desktop vs mobile chrome lives under `./chrome/*` so edits to one side
 * do not touch the other.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import './plyr-overrides.css'
/** Instance type only — runtime constructor is dynamic-imported for m3u8 */
import type Hls from 'hls.js'
import {
  CONTINUE_PLAY_MIN_THRESHOLD_SEC,
  PLAYER_SPEEDS,
  STATS_VALID_PLAY_THRESHOLD_SEC,
  type SuperResolutionMode,
} from '@animaku/shared'
import { statsApi } from '../lib/api'
import { DanmakuPanel, type DanmakuPanelTab } from './DanmakuPanel'
import {
  hasWebGPU,
  startAnime4K,
  SR_MAX_DIMENSION,
  SUPER_RESOLUTION_LABELS,
  supportsAnime4K,
  type Anime4KStop,
} from './anime4k'
import type { DanmakuPanelState, VideoPlayerProps } from './types'
import {
  canIosVideoFullscreen,
  canRequestDomFullscreen,
  enterIosVideoFullscreen,
  exitDomFullscreen,
  exitIosVideoFullscreen,
  isIosVideoFullscreen,
  isShellFullscreen,
  requestDomFullscreen,
} from './media/fullscreen'
import { CanvasDanmaku } from './media/canvas-danmaku'
import {
  danmakuFontScaleBucket,
  danmakuPixelSpeed,
  type DanmakuLayoutHints,
} from './media/danmaku-utils'
import {
  bufferedAhead,
  formatTime,
  inferMediaMimeType,
  isM3u8,
  isVideoFile,
  isXmlDanmakuFile,
} from './media/format'
import { usePointerMode } from './chrome/usePointerMode'
import { useChromeVisibility } from './chrome/useChromeVisibility'
import { useShellPointerHandlers } from './chrome/useShellPointerHandlers'
import { DesktopControls } from './chrome/DesktopControls'
import { MobileControls } from './chrome/MobileControls'
import { OpedMarkerDrawer } from './chrome/OpedMarkerDrawer'
import { PlayerContextMenu } from './chrome/PlayerContextMenu'
import {
  PlayerStatsOverlay,
  type PlayerStatsData,
} from './chrome/PlayerStatsOverlay'
import type { PlayerControlsProps } from './chrome/types'

export type { DanmakuPanelState, VideoPlayerProps } from './types'
export type AspectRatioMode = 'contain' | 'cover' | 'fill' | '4:3'

const ASPECT_RATIO_LABELS: Record<AspectRatioMode, string> = {
  contain: '默认比例 (16:9)',
  cover: '画面铺满 (Cover)',
  fill: '100% 拉伸 (Fill)',
  '4:3': '画幅 4:3',
}

/** Min buffer before first play — tiered for HLS vs progressive MP4. */
const MIN_START_BUFFER_HLS_SEC = 0.4
const MIN_START_BUFFER_MP4_SEC = 0.4
/** Don't stall forever on empty CDN; start anyway after this. */
const MAX_START_WAIT_MS = 3_500

export function VideoPlayer({
  title,
  src,
  initialTime = 0,
  comments,
  danmaku,
  player,
  onPlayerChange,
  onProgress,
  onToggleDanmaku,
  onDanmakuChange,
  onPrev,
  onNext,
  embedded = false,
  danmakuPanel,
  hudMessage,
  onMediaAuthExpired,
  onMediaLoadFailed,
  bangumiId,
  episodeNumber,
  totalEpisodes,
  officialOpedData,
  widescreen: controlledWidescreen,
  onToggleWidescreen: controlledToggleWidescreen,
}: VideoPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const danmakuCoreRef = useRef<CanvasDanmaku | null>(null)

  const [internalWidescreen, setInternalWidescreen] = useState(false)
  const isWidescreen = controlledWidescreen ?? internalWidescreen
  const handleToggleWidescreen = () => {
    try {
      ;(document.activeElement as HTMLElement)?.blur?.()
    } catch {
      /* ignore */
    }
    const next = !isWidescreen
    if (controlledToggleWidescreen) {
      controlledToggleWidescreen()
    } else {
      setInternalWidescreen(next)
    }
    flashSkipHint(next ? '宽屏模式：已开启' : '宽屏模式：已退出', 1500)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' })
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'instant' })
      })
    }
  }
  /**
   * Gate first CanvasDanmaku construct until media can paint
   * (canplay / HAVE_CURRENT_DATA). Avoids main-thread work during black buffer.
   * Settings/comments still live in refs and apply on first ready applyDanmaku().
   */
  const danmakuMediaReadyRef = useRef(false)
  /** Last player width used for danmaku font scale (reload only on meaningful change). */
  const lastDanmakuWidthRef = useRef(0)
  const anime4kStopRef = useRef<Anime4KStop | null>(null)
  const genRef = useRef(0)
  const lastSaveRef = useRef(0)
  /** Throttle React progress UI updates (timeupdate is ~4–15Hz). */
  const lastUiProgressRef = useRef(0)
  /** Last t for OP/ED boundary crossing (works at high playbackRate). */
  const lastSkipTRef = useRef(0)
  /** Fingerprint of last full danmaku reload (comments + content settings). */
  const danmakuContentKeyRef = useRef('')
  const skipBusyRef = useRef(false)
  const isSeekingRef = useRef(false)
  const pendingSeekTargetRef = useRef<number | null>(null)
  const seekLockExpiryRef = useRef(0)
  const resumedRef = useRef(false)
  /** Suppress volumechange → settings during softPlay mute dance. */
  const ignoreVolumePersistRef = useRef(false)
  /** Last non-zero volume for mute-toggle restore (desktop speaker icon). */
  const lastAudibleVolumeRef = useRef(
    player.volume && player.volume > 0 ? player.volume : 0.7,
  )
  /** User intentionally paused — do not show stall spinner while paused. */
  const userPausedRef = useRef(false)

  const playerRef = useRef(player)
  const danmakuRef = useRef(danmaku)
  const commentsRef = useRef(comments)
  /** Live layout for danmaku (avoid stale closure inside src effect). */
  const pointerModeRef = useRef<'desktop' | 'mobile'>('desktop')
  const playerFsRef = useRef(false)
  const webFsRef = useRef(false)
  const onNextRef = useRef(onNext)
  const onPrevRef = useRef(onPrev)
  const onProgressRef = useRef(onProgress)
  const onPlayerChangeRef = useRef(onPlayerChange)
  const onToggleDanmakuRef = useRef(onToggleDanmaku)
  const onDanmakuChangeRef = useRef(onDanmakuChange)
  const onMediaAuthExpiredRef = useRef(onMediaAuthExpired)
  const onMediaLoadFailedRef = useRef(onMediaLoadFailed)
  const loadFailedOnceRef = useRef(false)
  const mediaErrorWindowCountRef = useRef(0)
  const lastMediaErrorTimeRef = useRef(0)
  const sessionMediaErrorTotalRef = useRef(0)
  const initialTimeRef = useRef(initialTime)
  const authRetryRef = useRef(false)
  const [localVideo, setLocalVideo] = useState<{ url: string; name: string } | null>(null)
  const activeSrc = localVideo?.url || src

  const [offsetHint, setOffsetHint] = useState('')
  const offsetHintTimer = useRef(0)

  // Central ripple animation for play/pause micro-interaction
  const [ripple, setRipple] = useState<{ id: number; type: 'play' | 'pause' } | null>(null)
  const rippleTimerRef = useRef(0)

  const triggerRipple = (type: 'play' | 'pause') => {
    window.clearTimeout(rippleTimerRef.current)
    setRipple({ id: Date.now(), type })
    rippleTimerRef.current = window.setTimeout(() => {
      setRipple(null)
    }, 500)
  }

  // Revoke local video Blob URL and clear pending timers on unmount
  useEffect(() => {
    return () => {
      window.clearTimeout(rippleTimerRef.current)
      window.clearTimeout(offsetHintTimer.current)
      setLocalVideo((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url)
        return null
      })
    }
  }, [])

  // Clear local video override when parent changes network src
  const prevSrcRef = useRef(src)
  useEffect(() => {
    if (prevSrcRef.current !== src) {
      prevSrcRef.current = src
      setLocalVideo((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url)
        return null
      })
    }
  }, [src])

  // Toast hint when a local video is loaded
  useEffect(() => {
    if (localVideo?.name) {
      flashSrHint(`已加载本地视频：${localVideo.name}`, 3500)
    }
  }, [localVideo])

  // Auto-next countdown overlay
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownIntervalRef = useRef(0)

  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('contain')

  const setAspectRatioMode = (next: AspectRatioMode) => {
    setAspectRatio(next)
    flashSkipHint(`画面比例：${ASPECT_RATIO_LABELS[next]}`, 1800)
  }

  const toggleAspectRatio = () => {
    const modes: AspectRatioMode[] = ['contain', 'cover', 'fill', '4:3']
    const idx = modes.indexOf(aspectRatio)
    const next = modes[(idx + 1) % modes.length]
    setAspectRatioMode(next)
  }
  const toggleAspectRatioRef = useRef(toggleAspectRatio)
  toggleAspectRatioRef.current = toggleAspectRatio

  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<DanmakuPanelTab>('search')
  const [filterDraft, setFilterDraft] = useState('')
  const [dropActive, setDropActive] = useState(false)

  // Play statistics metrics: accumulate actual continuous play duration and report when reaching 15s
  const playSecAccumulatedRef = useRef<number>(0)
  const playViewReportedRef = useRef<boolean>(false)
  const lastPlaySecTickRef = useRef<number>(0)

  useEffect(() => {
    playSecAccumulatedRef.current = 0
    playViewReportedRef.current = false
    lastPlaySecTickRef.current = 0
  }, [bangumiId, episodeNumber, activeSrc])
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [srMenuOpen, setSrMenuOpen] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  /** Mobile vertical volume popup */
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(true)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  /**
   * Stall chrome (center spinner only — no text tips).
   * Show only when there is nothing paint-able: initial load, seek into hole,
   * or real underrun. Never while frames are still advancing.
   */
  const [seekingUi, setSeekingUi] = useState(false)
  const [bufferingUi, setBufferingUi] = useState(false)
  /** player shell Fullscreen API */
  const [playerFs, setPlayerFs] = useState(false)
  /** CSS fill viewport without Fullscreen API (agefans-style webpage FS) */
  const [webFs, setWebFs] = useState(false)
  /** WebGPU Anime4K pipeline currently painting to canvas */
  const [srActive, setSrActive] = useState(false)
  /** null = not probed yet; false = no WebGPU / no adapter */
  const [webGpuOk, setWebGpuOk] = useState<boolean | null>(
    () => (typeof navigator !== 'undefined' && hasWebGPU() ? null : false),
  )
  const xmlInputRef = useRef<HTMLInputElement>(null)
  const toggleFsRef = useRef<() => void>(() => {})
  const togglePlayRef = useRef<() => void>(() => {})

  const [mirror, setMirror] = useState(false)
  const [loop, setLoop] = useState(false)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const [statsOpen, setStatsOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    visible: boolean
  }>({
    x: 0,
    y: 0,
    visible: false,
  })
  const [pipActive, setPipActive] = useState(false)
  const [pipSupported, setPipSupported] = useState(false)
  const [bandwidthEstimateBps, setBandwidthEstimateBps] = useState(0)
  const [lastFragStats, setLastFragStats] = useState<{
    bytes: number
    loadTimeMs: number
    speedBytesPerSec: number
  } | null>(null)
  const [fps, setFps] = useState(0)
  const [droppedFrames, setDroppedFrames] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [videoCodec, setVideoCodec] = useState('')
  const [audioCodec, setAudioCodec] = useState('')
  const [opedDrawerOpen, setOpedDrawerOpen] = useState(false)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPipSupported(Boolean(document.pictureInPictureEnabled))
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onEnterPip = () => setPipActive(true)
    const onLeavePip = () => setPipActive(false)

    v.addEventListener('enterpictureinpicture', onEnterPip)
    v.addEventListener('leavepictureinpicture', onLeavePip)

    return () => {
      v.removeEventListener('enterpictureinpicture', onEnterPip)
      v.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [activeSrc])

  const pointerMode = usePointerMode()
  const menusOpen =
    panelOpen ||
    speedMenuOpen ||
    srMenuOpen ||
    volumeMenuOpen ||
    settingsMenuOpen ||
    contextMenu.visible
  const {
    showBar,
    showBarRef,
    bumpBar,
    hideBar,
    setShowBar,
    clearHideTimer,
  } = useChromeVisibility({
    pointerMode,
    menusOpen,
    isPaused: () => Boolean(videoRef.current?.paused),
  })

  // Sync webFs state to document root to isolate stacking context and hide site header
  useEffect(() => {
    if (webFs) {
      document.documentElement.classList.add('kz-has-web-fs')
      document.body.classList.add('kz-has-web-fs')
    } else {
      document.documentElement.classList.remove('kz-has-web-fs')
      document.body.classList.remove('kz-has-web-fs')
    }
    return () => {
      document.documentElement.classList.remove('kz-has-web-fs')
      document.body.classList.remove('kz-has-web-fs')
    }
  }, [webFs])

  playerRef.current = player
  danmakuRef.current = danmaku
  commentsRef.current = comments
  onNextRef.current = onNext
  onPrevRef.current = onPrev
  onProgressRef.current = onProgress
  onPlayerChangeRef.current = onPlayerChange
  onToggleDanmakuRef.current = onToggleDanmaku
  onDanmakuChangeRef.current = onDanmakuChange
  onMediaAuthExpiredRef.current = onMediaAuthExpired
  onMediaLoadFailedRef.current = onMediaLoadFailed
  initialTimeRef.current = initialTime
  pointerModeRef.current = pointerMode
  playerFsRef.current = playerFs
  webFsRef.current = webFs
  if ((player.volume ?? 0) > 0.001) {
    lastAudibleVolumeRef.current = player.volume
  }

  /**
   * 解析媒体当前可信的最终总时长（秒）。
   * 区分 MP4 与 HLS VOD 解析态，若处于切片探测期返回 null 挂起，杜绝误判。
   */
  const resolveAuthoritativeDuration = useCallback((): number | null => {
    const video = videoRef.current
    if (!video) return null
    const isHls = isM3u8(activeSrc)

    if (isHls) {
      const hls = hlsRef.current
      if (!hls) {
        // Safari 原生 HLS 播放模式：已解析出有效有限时长
        const d = video.duration
        return Number.isFinite(d) && d > 0 ? d : null
      }
      // hls.js 模式：当前 active level 的 VOD 切片已完整就绪
      const lvl = hls.levels[hls.currentLevel]
      const details = lvl?.details
      if (
        details &&
        !details.live &&
        Number.isFinite(details.totalduration) &&
        details.totalduration > 0
      ) {
        return details.totalduration
      }
      return null
    }

    // Progressive MP4：只要元数据已就绪且 duration 为有限正数
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      const d = video.duration
      return Number.isFinite(d) && d > 0 ? d : null
    }

    return null
  }, [activeSrc])

  /**
   * 幂等且时序安全的初始续播调度器：
   * 1. Stale Instance Guard：失效/重试中实例绝不响应；
   * 2. 权威时长决断：未稳定时挂起重试，杜绝代理指标漏洞；
   * 3. 严格防越界裁剪与 try/catch 保护。
   */
  const tryApplyInitialResume = useCallback((): boolean => {
    const video = videoRef.current
    const targetTime = initialTimeRef.current
    const cfg = playerRef.current

    if (
      !video ||
      !cfg.continuePlay ||
      resumedRef.current ||
      targetTime <= CONTINUE_PLAY_MIN_THRESHOLD_SEC
    ) {
      return false
    }

    // Stale Instance Guard：若当前实例已处于凭证重试、报错或失效状态，坚决不执行
    if (authRetryRef.current || loadFailedOnceRef.current || mediaError) {
      return false
    }

    const authDuration = resolveAuthoritativeDuration()
    if (authDuration === null) {
      // 权威时长尚未稳定，等待后续事件（loadedmetadata / durationchange / LEVEL_LOADED）重试
      return false
    }

    // 严格防越界裁剪：锁定在 [0, authDuration - 0.5s] 安全区间内，防止触发非法 ended
    const safeTarget = Math.max(0, Math.min(targetTime, Math.max(0, authDuration - 0.5)))

    resumedRef.current = true
    lastSkipTRef.current = safeTarget
    try {
      video.currentTime = safeTarget
      return true
    } catch (e) {
      console.warn('[player] initial resume seek failed:', e)
      return false
    }
  }, [resolveAuthoritativeDuration, mediaError])

  // 入口 1: Prop 驱动入口（处理 Late Hydrate 异步到达）
  useEffect(() => {
    if (initialTime > CONTINUE_PLAY_MIN_THRESHOLD_SEC && !resumedRef.current) {
      tryApplyInitialResume()
    }
  }, [initialTime, tryApplyInitialResume])

  function reportLoadFailed(reason: string) {
    if (loadFailedOnceRef.current) return
    loadFailedOnceRef.current = true
    const pos = videoRef.current?.currentTime || 0
    onMediaLoadFailedRef.current?.({ position: pos, reason })
  }

  /** Desktop/mobile + fullscreen → danmaku font/speed curve (not width alone). */
  function danmakuLayoutHints(height?: number): DanmakuLayoutHints {
    const shell = shellRef.current
    const h =
      height && height > 0
        ? height
        : shell?.clientHeight || layerRef.current?.clientHeight || 0
    return {
      mode: pointerModeRef.current,
      fullscreen: Boolean(playerFsRef.current || webFsRef.current),
      height: h > 0 ? h : undefined,
    }
  }

  /**
   * Apply danmaku settings / comments (Canvas time-based engine).
   * Visual-only (opacity/speed/area/enabled) → applyVisual, no list rebuild.
   * Content changes (comments, filters, modes, offset, fontSize) → full reload.
   * Never resize() on every apply — only when width/font bucket changes.
   *
   * First construct is deferred until danmakuMediaReadyRef / HAVE_CURRENT_DATA
   * so open-buffer main thread is not competing with HLS attach + first paint.
   */
  function applyDanmaku(forceReload = false) {
    const video = videoRef.current
    const layer = layerRef.current
    if (!video || !layer) return

    // No engine yet: wait until frames can paint (or explicit ready flag from canplay).
    if (!danmakuCoreRef.current) {
      const paintable =
        danmakuMediaReadyRef.current ||
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      if (!paintable) return
      danmakuMediaReadyRef.current = true
    }

    const dm = danmakuRef.current
    const shell = shellRef.current
    const w =
      shell?.clientWidth || layer.clientWidth || video.clientWidth || 0
    const h =
      shell?.clientHeight || layer.clientHeight || video.clientHeight || 0
    const layout = danmakuLayoutHints(h)
    const pixelSpeed = danmakuPixelSpeed(w, dm.speed || 1, layout)
    const prevW = lastDanmakuWidthRef.current
    const widthBucketChanged =
      w > 0 &&
      (prevW <= 0 ||
        Math.abs(
          danmakuFontScaleBucket(w, layout) -
            danmakuFontScaleBucket(prevW, layout),
        ) >= 1)
    lastDanmakuWidthRef.current = w

    const contentKey = [
      commentsRef.current.length,
      commentsRef.current[0]?.time ?? 0,
      commentsRef.current[commentsRef.current.length - 1]?.time ?? 0,
      dm.timeOffset ?? 0,
      dm.fontSize ?? 1,
      dm.showScroll ? 1 : 0,
      dm.showTop ? 1 : 0,
      dm.showBottom ? 1 : 0,
      dm.showColor ? 1 : 0,
      dm.simplify ? 1 : 0,
      (dm.filters || []).join('\0'),
      danmakuFontScaleBucket(w, layout),
    ].join('|')

    try {
      const needReload =
        forceReload ||
        !danmakuCoreRef.current ||
        contentKey !== danmakuContentKeyRef.current

      if (!danmakuCoreRef.current) {
        danmakuCoreRef.current = new CanvasDanmaku({
          container: layer,
          media: video,
          comments: commentsRef.current,
          settings: dm,
          width: w,
          layout,
        })
        danmakuContentKeyRef.current = contentKey
      } else if (needReload) {
        const core = danmakuCoreRef.current
        core.setLayout(layout)
        core.reload(commentsRef.current, dm)
        core.speed = pixelSpeed
        danmakuContentKeyRef.current = contentKey
        if (widthBucketChanged) core.resize(w)
      } else {
        const core = danmakuCoreRef.current
        core.setLayout(layout)
        core.applyVisual(dm)
        core.speed = pixelSpeed
        // Geometry only when player width actually moved a font-scale bucket
        if (widthBucketChanged) core.resize(w)
      }
      const core = danmakuCoreRef.current
      if (dm.enabled === false) core.hide()
      else core.show()
    } catch (e) {
      console.warn('[danmaku]', e)
    }
  }

  /** canplay / playing / paintable readyState → allow first engine construct. */
  function noteDanmakuMediaReady() {
    danmakuMediaReadyRef.current = true
    if (!danmakuCoreRef.current) applyDanmaku()
  }

  const {
    onShellClick,
    onShellDoubleClick,
    onShellMouseMove,
    onShellMouseLeave,
    onShellMouseEnter,
  } = useShellPointerHandlers(pointerMode, {
    togglePlay: () => togglePlayRef.current(),
    toggleFs: () => toggleFsRef.current(),
    bumpBar,
    hideBar,
    showBarRef,
    closeMenus: () => {
      let closed = false
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }))
        closed = true
      }
      if (
        speedMenuOpen ||
        srMenuOpen ||
        volumeMenuOpen ||
        settingsMenuOpen ||
        opedDrawerOpen
      ) {
        setSpeedMenuOpen(false)
        setSrMenuOpen(false)
        setVolumeMenuOpen(false)
        setSettingsMenuOpen(false)
        setOpedDrawerOpen(false)
        closed = true
      }
      return closed
    },
    closePanel: () => {
      let closed = false
      if (panelOpen) {
        setPanelOpen(false)
        closed = true
      }
      if (opedDrawerOpen) {
        setOpedDrawerOpen(false)
        closed = true
      }
      return closed
    },
    isPlaying: () => Boolean(videoRef.current && !videoRef.current.paused),
  })

  // Load media
  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl || !activeSrc) return
    // Local non-null alias — nested cleanups must not see `HTMLVideoElement | null`
    const video: HTMLVideoElement = videoEl

    const gen = ++genRef.current
    const alive = () => genRef.current === gen

    resumedRef.current = false
    skipBusyRef.current = false
    authRetryRef.current = false
    loadFailedOnceRef.current = false
    mediaErrorWindowCountRef.current = 0
    lastMediaErrorTimeRef.current = 0
    sessionMediaErrorTotalRef.current = 0
    userPausedRef.current = false
    ignoreVolumePersistRef.current = false
    lastUiProgressRef.current = 0
    lastSkipTRef.current = 0
    danmakuContentKeyRef.current = ''
    setMediaError('')
    setLoading(true)
    setSeekingUi(false)
    setBufferingUi(false)
    setPaused(true)
    setCurrent(0)
    setDuration(0)

    try {
      danmakuCoreRef.current?.destroy()
    } catch {
      /* ignore */
    }
    danmakuCoreRef.current = null
    danmakuMediaReadyRef.current = false

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy()
      } catch {
        /* ignore */
      }
      hlsRef.current = null
    }

    while (video.firstChild) {
      video.removeChild(video.firstChild)
    }
    video.removeAttribute('src')
    video.load()

    const cfg = playerRef.current
    /** Apply rate + default so load()/MSE attach cannot silently fall back to 1. */
    const applyPlaybackRate = (rate?: number) => {
      const s = rate ?? playerRef.current.speed ?? 1
      try {
        video.defaultPlaybackRate = s
        video.playbackRate = s
      } catch {
        /* some engines reject while HAVE_NOTHING */
      }
    }
    video.volume = cfg.volume ?? 0.7
    video.muted = (cfg.volume ?? 0.7) <= 0
    applyPlaybackRate(cfg.speed || 1)
    video.playsInline = true
    try {
      ;(video as unknown as { referrerPolicy?: string }).referrerPolicy =
        'no-referrer'
    } catch {
      /* ignore */
    }

    /** Clean up softPlay waiters on src change / unmount */
    let softPlayCleanup: (() => void) | null = null

    /**
     * Start playback only after enough buffered data (or timeout).
     * MANIFEST_PARSED / loadedmetadata alone often fire before video frames
     * are ready on weak nets → audio plays while picture freezes.
     */
    const softPlay = () => {
      if (!alive()) return
      if (!cfg.autoplay) {
        setLoading(false)
        setBufferingUi(false)
        setPaused(true)
        userPausedRef.current = true
        return
      }
      userPausedRef.current = false
      setLoading(true)

      const startedAt = Date.now()
      let settled = false

      const isHls = isM3u8(activeSrc)
      const minStartBuffer = isHls
        ? MIN_START_BUFFER_HLS_SEC
        : MIN_START_BUFFER_MP4_SEC

      const tryStart = () => {
        if (!alive() || settled) return
        const ahead = bufferedAhead(video)
        const waited = Date.now() - startedAt
        // 核心起播门禁：三条独立并列通道（三者取一）
        // 通道 1：首帧画面已渲染（HAVE_CURRENT_DATA）且具备至少 50ms 微缓冲存量（消除 Safari 死锁且不零缓冲裸奔）
        // 通道 2：已缓冲达到标准起播阈值（0.4s）常规放行
        // 通道 3：3.5s 硬超时兜底放行
        const readyEnough =
          (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && ahead >= 0.05) ||
          ahead >= minStartBuffer ||
          waited >= MAX_START_WAIT_MS
        if (!readyEnough) return

        settled = true
        cleanupWaiters()
        // Read volume/speed from live ref — user may have changed them while loading
        const live = playerRef.current
        // Mute dance for autoplay policy — don't persist transient mute/volume
        ignoreVolumePersistRef.current = true
        applyPlaybackRate(live.speed || 1)
        video.muted = true
        video
          .play()
          .then(() => {
            if (!alive()) return
            const wantVol = playerRef.current.volume ?? 0.7
            video.muted = wantVol <= 0
            // Re-read after await: volume may change during muted autoplay
            video.volume = wantVol
            applyPlaybackRate(playerRef.current.speed || 1)
            ignoreVolumePersistRef.current = false
            setPaused(false)
            setLoading(false)
            setBufferingUi(false)
          })
          .catch(() => {
            if (!alive()) return
            const wantVol = playerRef.current.volume ?? 0.7
            video.muted = wantVol <= 0
            video.volume = wantVol
            applyPlaybackRate(playerRef.current.speed || 1)
            ignoreVolumePersistRef.current = false
            setPaused(true)
            setLoading(false)
            setBufferingUi(false)
            userPausedRef.current = true
          })
      }

      const onProgress = () => tryStart()
      const onCanPlayThrough = () => tryStart()
      const onPlaying = () => {
        if (!alive()) return
        setLoading(false)
        setBufferingUi(false)
      }
      const poll = window.setInterval(tryStart, 200)
      const hardTimeout = window.setTimeout(tryStart, MAX_START_WAIT_MS)

      function cleanupWaiters() {
        window.clearInterval(poll)
        window.clearTimeout(hardTimeout)
        video.removeEventListener('progress', onProgress)
        video.removeEventListener('canplay', onProgress)
        video.removeEventListener('canplaythrough', onCanPlayThrough)
        video.removeEventListener('loadeddata', onProgress)
        video.removeEventListener('playing', onPlaying)
        if (softPlayCleanup === cleanupWaiters) softPlayCleanup = null
      }

      softPlayCleanup = cleanupWaiters
      video.addEventListener('progress', onProgress)
      video.addEventListener('canplay', onProgress)
      video.addEventListener('canplaythrough', onCanPlayThrough)
      video.addEventListener('loadeddata', onProgress)
      video.addEventListener('playing', onPlaying)
      // First probe immediately (may already have data)
      tryStart()
    }

    const onReady = () => {
      if (!alive()) return
      setDuration(video.duration || 0)
      // load()/attachMedia often resets rate → re-apply saved default here
      applyPlaybackRate()
      // 入口 2: loadedmetadata / MANIFEST_PARSED 事件驱动尝试续播
      tryApplyInitialResume()
      // Wait for buffer gate then play; danmaku engine waits for paintable media
      // (noteDanmakuMediaReady on canplay/playing) so open-buffer stays light.
      softPlay()
      // One frame after layout: construct only if already HAVE_CURRENT_DATA
      requestAnimationFrame(() => {
        if (!alive()) return
        const v = videoRef.current
        if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          noteDanmakuMediaReady()
        }
      })
    }

    /**
     * Progressive mp4/webm path.
     * Use <source type="..."> instead of bare video.src so WebKit/AVFoundation receives
     * an explicit out-of-band MIME type. This prevents Safari from classifying streams with
     * disguised extensions (such as cycani's .mp3 URLs) as audio-only and causing black screens.
     */
    const attachProgressive = () => {
      while (video.firstChild) {
        video.removeChild(video.firstChild)
      }
      video.removeAttribute('src')

      const sourceEl = document.createElement('source')
      sourceEl.src = activeSrc
      const mime = inferMediaMimeType(activeSrc)
      if (mime) {
        sourceEl.type = mime
      }

      // 入口 3: durationchange 事件驱动（针对无 faststart 优化的 MP4 云盘/网盘直链在异步探测到真实时长后重试续播）
      const onDurationChange = () => {
        if (!alive()) return
        const d = video.duration
        if (Number.isFinite(d) && d > 0) setDuration(d)
        if (!resumedRef.current) {
          tryApplyInitialResume()
        }
      }
      video.addEventListener('durationchange', onDurationChange)
      ;(video as HTMLVideoElement & { __durationChange?: () => void }).__durationChange = onDurationChange

      const tryAuthRefresh = () => {
        if (!alive() || authRetryRef.current) return false
        // cookie-backed progressive sources (anime1 etc.)
        if (!/[?&]cookie=/.test(activeSrc) || !onMediaAuthExpiredRef.current) {
          return false
        }
        authRetryRef.current = true
        const pos = video.currentTime || 0
        setMediaError('')
        setLoading(true)
        setOffsetHint('播放凭证失效，正在重新获取…')
        window.clearTimeout(offsetHintTimer.current)
        offsetHintTimer.current = window.setTimeout(
          () => setOffsetHint(''),
          4000,
        )
        void Promise.resolve(onMediaAuthExpiredRef.current(pos)).catch(() => {
          if (!alive()) return
          setLoading(false)
          setBufferingUi(false)
          setMediaError('凭证刷新失败，建议切换视频源')
        })
        return true
      }

      const onMediaError = () => {
        if (!alive()) return
        if (tryAuthRefresh()) return
        setLoading(false)
        const reason = video.error?.code
          ? `video_error_${video.error.code}`
          : 'video_load_failed'
        setMediaError(
          video.error?.code
            ? `视频错误 code=${video.error.code}（建议切换视频源）`
            : '视频加载失败，建议切换视频源',
        )
        reportLoadFailed(reason)
      }

      sourceEl.addEventListener('error', onMediaError, { once: true })
      video.addEventListener('error', onMediaError, { once: true })
      video.appendChild(sourceEl)
      video.load()

      video.addEventListener('loadedmetadata', onReady, { once: true })

      // Mid-play 403 often surfaces as stalled buffer; probe proxy once
      const onStalled = () => {
        if (!alive()) return
        if (!/[?&]cookie=/.test(activeSrc) || !onMediaAuthExpiredRef.current) return
        if (authRetryRef.current) {
          // If already retried auth once, probe if it failed again and surface clear terminal state
          void fetch(activeSrc, {
            headers: { Range: 'bytes=0-1' },
            credentials: 'same-origin',
          }).then((r) => {
            if (!alive()) return
            if (r.status === 403 || r.status === 401) {
              setLoading(false)
              setBufferingUi(false)
              setMediaError('播放凭证已过期，请重新选集或切源')
            }
          })
          return
        }
        const pos = video.currentTime || 0
        // lightweight HEAD-ish GET with range to detect auth_expired JSON
        void fetch(activeSrc, {
          headers: { Range: 'bytes=0-1' },
          credentials: 'same-origin',
        }).then(async (r) => {
          if (!alive()) return
          if (r.status === 403 || r.status === 401) {
            if (authRetryRef.current) {
              setLoading(false)
              setBufferingUi(false)
              setMediaError('播放凭证已过期，请重新选集或切源')
              return
            }
            try {
              const j = (await r.json()) as { error?: string }
              if (j?.error === 'auth_expired' || r.status === 403) {
                tryAuthRefresh()
              }
            } catch {
              tryAuthRefresh()
            }
            return
          }
          // if still ok, ignore stall
          void pos
        })
      }
      video.addEventListener('stalled', onStalled)
      video.addEventListener('error', onStalled)

      // cleanup extra listeners with effect teardown below via video events list
      ;(video as HTMLVideoElement & { __a1Stalled?: () => void }).__a1Stalled =
        onStalled
    }

    if (isM3u8(activeSrc)) {
      // Prefer MSE hls.js; fall back to Safari native HLS
      void import('hls.js')
        .then((mod) => {
          if (!alive()) return
          const HlsCtor = mod.default
          if (HlsCtor.isSupported()) {
            const hls = new HlsCtor({
              enableWorker: true,
              // Prefetch first media fragment immediately upon parsing playlist
              startFragPrefetch: true,
              // Deep buffer configuration to absorb cross-border network jitter
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
              maxBufferHole: 0.5,
              startLevel: -1,
              abrEwmaDefaultEstimate: 5_000_000,
              maxBufferSize: 60 * 1000 * 1000,
              fragLoadingTimeOut: 20_000,
              manifestLoadingTimeOut: 15_000,
              fragLoadingRetryDelay: 500,
              fragLoadingMaxRetry: 4,
              fragLoadingMaxRetryTimeout: 8_000,
              levelLoadingRetryDelay: 500,
              levelLoadingMaxRetry: 4,
              levelLoadingMaxRetryTimeout: 8_000,
            })
            hlsRef.current = hls
            hls.loadSource(activeSrc)
            hls.attachMedia(video)
            hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
              if (!alive()) return
              onReady()
            })
            hls.on(HlsCtor.Events.FRAG_LOADED, (_e, data) => {
              if (!alive()) return
              if (hls.bandwidthEstimate) {
                setBandwidthEstimateBps(hls.bandwidthEstimate)
              }
              const fragData = data as unknown as {
                stats?: { total?: number; loading?: { start: number; end: number } }
                frag?: { stats?: { total?: number; loading?: { start: number; end: number } } }
              }
              const stats = fragData.stats || fragData.frag?.stats
              const bytes = stats?.total || 0
              const loadTimeMs =
                stats?.loading && stats.loading.end > stats.loading.start
                  ? stats.loading.end - stats.loading.start
                  : 0
              if (loadTimeMs > 0 && bytes > 0) {
                setLastFragStats({
                  bytes,
                  loadTimeMs,
                  speedBytesPerSec: bytes / (loadTimeMs / 1000),
                })
              }
              if (hls.currentLevel >= 0 && hls.levels[hls.currentLevel]) {
                const lvl = hls.levels[hls.currentLevel]
                if (lvl.videoCodec) setVideoCodec(lvl.videoCodec)
                if (lvl.audioCodec) setAudioCodec(lvl.audioCodec)
              }
            })
            hls.on(HlsCtor.Events.LEVEL_LOADED, (_e, data) => {
              if (!alive()) return
              if (hls.bandwidthEstimate) {
                setBandwidthEstimateBps(hls.bandwidthEstimate)
              }
              if (data.details.totalduration) {
                setDuration(data.details.totalduration)
              }
              // 入口 4: HLS VOD 完整切片列表与总时长解析就绪
              if (!resumedRef.current) {
                tryApplyInitialResume()
              }
            })
            hls.on(HlsCtor.Events.ERROR, (_e, data) => {
              if (!alive()) return
              if (!data.fatal) {
                // Non-fatal stalls are often sub-second (hole skip / append).
                // Don't flash 缓冲中… — video `waiting` path debounces real ones.
                return
              }
              console.error('[player] hls fatal', data.type, data.details)
              if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
                setLoading(false)
                setBufferingUi(false)
                setMediaError(`网络连接错误 ${data.details || ''}，建议切换视频源`)
                reportLoadFailed(String(data.details || 'hls_network'))
                return
              } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
                const now = Date.now()
                // 30s sliding window decay: reset local counter if previous error was >30s ago
                if (now - lastMediaErrorTimeRef.current > 30_000) {
                  mediaErrorWindowCountRef.current = 0
                }
                lastMediaErrorTimeRef.current = now
                mediaErrorWindowCountRef.current++
                sessionMediaErrorTotalRef.current++

                // Error rate density with 2-minute cold-start protection baseline
                const playedSeconds = video.currentTime || 0
                const effectiveMinutes = Math.max(playedSeconds / 60, 2)
                const errorRatePerMinute =
                  sessionMediaErrorTotalRef.current / effectiveMinutes

                // If error rate exceeds density threshold, terminate and suggest switching source
                if (errorRatePerMinute > 1.0) {
                  setLoading(false)
                  setBufferingUi(false)
                  setMediaError('该视频源稳定性较差，建议切换视频源')
                  reportLoadFailed('hls_media_frequent_errors')
                  return
                }

                if (mediaErrorWindowCountRef.current === 1) {
                  setMediaError('解码异常，正在尝试恢复…')
                  hls.recoverMediaError()
                } else if (mediaErrorWindowCountRef.current === 2) {
                  setMediaError('解码异常，置换音频解码器并恢复…')
                  hls.swapAudioCodec()
                  hls.recoverMediaError()
                } else {
                  setLoading(false)
                  setBufferingUi(false)
                  setMediaError('媒体解码不可恢复，建议切换视频源')
                  reportLoadFailed('hls_media_unrecoverable')
                }
              } else {
                setLoading(false)
                setBufferingUi(false)
                setMediaError(`播放失败: ${data.details || data.type}`)
                reportLoadFailed(String(data.details || data.type))
              }
            })
            return
          }
          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            while (video.firstChild) {
              video.removeChild(video.firstChild)
            }
            video.removeAttribute('src')
            const sourceEl = document.createElement('source')
            sourceEl.src = activeSrc
            sourceEl.type = 'application/vnd.apple.mpegurl'
            const onHlsError = () => {
              if (!alive()) return
              setLoading(false)
              setMediaError('原生 HLS 加载失败，建议切换视频源')
              reportLoadFailed('native_hls')
            }
            sourceEl.addEventListener('error', onHlsError, { once: true })
            video.addEventListener('error', onHlsError, { once: true })
            video.appendChild(sourceEl)
            video.load()
            video.addEventListener('loadedmetadata', onReady, { once: true })
            return
          }
          setLoading(false)
          setMediaError('当前浏览器不支持 HLS')
        })
        .catch((e) => {
          if (!alive()) return
          console.error('[player] hls import failed', e)
          setLoading(false)
          setMediaError('加载播放器失败')
        })
    } else {
      attachProgressive()
    }

    let lastUiFloor = -1
    const onTime = () => {
      const d = video.duration
      const t = video.currentTime
      const now = Date.now()

      // Suppress stale timeupdates right after a seek in Safari/WebKit to prevent scrubber jitter
      if (pendingSeekTargetRef.current !== null) {
        if (now < seekLockExpiryRef.current) {
          if (Math.abs(t - pendingSeekTargetRef.current) > 0.6) {
            // Still on stale time from before the seek; do not clobber optimistic UI
            return
          }
        }
        pendingSeekTargetRef.current = null
      }

      // Once frames advance or are paintable, immediately drop any lingering seek/buffering spinner
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setSeekingUi(false)
        hideBufferingUi()
        isSeekingRef.current = false
      }

      const floor = Math.floor(t)
      // UI progress: ~4Hz, always commit on whole-second change (scrubber label)
      if (now - lastUiProgressRef.current >= 250 || floor !== lastUiFloor) {
        lastUiProgressRef.current = now
        lastUiFloor = floor
        setCurrent(t)
        if (Number.isFinite(d) && d > 0) setDuration(d)
      }

      if (!Number.isFinite(d) || d <= 0) {
        lastSkipTRef.current = t
        return
      }
      // Progress → history; store also debounces localStorage (~12s)
      if (now - lastSaveRef.current >= 10_000) {
        lastSaveRef.current = now
        onProgressRef.current?.(t, d)
      }

      const p = playerRef.current
      const prevT = lastSkipTRef.current
      lastSkipTRef.current = t

      // 累加实际有效播放时长并在满 STATS_VALID_PLAY_THRESHOLD_SEC 秒时上报播放统计
      if (
        !playViewReportedRef.current &&
        bangumiId &&
        bangumiId > 0 &&
        !video.paused &&
        !isSeekingRef.current
      ) {
        const lastTick = lastPlaySecTickRef.current || t
        const tickDelta = t - lastTick
        if (tickDelta > 0 && tickDelta <= 2.5) {
          playSecAccumulatedRef.current += tickDelta
          if (playSecAccumulatedRef.current >= STATS_VALID_PLAY_THRESHOLD_SEC) {
            playViewReportedRef.current = true
            void statsApi.recordPlayView(bangumiId, episodeNumber || 0).catch(() => {})
          }
        }
      }
      lastPlaySecTickRef.current = t

      if (isSeekingRef.current || skipBusyRef.current || t >= d - 3) return
      const safeMax = d - 0.1

      // 单向自然平稳连续播放判定 (Natural forward playback)
      // timeupdate 在正常播放下的时间增量通常在 0.05s~0.5s，高倍速 (3x/4x) 下最大不超过 2.0s
      const delta = t - prevT
      const isNaturalPlayback = delta > 0 && delta <= 3.0

      // OP skip (independent from ED – both can trigger in the same episode)
      if (p.skipOp.enabled && p.skipOp.duration > 0) {
        const opStart = p.skipOp.start || 0
        const opDuration = Math.abs(p.skipOp.duration)
        const opEnd = Math.min(opStart + opDuration, safeMax)

        // 严格约束：当前播放时间必须位于片头结束点之前 (仅允许向前跳过，绝对禁止向后拉回进度)
        if (t < opEnd) {
          // 触发条件：
          // 1. 正常向前连续播放跨越片头起点：prevT < opStart && t >= opStart
          // 2. 开头片头特例 (opStart <= 0.5s)：视频起播处于片头起点极小窗口内 (prevT <= 0.5 && t >= opStart && t < 2.0)
          const crossedOpStart =
            (isNaturalPlayback && prevT < opStart && t >= opStart) ||
            (opStart <= 0.5 && prevT <= 0.5 && t >= opStart && t < 2.0 && isNaturalPlayback)

          if (crossedOpStart) {
            skipBusyRef.current = true
            lastSkipTRef.current = opEnd
            video.currentTime = opEnd
            flashSkipHint('已跳过片头')
            setTimeout(() => {
              skipBusyRef.current = false
            }, 1500)
          }
        }
      }

      // ED skip (independent from OP)
      if (p.skipEd.enabled && p.skipEd.duration > 0) {
        const edDuration = Math.abs(p.skipEd.duration)
        const isRelativeEd = (p.skipEd.start || 0) <= 0
        const edStart = isRelativeEd ? d - edDuration : p.skipEd.start
        const edEnd = isRelativeEd ? safeMax : Math.min(edStart + edDuration, safeMax)

        // 严格约束：当前播放时间必须位于片尾结束点之前，且 edStart 有效
        if (t < edEnd && edStart > 0 && edStart < d) {
          const crossedEdStart = isNaturalPlayback && prevT < edStart && t >= edStart
          if (crossedEdStart) {
            skipBusyRef.current = true
            lastSkipTRef.current = edEnd
            video.currentTime = edEnd
            if (isRelativeEd) {
              setOffsetHint('即将结束')
              window.clearTimeout(offsetHintTimer.current)
              offsetHintTimer.current = window.setTimeout(() => setOffsetHint(''), 2000)
            } else {
              flashSkipHint('已跳过片尾')
            }
            setTimeout(() => {
              skipBusyRef.current = false
            }, 1500)
          }
        }
      }
    }

    const onPause = () => {
      setPaused(true)
      showBarRef.current = true
      setShowBar(true)
      if (Number.isFinite(video.duration) && video.duration > 0) {
        onProgressRef.current?.(video.currentTime, video.duration)
      }
    }
    // Filled once buffering helpers exist (below) so play/end can cancel blip timers.
    let hideBufferingUi: () => void = () => setBufferingUi(false)
    const onPlay = () => {
      setPaused(false)
      setLoading(false)
      hideBufferingUi()
      bumpBar()
    }
    const onEndedHandler = () => {
      userPausedRef.current = false
      hideBufferingUi()
      if (loopRef.current) {
        video.currentTime = 0
        void video.play().catch(() => {
          /* ignore */
        })
        return
      }
      onPause()
      if (playerRef.current.autoNext && onNextRef.current) {
        // Bilibili-style countdown before advancing to the next episode
        cancelCountdown()
        setCountdown(4)
        countdownIntervalRef.current = window.setInterval(() => {
          setCountdown((prev) => {
            if (prev === null || prev <= 1) {
              window.clearInterval(countdownIntervalRef.current)
              countdownIntervalRef.current = 0
              onNextRef.current?.()
              return null
            }
            return prev - 1
          })
        }, 1000)
      }
    }
    const onVol = () => {
      if (ignoreVolumePersistRef.current) return
      // Keep last audible level so mute-toggle can restore
      if (video.volume > 0.001 && !video.muted) {
        lastAudibleVolumeRef.current = video.volume
      }
      onPlayerChangeRef.current?.({
        volume: video.muted ? 0 : video.volume,
      })
    }
    // Intentionally no ratechange → settings: media load/MSE resets rate to 1
    // and would clobber the saved default. Speed only saves via onPickSpeed / Settings.
    const onSeeking = () => {
      isSeekingRef.current = true
      lastSkipTRef.current = video.currentTime
      lastPlaySecTickRef.current = video.currentTime
      // If user seeks during auto-next countdown, cancel it
      cancelCountdown()
      // Spinner only if seek lands outside buffered ranges (nothing to paint)
      try {
        const t = video.currentTime
        let covered = false
        for (let i = 0; i < video.buffered.length; i++) {
          if (t >= video.buffered.start(i) && t <= video.buffered.end(i) - 0.05) {
            covered = true
            break
          }
        }
        setSeekingUi(!covered)
      } catch {
        setSeekingUi(true)
      }
    }
    const onSeeked = () => {
      pendingSeekTargetRef.current = null
      isSeekingRef.current = false
      lastSkipTRef.current = video.currentTime
      lastPlaySecTickRef.current = video.currentTime
      // If we have paintable data ready (or buffer ahead), drop seeking/stall spinner immediately
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ||
        bufferedAhead(video) > 0
      ) {
        setSeekingUi(false)
        hideBufferingUi()
        return
      }
      setSeekingUi(true)
    }

    /**
     * Weak-net rebuffer: when decoder starves, pause so audio doesn't run ahead
     * of frozen frames; resume once we have MIN_RESUME_BUFFER_SEC ahead.
     *
     * Stall spinner policy (user rule):
     * - Frames still advancing / buffer ahead → no chrome at all
     * - Nothing left to paint (underrun / seek hole) → center spinner only
     * Never show text tips like 「缓冲中…」.
     */
    let stallShowTimer = 0
    /** Brief delay so micro-stalls that recover don't flash a spinner. */
    const STALL_SPINNER_DELAY_MS = 280
    const clearStallShowTimer = () => {
      if (stallShowTimer) {
        window.clearTimeout(stallShowTimer)
        stallShowTimer = 0
      }
    }
    hideBufferingUi = () => {
      clearStallShowTimer()
      setBufferingUi(false)
    }
    /** True when there is essentially nothing left to decode/paint. */
    const isUnplayable = () => {
      const ahead = bufferedAhead(video)
      return (
        ahead < 0.2 ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      )
    }
    /**
     * Arm center spinner only for real unplayable stalls.
     * `force` = confirmed underrun / waiting event.
     */
    const armStallSpinner = (force = false) => {
      if (userPausedRef.current) return
      if (!force && !isUnplayable()) return
      if (force) {
        clearStallShowTimer()
        setBufferingUi(true)
        return
      }
      if (stallShowTimer) return
      stallShowTimer = window.setTimeout(() => {
        stallShowTimer = 0
        if (!alive() || userPausedRef.current) return
        if (!isUnplayable()) return
        // Still painting? keep quiet
        if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          return
        }
        setBufferingUi(true)
      }, STALL_SPINNER_DELAY_MS)
    }

    const onWaiting = () => {
      // Network rebuffer (HLS + progressive via proxy)
      if (userPausedRef.current) return
      const ahead = bufferedAhead(video)
      // Still have playable data → silent (no spinner, no tip)
      if (ahead >= 0.35 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        return
      }
      // Show buffering spinner, but NEVER call video.pause() — keep native playback pipeline active
      armStallSpinner(true)
    }
    const onStalledPlay = () => {
      if (userPausedRef.current) return
      // stalled while still playable → ignore chrome
      if (!isUnplayable()) return
      armStallSpinner(false)
    }
    const onCanPlay = () => {
      pendingSeekTargetRef.current = null
      setSeekingUi(false)
      hideBufferingUi()
      isSeekingRef.current = false
      // A: first paintable moment — safe to build danmaku engine
      noteDanmakuMediaReady()
      if (!resumedRef.current) {
        tryApplyInitialResume()
      }
    }
    const onPlayingClear = () => {
      // Frames painting again → no stall chrome
      pendingSeekTargetRef.current = null
      hideBufferingUi()
      setSeekingUi(false)
      isSeekingRef.current = false
      // Belt-and-suspenders if canplay was skipped on some MSE paths
      noteDanmakuMediaReady()
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', onPause)
    video.addEventListener('play', onPlay)
    video.addEventListener('ended', onEndedHandler)
    video.addEventListener('volumechange', onVol)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalledPlay)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onPlayingClear)

    const ro = new ResizeObserver(() => {
      try {
        const shell = shellRef.current
        const w = shell?.clientWidth || 0
        const h = shell?.clientHeight || 0
        const core = danmakuCoreRef.current
        if (!core || w <= 0) return
        // Font scale is layout+size based; full content re-apply only when
        // scale bucket would change. Pure geometry uses resize().
        const layout = danmakuLayoutHints(h)
        const prev = lastDanmakuWidthRef.current
        const scaleChanged =
          prev <= 0 ||
          Math.abs(
            danmakuFontScaleBucket(w, layout) -
              danmakuFontScaleBucket(prev, layout),
          ) >= 1
        if (scaleChanged) {
          applyDanmaku()
        } else {
          const dm = danmakuRef.current
          core.setLayout(layout)
          core.speed = danmakuPixelSpeed(w, dm.speed || 1, layout)
          core.resize(w)
        }
      } catch {
        /* ignore */
      }
    })
    if (shellRef.current) ro.observe(shellRef.current)

    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const v = videoRef.current
      if (!v) return
      const k = e.key.toLowerCase()
      if (k === ' ' || k === 'k') {
        e.preventDefault()
        if (v.paused) {
          userPausedRef.current = false
          triggerRipple('play')
          void v.play().catch(() => {
            userPausedRef.current = true
          })
        } else {
          userPausedRef.current = true
          setBufferingUi(false)
          triggerRipple('pause')
          v.pause()
        }
      } else if (k === 'arrowleft') {
        e.preventDefault()
        const nextTime = Math.max(0, v.currentTime - 5)
        applySeek(v, nextTime)
        flashSkipHint(`⏪ -5s (${formatTime(nextTime)})`, 1000)
      } else if (k === 'arrowright') {
        e.preventDefault()
        const nextTime = Math.min(v.duration || 0, v.currentTime + 5)
        applySeek(v, nextTime)
        flashSkipHint(`⏩ +5s (${formatTime(nextTime)})`, 1000)
      } else if (k === 'arrowup') {
        e.preventDefault()
        const nextVol = Math.min(1, Math.round((v.volume + 0.05) * 100) / 100)
        v.volume = nextVol
        flashSkipHint(`🔊 音量 ${Math.round(nextVol * 100)}%`, 1000)
      } else if (k === 'arrowdown') {
        e.preventDefault()
        const nextVol = Math.max(0, Math.round((v.volume - 0.05) * 100) / 100)
        v.volume = nextVol
        flashSkipHint(nextVol === 0 ? '🔇 静音' : `🔉 音量 ${Math.round(nextVol * 100)}%`, 1000)
      } else if (k === 'f') {
        e.preventDefault()
        toggleFsRef.current()
      } else if (k === 'w') {
        e.preventDefault()
        if (e.shiftKey) {
          void toggleWebFs()
        } else {
          toggleAspectRatioRef.current?.()
        }
      } else if (k === 'p') onPrevRef.current?.()
      else if (k === 'n') onNextRef.current?.()
      else if (k === 'd') {
        e.preventDefault()
        if (onToggleDanmakuRef.current) {
          onToggleDanmakuRef.current()
        } else {
          const cur = danmakuRef.current
          const isEnabled = cur.enabled !== false
          const isSimplify = Boolean(cur.simplify)
          if (isEnabled && !isSimplify) {
            onDanmakuChangeRef.current?.({ enabled: true, simplify: true })
          } else if (isEnabled && isSimplify) {
            onDanmakuChangeRef.current?.({ enabled: false, simplify: false })
          } else {
            onDanmakuChangeRef.current?.({ enabled: true, simplify: false })
          }
        }
      } else if (k === ',' || e.key === '，') {
        // agefans: lag danmaku +0.5s
        e.preventDefault()
        const cur = danmakuRef.current.timeOffset || 0
        const next = Math.round((cur + 0.5) * 10) / 10
        onDanmakuChangeRef.current?.({ timeOffset: next })
        setOffsetHint(`弹幕滞后 0.5s（偏移 ${next > 0 ? '+' : ''}${next}s）`)
        window.clearTimeout(offsetHintTimer.current)
        offsetHintTimer.current = window.setTimeout(
          () => setOffsetHint(''),
          1500,
        )
      } else if (k === '.' || e.key === '。') {
        // agefans: advance danmaku -0.5s
        e.preventDefault()
        const cur = danmakuRef.current.timeOffset || 0
        const next = Math.round((cur - 0.5) * 10) / 10
        onDanmakuChangeRef.current?.({ timeOffset: next })
        setOffsetHint(`弹幕超前 0.5s（偏移 ${next > 0 ? '+' : ''}${next}s）`)
        window.clearTimeout(offsetHintTimer.current)
        offsetHintTimer.current = window.setTimeout(
          () => setOffsetHint(''),
          1500,
        )
      } else if (k === '/' || e.key === '、') {
        // agefans: restore offset
        e.preventDefault()
        onDanmakuChangeRef.current?.({ timeOffset: 0 })
        setOffsetHint('弹幕偏移已复位')
        window.clearTimeout(offsetHintTimer.current)
        offsetHintTimer.current = window.setTimeout(
          () => setOffsetHint(''),
          1500,
        )
      } else if (k === 'm' && e.altKey) {
        e.preventDefault()
        setPanelOpen((x) => !x)
      } else if (k === 'escape') {
        setPanelOpen(false)
        setSpeedMenuOpen(false)
        setSrMenuOpen(false)
        setVolumeMenuOpen(false)
        setSettingsMenuOpen(false)
        setOpedDrawerOpen(false)
        setContextMenu((prev) => ({ ...prev, visible: false }))
        setStatsOpen(false)
        // Exit CSS web-fs + any DOM fullscreen (browser also exits DOM FS)
        setWebFs(false)
        setPlayerFs(false)
        void exitDomFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      // Invalidate generation so softPlay / HLS / auth async paths no-op
      genRef.current++
      cancelCountdown()
      window.removeEventListener('keydown', onKey)
      ro.disconnect()
      try {
        softPlayCleanup?.()
      } catch {
        /* ignore */
      }
      softPlayCleanup = null
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ended', onEndedHandler)
      video.removeEventListener('volumechange', onVol)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalledPlay)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlayingClear)
      clearStallShowTimer()
      const durationChange = (
        video as HTMLVideoElement & { __durationChange?: () => void }
      ).__durationChange
      if (durationChange) {
        video.removeEventListener('durationchange', durationChange)
        delete (video as HTMLVideoElement & { __durationChange?: () => void })
          .__durationChange
      }
      const stalled = (
        video as HTMLVideoElement & { __a1Stalled?: () => void }
      ).__a1Stalled
      if (stalled) {
        video.removeEventListener('stalled', stalled)
        video.removeEventListener('error', stalled)
        delete (video as HTMLVideoElement & { __a1Stalled?: () => void })
          .__a1Stalled
      }
      try {
        danmakuCoreRef.current?.destroy()
      } catch {
        /* ignore */
      }
      danmakuCoreRef.current = null
      danmakuMediaReadyRef.current = false
      try {
        anime4kStopRef.current?.()
      } catch {
        /* ignore */
      }
      anime4kStopRef.current = null
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy()
        } catch {
          /* ignore */
        }
        hlsRef.current = null
      }
      while (video.firstChild) {
        video.removeChild(video.firstChild)
      }
      video.removeAttribute('src')
      video.load()
      window.clearTimeout(offsetHintTimer.current)
      setOffsetHint('')
      clearHideTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc])

  useEffect(() => {
    applyDanmaku()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, danmaku])

  // Mobile/desktop + fullscreen change font curve without comment rebuild
  useEffect(() => {
    const core = danmakuCoreRef.current
    if (!core) return
    const shell = shellRef.current
    const w = shell?.clientWidth || 0
    const h = shell?.clientHeight || 0
    const layout = danmakuLayoutHints(h)
    core.setLayout(layout)
    if (w > 0) {
      core.speed = danmakuPixelSpeed(w, danmakuRef.current.speed || 1, layout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointerMode, playerFs, webFs])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const s = player.speed || 1
    if (
      Math.abs(video.playbackRate - s) > 0.01 ||
      Math.abs((video.defaultPlaybackRate || 1) - s) > 0.01
    ) {
      try {
        video.defaultPlaybackRate = s
        video.playbackRate = s
      } catch {
        /* ignore */
      }
    }
  }, [player.speed])

  // Probe WebGPU once when user opens SR menu or has a non-off preference
  useEffect(() => {
    const mode = player.superResolution || 'off'
    if (mode === 'off' && !srMenuOpen) return
    if (webGpuOk !== null) return
    let cancelled = false
    void supportsAnime4K().then((ok) => {
      if (!cancelled) setWebGpuOk(ok)
    })
    return () => {
      cancelled = true
    }
  }, [player.superResolution, srMenuOpen, webGpuOk])

  function flashSrHint(msg: string, ms = 4500) {
    setOffsetHint(msg)
    window.clearTimeout(offsetHintTimer.current)
    offsetHintTimer.current = window.setTimeout(() => setOffsetHint(''), ms)
  }

  /** Bilibili-style skip hint — brief toast when OP/ED is auto-skipped */
  function flashSkipHint(msg: string, ms = 1500) {
    setOffsetHint(msg)
    window.clearTimeout(offsetHintTimer.current)
    offsetHintTimer.current = window.setTimeout(() => setOffsetHint(''), ms)
  }

  // Bilibili-style Danmaku Mode Switch Toast (开 -> 精简 -> 关)
  const prevDanmakuStateRef = useRef({
    enabled: danmaku.enabled,
    simplify: danmaku.simplify,
  })

  useEffect(() => {
    const prev = prevDanmakuStateRef.current
    const curEnabled = danmaku.enabled !== false
    const curSimplify = Boolean(danmaku.simplify)
    const prevEnabled = prev.enabled !== false
    const prevSimplify = Boolean(prev.simplify)

    if (prevEnabled !== curEnabled || prevSimplify !== curSimplify) {
      prevDanmakuStateRef.current = {
        enabled: danmaku.enabled,
        simplify: danmaku.simplify,
      }
      if (!curEnabled) {
        flashSkipHint('弹幕关闭', 1200)
      } else if (curSimplify) {
        flashSkipHint('弹幕精简', 1200)
      } else {
        flashSkipHint('弹幕开启', 1200)
      }
    }
  }, [danmaku.enabled, danmaku.simplify])

  /** Cancel any active auto-next countdown and hide the overlay */
  function cancelCountdown() {
    window.clearInterval(countdownIntervalRef.current)
    countdownIntervalRef.current = 0
    setCountdown(null)
  }

  /** Immediately jump to the next episode (countdown reached 0 or user clicked "play now") */
  function doNext() {
    cancelCountdown()
    onNextRef.current?.()
  }

  /**
   * Anime4K: only when mode !== off. Dynamic-import + disposable GPU controller.
   * Off path does not load anime4k-webgpu or touch WebGPU.
   */
  useEffect(() => {
    const mode = (player.superResolution || 'off') as SuperResolutionMode
    const video = videoRef.current
    const canvas = canvasRef.current
    if (mode === 'off' || !video || !canvas) {
      try {
        anime4kStopRef.current?.()
      } catch {
        /* ignore */
      }
      anime4kStopRef.current = null
      setSrActive(false)
      return
    }

    let cancelled = false
    let stop: Anime4KStop | null = null

    const unsupportedReason = (): string => {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        return '超分需要 HTTPS 或 localhost（当前 HTTP 远程访问无 WebGPU）'
      }
      return '当前浏览器 / 环境不支持 WebGPU 超分'
    }

    const run = async () => {
      try {
        // Always re-probe if not confirmed true — localStorage may have mode on
        // while first paint had no gpu (e.g. insecure context).
        let ok = webGpuOk === true
        if (!ok) {
          ok = await supportsAnime4K()
          if (cancelled) return
          setWebGpuOk(ok)
        }
        if (!ok) {
          setSrActive(false)
          flashSrHint(unsupportedReason())
          return
        }

        // wait for dimensions if needed
        if (!(video.videoWidth > 0)) {
          await new Promise<void>((resolve) => {
            const done = () => {
              video.removeEventListener('loadedmetadata', done)
              resolve()
            }
            video.addEventListener('loadedmetadata', done)
            if (video.videoWidth > 0) {
              video.removeEventListener('loadedmetadata', done)
              resolve()
            }
            // Don't hang forever if metadata never arrives
            window.setTimeout(done, 12_000)
          })
        }
        if (cancelled) return
        if (!(video.videoWidth > 0)) {
          flashSrHint('超分等待视频尺寸超时，请等画面出来后再开')
          setSrActive(false)
          return
        }

        // B: defer GPU pipeline until playback actually starts (playing).
        // Paused first-frame / pre-buffer stays on plain <video>; off path unchanged.
        if (video.paused) {
          flashSrHint('超分将在开始播放后启动…', 2200)
          await new Promise<void>((resolve) => {
            if (!video.paused || cancelled) {
              resolve()
              return
            }
            let done = false
            const finish = () => {
              if (done) return
              done = true
              video.removeEventListener('playing', onPlayingSr)
              window.clearInterval(poll)
              resolve()
            }
            const onPlayingSr = () => finish()
            video.addEventListener('playing', onPlayingSr)
            // Also resolve on cancel (src change / mode off) so we don't hang
            const poll = window.setInterval(() => {
              if (cancelled || !video.paused) finish()
            }, 250)
          })
        }
        if (cancelled) return

        try {
          anime4kStopRef.current?.()
        } catch {
          /* ignore */
        }
        anime4kStopRef.current = null

        const srMode = mode === 'quality' ? 'quality' : 'efficiency'
        flashSrHint(
          srMode === 'quality' ? '超分：质量档启动中…' : '超分：效率档启动中…',
          2000,
        )

        stop = await startAnime4K({
          video,
          canvas,
          mode: srMode,
          // 2× path needs headroom above 1920 or 1080p sources look unchanged
          maxDimension: SR_MAX_DIMENSION[srMode],
          layoutEl: shellRef.current,
        })
        if (cancelled) {
          stop()
          return
        }
        anime4kStopRef.current = stop
        setSrActive(true)
        const nw = video.videoWidth || 0
        const nh = video.videoHeight || 0
        flashSrHint(
          srMode === 'quality'
            ? `超分已开启（质量 · ${nw}p→2×）`
            : `超分已开启（效率 · ${nw}p→2×）`,
          2800,
        )
        void nh
      } catch (e) {
        console.warn('[player] Anime4K failed', e)
        if (!cancelled) {
          setSrActive(false)
          flashSrHint(
            e instanceof Error
              ? `超分启动失败：${e.message}`
              : '超分启动失败（见控制台）',
          )
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      try {
        stop?.()
      } catch {
        /* ignore */
      }
      try {
        anime4kStopRef.current?.()
      } catch {
        /* ignore */
      }
      anime4kStopRef.current = null
      setSrActive(false)
    }
    // Do not depend on playerFs/webFs — fullscreen must not tear down WebGPU
    // (black frame while pipeline rebuilds). startAnime4K owns ResizeObserver to
    // retarget canvas buffer size without rebuilding the CNN pipelines.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- webGpuOk set inside after probe
  }, [activeSrc, player.superResolution])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      userPausedRef.current = false
      triggerRipple('play')
      // Spinner only when nothing is paint-able yet
      if (
        bufferedAhead(v) < 0.2 ||
        v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        setBufferingUi(true)
      }
      void v.play().catch(() => {
        userPausedRef.current = true
        setBufferingUi(false)
      })
      bumpBar()
    } else {
      userPausedRef.current = true
      setBufferingUi(false)
      triggerRipple('pause')
      v.pause()
      setShowBar(true)
    }
  }
  togglePlayRef.current = togglePlay

  /** Try locking or unlocking orientation for landscape mobile fullscreen */
  function tryLockOrientation(lock: boolean) {
    if (typeof screen === 'undefined' || !screen.orientation) return
    const ori = screen.orientation as unknown as {
      lock?: (orientation: string) => Promise<void>
      unlock?: () => void
    }
    try {
      if (lock) {
        void ori.lock?.('landscape').catch(() => {
          /* ignore orientation lock refusal */
        })
      } else {
        ori.unlock?.()
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const onFs = () => {
      const isFs = isShellFullscreen(shellRef.current)
      setPlayerFs(isFs)
      if (!isFs && !webFsRef.current) {
        tryLockOrientation(false)
      }
    }
    // Standard + legacy webkit (older Safari / iPadOS)
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs as EventListener)
    // iOS native video fullscreen (video.webkitEnterFullscreen)
    const video = videoRef.current
    const onVideoFsBegin = () => {
      setPlayerFs(true)
      tryLockOrientation(true)
    }
    const onVideoFsEnd = () => {
      const isFs = isShellFullscreen(shellRef.current)
      setPlayerFs(isFs)
      if (!isFs && !webFsRef.current) {
        tryLockOrientation(false)
      }
    }
    video?.addEventListener('webkitbeginfullscreen', onVideoFsBegin)
    video?.addEventListener('webkitendfullscreen', onVideoFsEnd)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener(
        'webkitfullscreenchange',
        onFs as EventListener,
      )
      video?.removeEventListener('webkitbeginfullscreen', onVideoFsBegin)
      video?.removeEventListener('webkitendfullscreen', onVideoFsEnd)
    }
  }, [src])

  async function exitAnyFs() {
    setWebFs(false)
    setPlayerFs(false)
    tryLockOrientation(false)
    exitIosVideoFullscreen(videoRef.current)
    try {
      await exitDomFullscreen()
    } catch {
      /* ignore */
    }
  }

  /**
   * Player fullscreen:
   * 1) Standard / webkit Fullscreen API on shell (desktop / iPadOS 15+ often)
   * 2) iOS Safari: only <video> can go native FS via webkitEnterFullscreen
   * 3) Fallback: CSS webpage fullscreen (kz-web-fs) — works when FS API is missing
   */
  async function togglePlayerFs() {
    const shell = shellRef.current
    const video = videoRef.current
    if (!shell) return

    // Already in any fullscreen -> exit directly
    if (webFs || isShellFullscreen(shell) || isIosVideoFullscreen(video)) {
      await exitAnyFs()
      return
    }

    setWebFs(false)

    // Prefer DOM Fullscreen on shell when available (Chrome / desktop Safari / many iPads)
    if (canRequestDomFullscreen(shell)) {
      try {
        await exitDomFullscreen()
        await requestDomFullscreen(shell)
        setPlayerFs(true)
        tryLockOrientation(true)
        return
      } catch (e) {
        console.warn('[player] shell fullscreen failed, trying fallbacks', e)
      }
    }

    // iPhone Safari: only video element supports native fullscreen
    if (canIosVideoFullscreen(video)) {
      try {
        enterIosVideoFullscreen(video!)
        setPlayerFs(true)
        tryLockOrientation(true)
        return
      } catch (e) {
        console.warn('[player] iOS video fullscreen failed', e)
      }
    }

    // Fallback for mobile / restricted browsers: CSS webpage fullscreen
    setWebFs(true)
    tryLockOrientation(true)
  }

  /** Expand player to viewport via CSS (no Fullscreen API) */
  async function toggleWebFs() {
    if (webFs || isShellFullscreen(shellRef.current) || isIosVideoFullscreen(videoRef.current)) {
      await exitAnyFs()
      return
    }
    try {
      await exitDomFullscreen()
    } catch {
      /* ignore */
    }
    exitIosVideoFullscreen(videoRef.current)
    setWebFs(true)
    tryLockOrientation(true)
  }

  /** F key / double-click: toggle fullscreen (with iOS / CSS fallbacks) */
  function toggleFs() {
    if (
      webFs ||
      isShellFullscreen(shellRef.current) ||
      isIosVideoFullscreen(videoRef.current)
    ) {
      void exitAnyFs()
    } else {
      void togglePlayerFs()
    }
  }
  toggleFsRef.current = toggleFs

  function applySeek(v: HTMLVideoElement, targetTime: number) {
    const safeTarget = Math.max(0, targetTime)
    lastSkipTRef.current = safeTarget
    // Safari / WebKit native fastSeek for rapid keyframe-accurate seeking
    if (
      typeof (v as HTMLVideoElement & { fastSeek?: (time: number) => void })
        .fastSeek === 'function'
    ) {
      try {
        ;(
          v as HTMLVideoElement & { fastSeek: (time: number) => void }
        ).fastSeek(safeTarget)
        return
      } catch {
        /* fallback to currentTime */
      }
    }
    v.currentTime = safeTarget
  }

  function seekRatio(ratio: number) {
    const v = videoRef.current
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return
    const target = Math.max(0, Math.min(v.duration, ratio * v.duration))
    const cur = v.currentTime || 0
    const delta = Math.round(target - cur)
    if (Math.abs(delta) >= 1) {
      const sign = delta >= 0 ? '+' : '-'
      const formattedTarget = formatTime(target)
      const formattedDelta = `${sign}${formatTime(Math.abs(delta))}`
      flashSkipHint(`${formattedDelta} (${formattedTarget})`, 1000)
    }

    // Optimistically lock UI current progress to prevent Safari timeupdate bounce
    setCurrent(target)
    pendingSeekTargetRef.current = target
    seekLockExpiryRef.current = Date.now() + 1500

    // Spinner only when target is outside buffered ranges (nothing to paint).
    // In-buffer scrub stays silent.
    let covered = false
    try {
      for (let i = 0; i < v.buffered.length; i++) {
        if (target >= v.buffered.start(i) && target <= v.buffered.end(i) - 0.15) {
          covered = true
          break
        }
      }
    } catch {
      /* ignore */
    }
    isSeekingRef.current = true
    setSeekingUi(!covered)
    try {
      applySeek(v, target)
    } catch {
      setSeekingUi(false)
      isSeekingRef.current = false
      pendingSeekTargetRef.current = null
    }
  }

  function seekTo(targetTime: number) {
    const v = videoRef.current
    if (!v) return
    const safeTarget = Math.max(0, targetTime)
    setCurrent(safeTarget)
    pendingSeekTargetRef.current = safeTarget
    seekLockExpiryRef.current = Date.now() + 1500
    applySeek(v, safeTarget)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDropActive(false)
    const file = e.dataTransfer?.files?.[0]
    if (!file) return

    if (isXmlDanmakuFile(file)) {
      danmakuPanel?.onLoadXmlFile(file)
      setPanelTab('import')
      setPanelOpen(true)
      return
    }

    if (isVideoFile(file)) {
      const blobUrl = URL.createObjectURL(file)
      setLocalVideo((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url)
        return { url: blobUrl, name: file.name }
      })

      const rawName = file.name.replace(/\.[^/.]+$/, '')
      if (danmakuPanel?.onKeywordChange) {
        danmakuPanel.onKeywordChange(rawName)
      }
      setPanelTab('search')
    }
  }

  function addFilter() {
    const rule = filterDraft.trim()
    if (!rule) return
    if (danmaku.filters.includes(rule)) {
      setFilterDraft('')
      return
    }
    onDanmakuChange?.({ filters: [...danmaku.filters, rule] })
    setFilterDraft('')
  }

  async function togglePip() {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture()
      }
    } catch (e) {
      console.warn('[player] PiP error', e)
    }
  }

  function handleCaptureFrame() {
    const v = videoRef.current
    if (!v || !v.videoWidth || !v.videoHeight) {
      flashSkipHint('当前无法截图（视频画面未就绪）', 1500)
      return
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (mirror) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      const safeTitle = (title || 'animaku').replace(/[\\/:*?"<>|]/g, '_')
      const timeStr = formatTime(v.currentTime).replace(':', '-')
      a.download = `${safeTitle}_${timeStr}.png`
      a.href = dataUrl
      a.click()
      flashSkipHint('已保存当前帧截图 (PNG)', 1800)
    } catch (e) {
      console.warn('[screenshot failed]', e)
      flashSkipHint('截图失败（可能受跨域保护）', 1800)
    }
  }

  function handleCopyCurrentTimeUrl() {
    const v = videoRef.current
    const t = Math.floor(v?.currentTime || current || 0)
    const url = new URL(window.location.href)
    url.searchParams.set('t', String(t))
    void navigator.clipboard.writeText(url.toString()).then(() => {
      flashSkipHint(`已复制当前时间点播放链接 (${formatTime(t)})`, 1800)
    })
  }

  function handleCopyVideoUrl() {
    void navigator.clipboard.writeText(activeSrc).then(() => {
      flashSkipHint('已复制视频直链地址', 1800)
    })
  }

  function handleCopyDebugStats() {
    const statsObj = {
      title,
      src: activeSrc,
      currentTime: current,
      duration,
      resolution: `${videoRef.current?.videoWidth || 0}x${videoRef.current?.videoHeight || 0}`,
      bandwidthEstimateBps,
      fps,
      droppedFrames,
      totalFrames,
      aspectRatio,
      speed: player.speed || 1,
      volume: player.volume ?? 0.7,
      srMode: player.superResolution || 'off',
      srActive,
      engine: isM3u8(activeSrc) ? 'HLS.js (MSE)' : 'Progressive MP4',
      userAgent: navigator.userAgent,
    }
    void navigator.clipboard.writeText(JSON.stringify(statsObj, null, 2)).then(() => {
      flashSkipHint('已复制调试统计数据 (JSON)', 1800)
    })
  }

  // Periodic FPS & quality sampling
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    let lastTime = performance.now()
    let lastFrames = 0

    const interval = window.setInterval(() => {
      const video = videoRef.current
      if (!video) return

      if (typeof video.getVideoPlaybackQuality === 'function') {
        const q = video.getVideoPlaybackQuality()
        const now = performance.now()
        const dt = (now - lastTime) / 1000
        if (dt > 0.5) {
          const dFrames = q.totalVideoFrames - lastFrames
          if (dFrames >= 0) {
            setFps(Math.round((dFrames / dt) * 10) / 10)
          }
          lastFrames = q.totalVideoFrames
          lastTime = now
        }
        setDroppedFrames(q.droppedVideoFrames)
        setTotalFrames(q.totalVideoFrames)
      }

      if (hlsRef.current?.bandwidthEstimate) {
        setBandwidthEstimateBps(hlsRef.current.bandwidthEstimate)
      }
    }, 1000)

    return () => window.clearInterval(interval)
  }, [activeSrc])

  let sourceHost = ''
  try {
    if (activeSrc.startsWith('http')) {
      const parsed = new URL(activeSrc)
      sourceHost = parsed.hostname
      if (activeSrc.includes('/api/media/proxy')) {
        const realUrl = parsed.searchParams.get('url')
        if (realUrl) {
          sourceHost = `${new URL(realUrl).hostname} (代理中继)`
        }
      }
    } else if (localVideo) {
      sourceHost = `本地文件 (${localVideo.name})`
    }
  } catch {
    sourceHost = ''
  }

  const srMode = (player.superResolution || 'off') as SuperResolutionMode

  const statsData: PlayerStatsData = {
    videoWidth: videoRef.current?.videoWidth || 0,
    videoHeight: videoRef.current?.videoHeight || 0,
    displayWidth: videoRef.current?.clientWidth || 0,
    displayHeight: videoRef.current?.clientHeight || 0,
    fps,
    droppedFrames,
    totalFrames,
    bandwidthEstimateBps,
    lastFragStats,
    bufferAhead: videoRef.current ? bufferedAhead(videoRef.current) : 0,
    duration,
    currentTime: current,
    volume: player.volume ?? 0.7,
    speed: player.speed || 1,
    videoCodec,
    audioCodec,
    engine: isM3u8(activeSrc)
      ? hlsRef.current
        ? 'Hls.js (MSE)'
        : 'Safari 原生 HLS'
      : 'Progressive MP4',
    srMode,
    srActive,
    sourceHost,
    aspectRatio: ASPECT_RATIO_LABELS[aspectRatio] || aspectRatio,
    isPaused: paused,
  }

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0

  const shellClass = [
    'kz-player-shell',
    webFs ? 'kz-web-fs' : '',
    !webFs && embedded ? 'absolute inset-0' : '',
    !webFs && !embedded
      ? 'kz-player-frame relative rounded-2xl border border-[var(--kz-border)]'
      : '',
    srActive ? 'kz-sr-on' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const danmakuPanelElement =
    danmakuPanel && panelOpen ? (
      <DanmakuPanel
        open
        tab={panelTab}
        onTabChange={setPanelTab}
        onClose={() => setPanelOpen(false)}
        status={danmakuPanel.status}
        commentsCount={danmakuPanel.commentsCount}
        visibleCount={danmakuPanel.visibleCount}
        danmaku={danmaku}
        onDanmakuChange={(p) => onDanmakuChange?.(p)}
        keyword={danmakuPanel.keyword}
        onKeywordChange={danmakuPanel.onKeywordChange}
        onSearch={danmakuPanel.onSearch}
        searchBusy={danmakuPanel.searchBusy}
        animes={danmakuPanel.animes}
        episodes={danmakuPanel.episodes}
        animeId={danmakuPanel.animeId}
        episodeId={danmakuPanel.episodeId}
        onAnimeChange={danmakuPanel.onAnimeChange}
        onEpisodeChange={danmakuPanel.onEpisodeChange}
        bvInput={danmakuPanel.bvInput}
        onBvInputChange={danmakuPanel.onBvInputChange}
        bvPage={danmakuPanel.bvPage}
        onBvPageChange={danmakuPanel.onBvPageChange}
        onLoadBilibili={danmakuPanel.onLoadBilibili}
        bilibiliBusy={danmakuPanel.bilibiliBusy}
        onPickXmlFile={() => xmlInputRef.current?.click()}
        filterDraft={filterDraft}
        onFilterDraftChange={setFilterDraft}
        onAddFilter={addFilter}
        onRemoveFilter={(rule) =>
          onDanmakuChange?.({
            filters: danmaku.filters.filter((r) => r !== rule),
          })
        }
        sources={danmakuPanel.sources}
        onToggleSource={danmakuPanel.onToggleSource}
        poolOffsets={danmakuPanel.poolOffsets}
        onSetPoolOffset={danmakuPanel.onSetPoolOffset}
        danmakuOffset={danmakuPanel.danmakuOffset}
        onResetOffset={danmakuPanel.onResetOffset}
        /* Desktop: clear the control bar. Mobile uses bottom-sheet layout. */
        bottomOffset={56}
        layout={pointerMode}
      />
    ) : null

  const opedDrawerElement =
    bangumiId && bangumiId > 0 && opedDrawerOpen ? (
      <OpedMarkerDrawer
        open
        onClose={() => setOpedDrawerOpen(false)}
        currentTime={current}
        duration={duration}
        bangumiId={bangumiId}
        bangumiTitle={title}
        episodeNumber={episodeNumber ?? 1}
        totalEpisodes={totalEpisodes}
        officialOpedData={officialOpedData}
        onSeek={seekTo}
        onToast={(msg) => flashSkipHint(msg, 2000)}
        layout={pointerMode}
      />
    ) : null

  const controlsProps: PlayerControlsProps = {
    title,
    showBar,
    paused,
    panelOpen,
    speedMenuOpen,
    srMenuOpen,
    volumeMenuOpen,
    current,
    duration,
    progress,
    comments,
    danmakuEnabled: danmaku.enabled !== false,
    danmakuSimplify: Boolean(danmaku.simplify),
    hasDanmakuPanel: Boolean(danmakuPanel),
    danmakuPanelNode: danmakuPanelElement,
    hasOpedDrawer: Boolean(bangumiId && bangumiId > 0),
    opedDrawerOpen,
    opedDrawerNode: opedDrawerElement,
    player,
    srMode,
    srActive,
    webGpuOk,
    playerFs,
    webFs,
    widescreen: isWidescreen,
    onToggleWidescreen: handleToggleWidescreen,
    aspectRatio,
    onAspectRatioChange: setAspectRatioMode,
    settingsMenuOpen,
    onToggleSettingsMenu: () => {
      setPanelOpen(false)
      setSpeedMenuOpen(false)
      setSrMenuOpen(false)
      setVolumeMenuOpen(false)
      setOpedDrawerOpen(false)
      setSettingsMenuOpen((v) => !v)
    },
    onToggleAutoNext: () => {
      const next = player.autoNext === false ? true : false
      onPlayerChange?.({ autoNext: next })
      flashSkipHint(next ? '自动连播：已开启' : '自动连播：已关闭', 1500)
    },
    onToggleOpedSkip: () => {
      const next = player.preferBangumiOped === false ? true : false
      onPlayerChange?.({ preferBangumiOped: next })
      flashSkipHint(next ? '跳过片头片尾：已开启' : '跳过片头片尾：已关闭', 1500)
    },
    onToggleOpedDrawer: () => {
      setPanelOpen(false)
      setSpeedMenuOpen(false)
      setSrMenuOpen(false)
      setVolumeMenuOpen(false)
      setSettingsMenuOpen(false)
      setOpedDrawerOpen((v) => !v)
    },
    onTogglePlay: togglePlay,
    onPrev,
    onNext,
    onSeekRatio: seekRatio,
    onToggleDanmaku: () => {
      if (onToggleDanmaku) {
        onToggleDanmaku()
        return
      }
      const cur = danmakuRef.current
      const isEnabled = cur.enabled !== false
      const isSimplify = Boolean(cur.simplify)
      if (isEnabled && !isSimplify) {
        onDanmakuChange?.({ enabled: true, simplify: true })
      } else if (isEnabled && isSimplify) {
        onDanmakuChange?.({ enabled: false, simplify: false })
      } else {
        onDanmakuChange?.({ enabled: true, simplify: false })
      }
    },
    onTogglePanel: () => {
      setSpeedMenuOpen(false)
      setSrMenuOpen(false)
      setVolumeMenuOpen(false)
      setSettingsMenuOpen(false)
      setOpedDrawerOpen(false)
      setPanelOpen((v) => !v)
    },
    onToggleSpeedMenu: () => {
      setPanelOpen(false)
      setSrMenuOpen(false)
      setVolumeMenuOpen(false)
      setSettingsMenuOpen(false)
      setOpedDrawerOpen(false)
      setSpeedMenuOpen((v) => !v)
    },
    onToggleSrMenu: () => {
      setPanelOpen(false)
      setSpeedMenuOpen(false)
      setVolumeMenuOpen(false)
      setSettingsMenuOpen(false)
      setOpedDrawerOpen(false)
      setSrMenuOpen((v) => !v)
    },
    onToggleVolumeMenu: () => {
      setPanelOpen(false)
      setSpeedMenuOpen(false)
      setSrMenuOpen(false)
      setSettingsMenuOpen(false)
      setOpedDrawerOpen(false)
      setVolumeMenuOpen((v) => !v)
    },
    onPickSpeed: (s) => {
      const v = videoRef.current
      if (v) {
        try {
          v.defaultPlaybackRate = s
          v.playbackRate = s
        } catch {
          /* ignore */
        }
      }
      onPlayerChange?.({ speed: s })
      setSpeedMenuOpen(false)
    },
    onPickSr: (m) => {
      onPlayerChange?.({ superResolution: m })
      setSrMenuOpen(false)
      if (m === 'off') {
        flashSrHint('超分已关闭', 1600)
      }
    },
    onVolume: (vol) => {
      if (vol > 0.001) lastAudibleVolumeRef.current = vol
      if (videoRef.current) {
        videoRef.current.volume = vol
        videoRef.current.muted = vol <= 0
      }
      onPlayerChange?.({ volume: vol })
    },
    onToggleMute: () => {
      const v = videoRef.current
      const cur = player.volume ?? 0
      const muted = cur <= 0.001 || Boolean(v?.muted)
      if (muted) {
        const restore = lastAudibleVolumeRef.current || 0.7
        if (v) {
          v.muted = false
          v.volume = restore
        }
        onPlayerChange?.({ volume: restore })
      } else {
        if ((player.volume ?? 0) > 0.001) {
          lastAudibleVolumeRef.current = player.volume
        }
        if (v) {
          v.muted = true
          // Keep element volume for restore; settings show 0 as muted
          // (slider + icon reflect player.volume)
          v.volume = 0
        }
        onPlayerChange?.({ volume: 0 })
      }
    },
    onTogglePlayerFs: () => {
      void togglePlayerFs()
    },
    onToggleWebFs: toggleWebFs,
    formatTime,
    speedOptions: PLAYER_SPEEDS,
    srLabels: SUPER_RESOLUTION_LABELS,
  }

  return (
    <div
      ref={shellRef}
      className={shellClass}
      onMouseEnter={onShellMouseEnter}
      onMouseMove={onShellMouseMove}
      onMouseLeave={onShellMouseLeave}
      onClick={onShellClick}
      onDoubleClick={onShellDoubleClick}
      onContextMenu={(e) => {
        if (pointerMode !== 'desktop') return
        e.preventDefault()
        e.stopPropagation()
        const shell = shellRef.current
        if (!shell) return
        const rect = shell.getBoundingClientRect()
        const menuWidth = 240
        const menuHeight = 380
        const rawX = e.clientX - rect.left
        const rawY = e.clientY - rect.top
        const clampedX = Math.max(8, Math.min(rawX, rect.width - menuWidth - 8))
        const clampedY = Math.max(8, Math.min(rawY, rect.height - menuHeight - 8))
        setContextMenu({
          x: clampedX,
          y: clampedY,
          visible: true,
        })
        setSpeedMenuOpen(false)
        setSrMenuOpen(false)
        setVolumeMenuOpen(false)
        setSettingsMenuOpen(false)
        setPanelOpen(false)
        setOpedDrawerOpen(false)
      }}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropActive(false)
      }}
    >
      {/* Full-size video — never reparented by a third-party UI library */}
      <video
        ref={videoRef}
        className="kz-native-video"
        playsInline
        // Ensure decoder paints (some GPUs need this after MSE attach)
        style={{
          position: 'absolute',
          top: 0,
          left: aspectRatio === '4:3' ? '50%' : 0,
          transform: [
            aspectRatio === '4:3' ? 'translateX(-50%)' : '',
            mirror ? 'scaleX(-1)' : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined,
          width: aspectRatio === '4:3' ? 'auto' : '100%',
          height: '100%',
          maxWidth: '100%',
          aspectRatio: aspectRatio === '4:3' ? '4 / 3' : undefined,
          objectFit:
            aspectRatio === 'cover'
              ? 'cover'
              : aspectRatio === 'fill' || aspectRatio === '4:3'
                ? 'fill'
                : 'contain',
          background: '#000',
          zIndex: 0,
        }}
      />

      {/*
        Anime4K output. Keep in layout when mode≠off (display:none collapses size
        and breaks sizing). Hide picture with opacity until pipeline is live so
        we don't flash a black canvas over the video.
      */}
      <canvas
        ref={canvasRef}
        className="kz-sr-canvas"
        aria-hidden={srMode === 'off' || !srActive}
        style={{
          position: 'absolute',
          top: 0,
          left: aspectRatio === '4:3' ? '50%' : 0,
          transform: [
            aspectRatio === '4:3' ? 'translateX(-50%)' : '',
            mirror ? 'scaleX(-1)' : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined,
          width: aspectRatio === '4:3' ? 'auto' : '100%',
          height: '100%',
          maxWidth: '100%',
          aspectRatio: aspectRatio === '4:3' ? '4 / 3' : undefined,
          objectFit:
            aspectRatio === 'cover'
              ? 'cover'
              : aspectRatio === 'fill' || aspectRatio === '4:3'
                ? 'fill'
                : 'contain',
          display: srMode === 'off' ? 'none' : 'block',
          opacity: srActive ? 1 : 0,
          zIndex: 1,
        }}
      />

      {/* Danmaku overlay — transparent, no 3d transform (see CSS) */}
      <div
        ref={layerRef}
        className="kz-danmaku-layer"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          pointerEvents: 'none',
          background: 'transparent',
          overflow: 'hidden',
        }}
      />

      {(loading || seekingUi || bufferingUi) && !mediaError && (
        <div className="kz-status-layer" aria-busy="true">
          <div className="kz-stall-spinner" aria-label="加载中" />
        </div>
      )}

      {mediaError && (
        <div className="kz-status-layer">
          <div className="kz-media-error">{mediaError}</div>
        </div>
      )}

      {offsetHint && !mediaError && (
        <div className="kz-status-layer" style={{ alignItems: 'flex-start', paddingTop: '12%' }}>
          <div className="kz-status-hint">{offsetHint}</div>
        </div>
      )}

      {hudMessage && !mediaError && (
        <div className="kz-status-layer" style={{ alignItems: 'flex-start', paddingTop: '7%' }}>
          <div className="kz-status-hint flex items-center gap-2">
            <span className="flex h-2 w-2 relative flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--kz-accent)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--kz-accent)]" />
            </span>
            <span className="text-xs sm:text-sm font-medium">{hudMessage}</span>
          </div>
        </div>
      )}

      {dropActive && (
        <div className="kz-drop-overlay">松开以加载本地视频或弹幕 XML</div>
      )}

      {/* Center Spring Ripple for Play/Pause micro-interaction */}
      {ripple && (
        <div key={ripple.id} className="kz-player-ripple" aria-hidden="true">
          {ripple.type === 'play' ? (
            <svg className="w-8 h-8 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
        </div>
      )}

      {/* Center play when paused */}
      {paused && !loading && !seekingUi && !bufferingUi && !mediaError && (
        <button
          type="button"
          className="kz-big-play"
          aria-label="播放"
          onClick={togglePlay}
        >
          ▶
        </button>
      )}

      {/* Modern Next-Episode Floating Toast */}
      {countdown !== null && !mediaError && (
        <div className="kz-countdown-layer" onClick={(e) => e.stopPropagation()}>
          <div className="kz-countdown-overlay">
            <div className="kz-countdown-ring-wrap">
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="94.2"
                  strokeDashoffset={94.2 * (1 - countdown / 4)}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <span className="kz-countdown-number">{countdown}</span>
            </div>
            <div className="kz-countdown-info">
              <span className="kz-countdown-label">即将播放下一话</span>
              <span className="kz-countdown-sub">已开启自动连播</span>
            </div>
            <div className="kz-countdown-actions">
              <button
                type="button"
                className="kz-countdown-btn kz-countdown-btn--primary"
                onClick={(e) => {
                  e.stopPropagation()
                  doNext()
                }}
              >
                立即播放
              </button>
              <button
                type="button"
                className="kz-countdown-btn kz-countdown-btn--secondary"
                onClick={(e) => {
                  e.stopPropagation()
                  cancelCountdown()
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control bar — desktop vs mobile chrome isolated under ./chrome/ */}
      {pointerMode === 'desktop' ? (
        <DesktopControls key="desktop" {...controlsProps} />
      ) : (
        <MobileControls key="mobile" {...controlsProps} />
      )}

      {/* Desktop Player Context Menu */}
      {pointerMode === 'desktop' && (
        <PlayerContextMenu
          key={`${contextMenu.x}-${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          visible={contextMenu.visible}
          onClose={() =>
            setContextMenu((prev) => ({ ...prev, visible: false }))
          }
          statsOpen={statsOpen}
          onToggleStats={() => setStatsOpen((v) => !v)}
          mirror={mirror}
          onToggleMirror={() => {
            setMirror((v) => {
              const next = !v
              flashSkipHint(
                next ? '画面镜像：已开启' : '画面镜像：已关闭',
                1500,
              )
              return next
            })
          }}
          loop={loop}
          onToggleLoop={() => {
            setLoop((v) => {
              const next = !v
              flashSkipHint(
                next ? '循环播放：已开启' : '循环播放：已关闭',
                1500,
              )
              return next
            })
          }}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatioMode}
          speed={player.speed || 1}
          onPickSpeed={(s) => {
            const v = videoRef.current
            if (v) {
              try {
                v.defaultPlaybackRate = s
                v.playbackRate = s
              } catch {
                /* ignore */
              }
            }
            onPlayerChange?.({ speed: s })
          }}
          speedOptions={PLAYER_SPEEDS}
          srMode={srMode}
          srActive={srActive}
          webGpuOk={webGpuOk}
          onPickSr={(m) => {
            onPlayerChange?.({ superResolution: m })
            if (m === 'off') {
              flashSrHint('超分已关闭', 1600)
            }
          }}
          srLabels={SUPER_RESOLUTION_LABELS}
          widescreen={isWidescreen}
          onToggleWidescreen={handleToggleWidescreen}
          playerFs={playerFs}
          onTogglePlayerFs={() => void togglePlayerFs()}
          webFs={webFs}
          onToggleWebFs={toggleWebFs}
          pipActive={pipActive}
          pipSupported={pipSupported}
          onTogglePip={togglePip}
          onCaptureFrame={handleCaptureFrame}
          onCopyCurrentTimeUrl={handleCopyCurrentTimeUrl}
          onCopyVideoUrl={handleCopyVideoUrl}
          onCopyDebugStats={handleCopyDebugStats}
          videoWidth={videoRef.current?.videoWidth || 0}
          videoHeight={videoRef.current?.videoHeight || 0}
          bandwidthEstimateBps={bandwidthEstimateBps}
        />
      )}

      {/* Video Detailed Stats for Nerds HUD */}
      {statsOpen && (
        <PlayerStatsOverlay
          stats={statsData}
          onClose={() => setStatsOpen(false)}
          formatTime={formatTime}
        />
      )}

      {/* Mobile danmaku sheet portal */}
      {pointerMode === 'mobile' && danmakuPanelElement}

      {/* Mobile OP/ED marker sheet portal */}
      {pointerMode === 'mobile' && opedDrawerElement}

      {danmakuPanel && (
        <input
          ref={xmlInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) danmakuPanel.onLoadXmlFile(f)
            e.target.value = ''
          }}
        />
      )}
    </div>
  )
}
