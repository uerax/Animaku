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
import {
  determineOpedAction,
  PLAYER_SPEEDS,
  type SuperResolutionMode,
} from '@animaku/shared'
import { SUPER_RESOLUTION_LABELS } from './anime4k'
import { DanmakuPanel, type DanmakuPanelTab } from './DanmakuPanel'
import type { DanmakuPanelState, VideoPlayerProps } from './types'
import { formatTime, isVideoFile, isXmlDanmakuFile } from './media/format'
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

// Sub-modules & Overlays
import {
  PlaybackRipple,
  DanmakuDropOverlay,
  PlayerStatusOverlay,
  FirstEpPromptOverlay,
  AutoNextOverlay,
  type FirstEpPromptData,
} from './overlays'

// Functional Hooks
import {
  useIntentGuard,
  usePlayerFullscreen,
  usePlaybackStats,
  usePlayerShortcuts,
  useAnime4KPipeline,
  useDanmakuBridge,
  usePlaybackResume,
  useMediaEngine,
} from './hooks'

export type { DanmakuPanelState, VideoPlayerProps } from './types'
export type AspectRatioMode = 'contain' | 'cover' | 'fill' | '4:3'

const ASPECT_RATIO_LABELS: Record<AspectRatioMode, string> = {
  contain: '默认比例 (16:9)',
  cover: '画面铺满 (Cover)',
  fill: '100% 拉伸 (Fill)',
  '4:3': '画幅 4:3',
}

export function VideoPlayer({
  title,
  src,
  formatHint,
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
  episodeIndex,
  totalEpisodes,
  officialOpedData,
  widescreen: controlledWidescreen,
  onToggleWidescreen: controlledToggleWidescreen,
}: VideoPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const xmlInputRef = useRef<HTMLInputElement>(null)

  // Local video playback override
  const [localVideo, setLocalVideo] = useState<{ url: string; name: string } | null>(null)
  const activeSrc = localVideo?.url || src

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

  // Hints & Toast
  const [offsetHint, setOffsetHint] = useState('')
  const offsetHintTimer = useRef(0)

  const flashSkipHint = useCallback((msg: string, ms = 1500) => {
    setOffsetHint(msg)
    window.clearTimeout(offsetHintTimer.current)
    offsetHintTimer.current = window.setTimeout(() => setOffsetHint(''), ms)
  }, [])

  const flashSrHint = useCallback((msg: string, ms = 4500) => {
    setOffsetHint(msg)
    window.clearTimeout(offsetHintTimer.current)
    offsetHintTimer.current = window.setTimeout(() => setOffsetHint(''), ms)
  }, [])

  useEffect(() => {
    if (localVideo?.name) {
      flashSrHint(`已加载本地视频：${localVideo.name}`, 3500)
    }
  }, [localVideo, flashSrHint])

  // Central ripple animation for play/pause micro-interaction
  const [ripple, setRipple] = useState<{ id: number; type: 'play' | 'pause' } | null>(null)
  const rippleTimerRef = useRef(0)

  const triggerRipple = useCallback((type: 'play' | 'pause') => {
    window.clearTimeout(rippleTimerRef.current)
    setRipple({ id: Date.now(), type })
    rippleTimerRef.current = window.setTimeout(() => {
      setRipple(null)
    }, 500)
  }, [])

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

  // Widescreen
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

  // Aspect ratio
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

  const [mirror, setMirror] = useState(false)
  const [loop, setLoop] = useState(false)
  const loopRef = useRef(loop)
  loopRef.current = loop

  // Menus and panels state
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<DanmakuPanelTab>('search')
  const [filterDraft, setFilterDraft] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [srMenuOpen, setSrMenuOpen] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [opedDrawerOpen, setOpedDrawerOpen] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const [pipSupported, setPipSupported] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    visible: boolean
  }>({
    x: 0,
    y: 0,
    visible: false,
  })

  // Fullscreen management
  const {
    playerFs,
    webFs,
    togglePlayerFs,
    toggleWebFs,
    toggleFs,
    exitAnyFs,
  } = usePlayerFullscreen({
    shellRef,
    videoRef,
    src: activeSrc,
  })

  // Pointer & Visibility
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
  } = useChromeVisibility({
    pointerMode,
    menusOpen,
    isPaused: () => Boolean(videoRef.current?.paused),
  })

  // Intent Guard
  const {
    withIntentGuard,
    shouldSuppressPause,
  } = useIntentGuard()

  // First-episode OP/ED skip protection overlay (index 0)
  const [firstEpPrompt, setFirstEpPrompt] = useState<FirstEpPromptData | null>(null)
  const firstEpPromptTimerRef = useRef(0)
  const promptTriggeredThisEpRef = useRef(false)
  const keepWholeEpisodeRef = useRef(false)

  // Auto-next countdown overlay
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownIntervalRef = useRef(0)

  const cancelCountdown = useCallback(() => {
    window.clearInterval(countdownIntervalRef.current)
    countdownIntervalRef.current = 0
    setCountdown(null)
  }, [])

  const cancelFirstEpPrompt = useCallback(() => {
    if (firstEpPromptTimerRef.current) {
      window.clearInterval(firstEpPromptTimerRef.current)
      firstEpPromptTimerRef.current = 0
    }
    setFirstEpPrompt(null)
  }, [])

  useEffect(() => {
    promptTriggeredThisEpRef.current = false
    keepWholeEpisodeRef.current = false
    cancelFirstEpPrompt()
    cancelCountdown()
  }, [bangumiId, episodeNumber, episodeIndex, activeSrc, cancelFirstEpPrompt, cancelCountdown])

  // Danmaku Bridge
  const {
    noteDanmakuMediaReady,
  } = useDanmakuBridge({
    shellRef,
    videoRef,
    layerRef,
    comments,
    danmaku,
    pointerMode,
    playerFs,
    webFs,
    onFlashHint: flashSkipHint,
  })

  // Forward refs for callbacks
  const hlsHolderRef = useRef<any>(null)
  const isSeekingRefHolder = useRef(false)
  const skipBusyRef = useRef(false)
  const lastSkipTRef = useRef(0)
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext

  // Resume scheduler
  const {
    tryApplyInitialResume,
  } = usePlaybackResume({
    videoRef,
    hlsRef: hlsHolderRef,
    activeSrc,
    formatHint,
    initialTime,
    continuePlay: player.continuePlay,
    onResumed: (safeTarget) => {
      lastSkipTRef.current = safeTarget
    },
  })

  // Playback Stats
  const {
    fps,
    droppedFrames,
    totalFrames,
    bandwidthEstimateBps,
    setBandwidthEstimateBps,
    lastFragStats,
    setLastFragStats,
    videoCodec,
    setVideoCodec,
    audioCodec,
    setAudioCodec,
    handleTimeUpdateStats,
    handlePauseStats,
    handleEndedStats,
    resetPlayTick,
  } = usePlaybackStats({
    videoRef,
    hlsRef: hlsHolderRef,
    activeSrc,
    bangumiId,
    episodeNumber,
    episodeIndex,
    onProgress,
  })

  // Core Media Engine
  const {
    hlsRef,
    loading,
    paused,
    current,
    duration,
    seekingUi,
    bufferingUi,
    mediaError,
    togglePlay,
    applySeek,
    seekTo,
    seekRatio,
    applySpeedChange,
    handleVolumeChange,
    toggleMute,
  } = useMediaEngine({
    videoRef,
    activeSrc,
    formatHint,
    playerSettings: player,
    onPlayerChange,
    onMediaAuthExpired,
    onMediaLoadFailed,
    withIntentGuard,
    shouldSuppressPause,
    onFlashHint: flashSkipHint,
    triggerRipple,
    bumpBar,
    setShowBar,
    showBarRef,
    onNoteDanmakuReady: noteDanmakuMediaReady,
    tryApplyInitialResume,
    onTimeUpdateExtra: (t, d) => {
      // 1. Stats & History progress
      handleTimeUpdateStats(t, d, isSeekingRefHolder.current)

      // 2. OP/ED skip check
      if (!Number.isFinite(d) || d <= 0) {
        lastSkipTRef.current = t
        return
      }

      const prevT = lastSkipTRef.current
      lastSkipTRef.current = t

      if (isSeekingRefHolder.current || skipBusyRef.current || t >= d - 3) return

      const decision = determineOpedAction({
        currentTime: t,
        prevTime: prevT,
        duration: d,
        isSeeking: isSeekingRefHolder.current,
        isSkipBusy: skipBusyRef.current,
        episodeIndex,
        episodeNumber,
        playerSettings: player,
        promptTriggeredThisEp: promptTriggeredThisEpRef.current,
        keepWholeEpisode: keepWholeEpisodeRef.current,
      })

      if (decision.action === 'prompt') {
        promptTriggeredThisEpRef.current = true
        cancelFirstEpPrompt()
        let count = 5
        setFirstEpPrompt({
          type: decision.type,
          targetTime: decision.targetTime,
          countdown: count,
        })
        firstEpPromptTimerRef.current = window.setInterval(() => {
          count -= 1
          if (count <= 0) {
            cancelFirstEpPrompt()
            keepWholeEpisodeRef.current = true
          } else {
            setFirstEpPrompt((prev) => (prev ? { ...prev, countdown: count } : null))
          }
        }, 1000)
      } else if (decision.action === 'skip') {
        const video = videoRef.current
        if (video) {
          skipBusyRef.current = true
          lastSkipTRef.current = decision.targetTime
          video.currentTime = decision.targetTime
          if (decision.hint) {
            flashSkipHint(decision.hint)
          }
          setTimeout(() => {
            skipBusyRef.current = false
          }, 1500)
        }
      }
    },
    onPauseExtra: (t, d) => {
      handlePauseStats(t, d)
    },
    onEndedExtra: () => {
      handleEndedStats()
      if (loopRef.current) {
        const v = videoRef.current
        if (v) {
          v.currentTime = 0
          void v.play().catch(() => {})
        }
        return
      }
      if (player.autoNext && onNextRef.current) {
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
    },
    onFragLoadedExtra: (hls, data) => {
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
    },
  })

  // Sync hls instance to forward holder
  hlsHolderRef.current = hlsRef.current

  // Anime4K Pipeline
  const { srActive, webGpuOk } = useAnime4KPipeline({
    videoRef,
    canvasRef,
    shellRef,
    activeSrc,
    superResolution: player.superResolution,
    srMenuOpen,
    onFlashHint: flashSrHint,
  })

  // First episode skip protection handlers
  function handleConfirmFirstEpSkip() {
    if (!firstEpPrompt) return
    const { type, targetTime } = firstEpPrompt
    cancelFirstEpPrompt()
    const video = videoRef.current
    if (video) {
      skipBusyRef.current = true
      lastSkipTRef.current = targetTime
      video.currentTime = targetTime
      flashSkipHint(type === 'op' ? '已跳过片头' : '已跳过片尾')
      setTimeout(() => {
        skipBusyRef.current = false
      }, 1500)
    }
  }

  function handleDismissFirstEpPrompt() {
    cancelFirstEpPrompt()
    keepWholeEpisodeRef.current = true
  }

  function doNext() {
    cancelCountdown()
    onNextRef.current?.()
  }

  // Shell Pointer handlers
  const {
    onShellClick,
    onShellDoubleClick,
    onShellMouseMove,
    onShellMouseLeave,
    onShellMouseEnter,
  } = useShellPointerHandlers(pointerMode, {
    togglePlay,
    toggleFs,
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

  // Shortcuts
  usePlayerShortcuts({
    videoRef,
    onTogglePlay: togglePlay,
    onSeekTo: (t) => {
      const v = videoRef.current
      if (v) {
        cancelCountdown()
        cancelFirstEpPrompt()
        resetPlayTick(t)
        seekTo(t)
      }
    },
    onPrev,
    onNext,
    onToggleFs: toggleFs,
    onToggleWebFs: toggleWebFs,
    onToggleAspectRatio: toggleAspectRatio,
    onToggleDanmaku,
    onDanmakuChange,
    danmaku,
    danmakuPanel,
    onTogglePanel: () => setPanelOpen((v) => !v),
    onCloseAllMenus: () => {
      setPanelOpen(false)
      setSpeedMenuOpen(false)
      setSrMenuOpen(false)
      setVolumeMenuOpen(false)
      setSettingsMenuOpen(false)
      setOpedDrawerOpen(false)
      setContextMenu((prev) => ({ ...prev, visible: false }))
      setStatsOpen(false)
      void exitAnyFs()
    },
    onFlashHint: flashSkipHint,
  })

  // Drag & drop local files
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

  // PiP
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

  // Right-click context actions
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
      engine: activeSrc.includes('.m3u8') ? 'HLS.js (MSE)' : 'Progressive MP4',
      userAgent: navigator.userAgent,
    }
    void navigator.clipboard.writeText(JSON.stringify(statsObj, null, 2)).then(() => {
      flashSkipHint('已复制调试统计数据 (JSON)', 1800)
    })
  }

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
    bufferAhead: videoRef.current ? (videoRef.current.buffered.length > 0 ? videoRef.current.buffered.end(videoRef.current.buffered.length - 1) - videoRef.current.currentTime : 0) : 0,
    duration,
    currentTime: current,
    volume: player.volume ?? 0.7,
    speed: player.speed || 1,
    videoCodec,
    audioCodec,
    engine: activeSrc.includes('.m3u8')
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
        onAddFilter={() => {
          const rule = filterDraft.trim()
          if (!rule) return
          if (danmaku.filters.includes(rule)) {
            setFilterDraft('')
            return
          }
          onDanmakuChange?.({ filters: [...danmaku.filters, rule] })
          setFilterDraft('')
        }}
        onRemoveFilter={(rule) =>
          onDanmakuChange?.({
            filters: danmaku.filters.filter((r) => r !== rule),
          })
        }
        sources={danmakuPanel.sources}
        onToggleSource={danmakuPanel.onToggleSource}
        poolOffsets={danmakuPanel.poolOffsets}
        onSetPoolOffset={danmakuPanel.onSetPoolOffset}
        globalTimeOffset={danmakuPanel.globalTimeOffset}
        onSetGlobalTimeOffset={danmakuPanel.onSetGlobalTimeOffset}
        onClearEpisodeTimeOffsets={danmakuPanel.onClearEpisodeTimeOffsets}
        danmakuOffset={danmakuPanel.danmakuOffset}
        onResetOffset={danmakuPanel.onResetOffset}
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
      const isEnabled = danmaku.enabled !== false
      const isSimplify = Boolean(danmaku.simplify)
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
      applySpeedChange(s)
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
      handleVolumeChange(vol)
    },
    onToggleMute: toggleMute,
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
      {/* Full-size video */}
      <video
        ref={videoRef}
        className="kz-native-video"
        playsInline
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

      {/* Anime4K output canvas */}
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

      {/* Danmaku layer */}
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

      {/* Status overlay (Spinner, Error, Hints, Hud) */}
      <PlayerStatusOverlay
        loading={loading}
        seekingUi={seekingUi}
        bufferingUi={bufferingUi}
        mediaError={mediaError}
        offsetHint={offsetHint}
        hudMessage={hudMessage ?? undefined}
      />

      {/* Drag & drop overlay */}
      <DanmakuDropOverlay active={dropActive} />

      {/* Central Play/Pause Spring Ripple */}
      <PlaybackRipple ripple={ripple} />

      {/* Center play button when paused */}
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

      {/* First-Episode OP/ED Skip Prompt Toast */}
      <FirstEpPromptOverlay
        prompt={firstEpPrompt}
        mediaError={mediaError}
        onConfirm={handleConfirmFirstEpSkip}
        onDismiss={handleDismissFirstEpPrompt}
      />

      {/* Modern Next-Episode Floating Toast */}
      <AutoNextOverlay
        countdown={countdown}
        mediaError={mediaError}
        onPlayNow={doNext}
        onCancel={cancelCountdown}
      />

      {/* Control bar */}
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
            applySpeedChange(s)
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
