import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type Hls from 'hls.js'
import { filterM3u8AdsIfApplicable, type AdBlockerMode, type PlayerSettings } from '@animaku/shared'
import {
  bufferedAhead,
  formatTime,
  inferMediaMimeType,
  isM3u8,
} from '../media/format'
import type { PlayerTimeStore } from '../timeStore'
import { perfMetrics } from '../../lib/performance-metrics'

/** Min buffer before first play — tiered for HLS vs progressive MP4. */
const MIN_START_BUFFER_HLS_SEC = 0.4
const MIN_START_BUFFER_MP4_SEC = 0.4
/** Don't stall forever on empty CDN; start anyway after this. */
const MAX_START_WAIT_MS = 3_500

export interface UseMediaEngineOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  activeSrc: string
  bangumiId?: number
  formatHint?: string
  adBlockerMode?: AdBlockerMode
  playerSettings: PlayerSettings
  timeStore?: PlayerTimeStore
  onPlayerChange?: (partial: Partial<PlayerSettings>) => void
  onMediaAuthExpired?: (position: number) => void | Promise<void>
  onMediaLoadFailed?: (info: { position: number; reason: string }) => void
  withIntentGuard: (durationMs: number, action: () => void) => void
  shouldSuppressPause: (v: HTMLVideoElement) => boolean
  onTimeUpdateExtra?: (t: number, d: number) => void
  onPauseExtra?: (t: number, d: number) => void
  onEndedExtra?: () => void
  onFragLoadedExtra?: (hls: Hls, data: any) => void
  onNoteDanmakuReady?: () => void
  tryApplyInitialResume?: () => boolean
  onFlashHint?: (msg: string, ms?: number) => void
  triggerRipple?: (type: 'play' | 'pause') => void
  bumpBar?: () => void
  setShowBar?: (show: boolean) => void
  showBarRef?: { current: boolean }
}

export function useMediaEngine({
  videoRef,
  activeSrc,
  bangumiId,
  formatHint,
  adBlockerMode,
  playerSettings,
  timeStore,
  onPlayerChange,
  onMediaAuthExpired,
  onMediaLoadFailed,
  withIntentGuard,
  shouldSuppressPause,
  onTimeUpdateExtra,
  onPauseExtra,
  onEndedExtra,
  onFragLoadedExtra,
  onNoteDanmakuReady,
  tryApplyInitialResume,
  onFlashHint,
  triggerRipple,
  bumpBar,
  setShowBar,
  showBarRef,
}: UseMediaEngineOptions) {
  const hlsRef = useRef<Hls | null>(null)
  const genRef = useRef(0)
  const userPausedRef = useRef(false)
  const isSeekingRef = useRef(false)
  const pendingSeekTargetRef = useRef<number | null>(null)
  const seekLockExpiryRef = useRef(0)
  const lastSkipTRef = useRef(0)
  const lastUiProgressRef = useRef(0)
  const ignoreVolumePersistRef = useRef(false)
  const lastAudibleVolumeRef = useRef(
    playerSettings.volume && playerSettings.volume > 0 ? playerSettings.volume : 0.7,
  )

  const authAttemptingRef = useRef(false)
  const authRecoverySucceededRef = useRef(false)
  const loadFailedOnceRef = useRef(false)
  const mediaErrorWindowCountRef = useRef(0)
  const lastMediaErrorTimeRef = useRef(0)
  const sessionMediaErrorTotalRef = useRef(0)

  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(true)
  const [duration, setDuration] = useState(0)
  const [seekingUi, setSeekingUi] = useState(false)
  const [bufferingUi, setBufferingUi] = useState(false)
  const [mediaError, setMediaError] = useState('')

  const playerSettingsRef = useRef(playerSettings)
  playerSettingsRef.current = playerSettings
  const onPlayerChangeRef = useRef(onPlayerChange)
  onPlayerChangeRef.current = onPlayerChange
  const onMediaAuthExpiredRef = useRef(onMediaAuthExpired)
  onMediaAuthExpiredRef.current = onMediaAuthExpired
  const onMediaLoadFailedRef = useRef(onMediaLoadFailed)
  onMediaLoadFailedRef.current = onMediaLoadFailed

  const onTimeUpdateExtraRef = useRef(onTimeUpdateExtra)
  onTimeUpdateExtraRef.current = onTimeUpdateExtra
  const onPauseExtraRef = useRef(onPauseExtra)
  onPauseExtraRef.current = onPauseExtra
  const onEndedExtraRef = useRef(onEndedExtra)
  onEndedExtraRef.current = onEndedExtra
  const onFragLoadedExtraRef = useRef(onFragLoadedExtra)
  onFragLoadedExtraRef.current = onFragLoadedExtra
  const onNoteDanmakuReadyRef = useRef(onNoteDanmakuReady)
  onNoteDanmakuReadyRef.current = onNoteDanmakuReady
  const tryApplyInitialResumeRef = useRef(tryApplyInitialResume)
  tryApplyInitialResumeRef.current = tryApplyInitialResume

  const shouldSuppressPauseRef = useRef(shouldSuppressPause)
  shouldSuppressPauseRef.current = shouldSuppressPause
  const withIntentGuardRef = useRef(withIntentGuard)
  withIntentGuardRef.current = withIntentGuard

  const formatHintRef = useRef(formatHint)
  formatHintRef.current = formatHint
  const onFlashHintRef = useRef(onFlashHint)
  onFlashHintRef.current = onFlashHint
  const bumpBarRef = useRef(bumpBar)
  bumpBarRef.current = bumpBar
  const setShowBarRef = useRef(setShowBar)
  setShowBarRef.current = setShowBar

  if ((playerSettings.volume ?? 0) > 0.001) {
    lastAudibleVolumeRef.current = playerSettings.volume!
  }

  const lastAppliedSpeedRef = useRef(playerSettings.speed || 1)

  const applySpeedChange = useCallback(
    (s: number) => {
      const v = videoRef.current
      if (!v) return
      const wasPlaying = !v.paused && !userPausedRef.current
      lastAppliedSpeedRef.current = s
      withIntentGuardRef.current(450, () => {
        try {
          v.playbackRate = s
        } catch {
          /* ignore */
        }
        if (wasPlaying) {
          void v.play().catch(() => {
            /* ignore */
          })
        }
      })
    },
    [videoRef],
  )

  function reportLoadFailed(reason: string) {
    if (loadFailedOnceRef.current) return
    loadFailedOnceRef.current = true
    const pos = videoRef.current?.currentTime || 0
    onMediaLoadFailedRef.current?.({ position: pos, reason })
  }

  function applySeek(v: HTMLVideoElement, targetTime: number) {
    const safeTarget = Math.max(0, targetTime)
    lastSkipTRef.current = safeTarget
    withIntentGuardRef.current(500, () => {
      if (
        !hlsRef.current &&
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
    })
  }

  function seekTo(targetTime: number) {
    const v = videoRef.current
    if (!v) return
    const safeTarget = Math.max(0, targetTime)
    timeStore?.updateTime(safeTarget, v.duration || duration)
    pendingSeekTargetRef.current = safeTarget
    seekLockExpiryRef.current = Date.now() + 1500
    applySeek(v, safeTarget)
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
      onFlashHint?.(`${formattedDelta} (${formattedTarget})`, 1000)
    }

    timeStore?.updateTime(target, v.duration || duration)
    pendingSeekTargetRef.current = target
    seekLockExpiryRef.current = Date.now() + 1500

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

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      userPausedRef.current = false
      triggerRipple?.('play')
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
      bumpBar?.()
    } else {
      userPausedRef.current = true
      setBufferingUi(false)
      triggerRipple?.('pause')
      v.pause()
      if (setShowBar) setShowBar(true)
    }
  }

  function handleVolumeChange(vol: number) {
    if (vol > 0.001) lastAudibleVolumeRef.current = vol
    if (videoRef.current) {
      videoRef.current.volume = vol
      videoRef.current.muted = vol <= 0
    }
    onPlayerChangeRef.current?.({ volume: vol })
  }

  function toggleMute() {
    const v = videoRef.current
    const cur = playerSettingsRef.current.volume ?? 0
    const muted = cur <= 0.001 || Boolean(v?.muted)
    if (muted) {
      const restore = lastAudibleVolumeRef.current || 0.7
      if (v) {
        v.muted = false
        v.volume = restore
      }
      onPlayerChangeRef.current?.({ volume: restore })
    } else {
      if ((playerSettingsRef.current.volume ?? 0) > 0.001) {
        lastAudibleVolumeRef.current = playerSettingsRef.current.volume!
      }
      if (v) {
        v.muted = true
        v.volume = 0
      }
      onPlayerChangeRef.current?.({ volume: 0 })
    }
  }

  // Load media main pipeline
  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl || !activeSrc) return
    const video: HTMLVideoElement = videoEl

    const gen = ++genRef.current
    const alive = () => genRef.current === gen
    let localBlobUrl: string | null = null

    authAttemptingRef.current = false
    authRecoverySucceededRef.current = false
    loadFailedOnceRef.current = false
    mediaErrorWindowCountRef.current = 0
    lastMediaErrorTimeRef.current = 0
    sessionMediaErrorTotalRef.current = 0
    userPausedRef.current = false
    ignoreVolumePersistRef.current = false
    lastUiProgressRef.current = 0
    lastSkipTRef.current = 0
    setMediaError('')
    setLoading(true)
    setSeekingUi(false)
    setBufferingUi(false)
    setPaused(true)
    timeStore?.reset()
    setDuration(0)

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

    const cfg = playerSettingsRef.current
    const applyPlaybackRate = (rate?: number) => {
      const s = rate ?? playerSettingsRef.current.speed ?? 1
      try {
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

    let softPlayCleanup: (() => void) | null = null

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

      const isHls = isM3u8(activeSrc, formatHintRef.current)
      const minStartBuffer = isHls
        ? MIN_START_BUFFER_HLS_SEC
        : MIN_START_BUFFER_MP4_SEC

      const tryStart = () => {
        if (!alive() || settled) return
        const ahead = bufferedAhead(video)
        const waited = Date.now() - startedAt
        const readyEnough =
          (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && ahead >= 0.05) ||
          ahead >= minStartBuffer ||
          waited >= MAX_START_WAIT_MS
        if (!readyEnough) return

        settled = true
        cleanupWaiters()
        const live = playerSettingsRef.current
        ignoreVolumePersistRef.current = true
        applyPlaybackRate(live.speed || 1)
        video.muted = true
        video
          .play()
          .then(() => {
            if (!alive()) return
            const wantVol = playerSettingsRef.current.volume ?? 0.7
            video.muted = wantVol <= 0
            video.volume = wantVol
            applyPlaybackRate(playerSettingsRef.current.speed || 1)
            ignoreVolumePersistRef.current = false
            setPaused(false)
            setLoading(false)
            setBufferingUi(false)
          })
          .catch(() => {
            if (!alive()) return
            const wantVol = playerSettingsRef.current.volume ?? 0.7
            video.muted = wantVol <= 0
            video.volume = wantVol
            applyPlaybackRate(playerSettingsRef.current.speed || 1)
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
      tryStart()
    }

    const onReady = () => {
      if (!alive()) return
      setDuration(video.duration || 0)
      applyPlaybackRate()
      tryApplyInitialResumeRef.current?.()
      softPlay()
      requestAnimationFrame(() => {
        if (!alive()) return
        const v = videoRef.current
        if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          onNoteDanmakuReadyRef.current?.()
        }
      })
    }

    const isControlledOrProxy =
      activeSrc.includes('/api/media/') || /[?&]cookie=/.test(activeSrc)

    const tryAuthRefresh = () => {
      if (
        !alive() ||
        authAttemptingRef.current ||
        authRecoverySucceededRef.current
      ) {
        return false
      }
      if (!isControlledOrProxy || !onMediaAuthExpiredRef.current) {
        return false
      }
      authAttemptingRef.current = true
      const pos = video.currentTime || 0
      setMediaError('')
      setLoading(true)
      onFlashHintRef.current?.('播放凭证失效，正在重新获取…', 4000)
      void Promise.resolve(onMediaAuthExpiredRef.current(pos))
        .then(() => {
          if (!alive()) return
          authRecoverySucceededRef.current = true
          authAttemptingRef.current = false
        })
        .catch(() => {
          if (!alive()) return
          authAttemptingRef.current = false
          setLoading(false)
          setBufferingUi(false)
          setMediaError('凭证刷新失败，建议切换视频源')
        })
      return true
    }

    const attachProgressive = () => {
      while (video.firstChild) {
        video.removeChild(video.firstChild)
      }
      video.removeAttribute('src')

      const sourceEl = document.createElement('source')
      sourceEl.src = activeSrc
      const mime = inferMediaMimeType(activeSrc, formatHintRef.current)
      if (mime) {
        sourceEl.type = mime
      }

      const onDurationChange = () => {
        if (!alive()) return
        const d = video.duration
        if (Number.isFinite(d) && d > 0) setDuration(d)
        tryApplyInitialResumeRef.current?.()
      }
      video.addEventListener('durationchange', onDurationChange)
      ;(video as HTMLVideoElement & { __durationChange?: () => void }).__durationChange = onDurationChange

      const onMediaError = () => {
        if (!alive()) return
        if (tryAuthRefresh()) return
        setLoading(false)
        setBufferingUi(false)
        const reason = video.error?.code
          ? `video_error_${video.error.code}`
          : 'video_load_failed'
        setMediaError(
          video.error?.code
            ? `视频播放失败 code=${video.error.code}，建议切换视频源`
            : '视频加载失败，建议切换视频源',
        )
        reportLoadFailed(reason)
      }

      sourceEl.addEventListener('error', onMediaError, { once: true })
      video.addEventListener('error', onMediaError, { once: true })
      video.appendChild(sourceEl)
      video.load()

      video.addEventListener('loadedmetadata', onReady, { once: true })

      const onStalled = () => {
        if (!alive()) return
        if (!isControlledOrProxy || !onMediaAuthExpiredRef.current) return
        if (authRecoverySucceededRef.current) {
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
        if (authAttemptingRef.current) return
        void fetch(activeSrc, {
          headers: { Range: 'bytes=0-1' },
          credentials: 'same-origin',
        }).then(async (r) => {
          if (!alive()) return
          if (r.status === 403 || r.status === 401) {
            if (authRecoverySucceededRef.current) {
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
          }
        })
      }
      video.addEventListener('stalled', onStalled)
      ;(video as HTMLVideoElement & { __a1Stalled?: () => void }).__a1Stalled = onStalled
    }

    const isIos =
      typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

    const isSafariOrWebKit =
      typeof navigator !== 'undefined' &&
      (isIos ||
        (/^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
          !/android/i.test(navigator.userAgent)))

    const canNativeHls = Boolean(
      video.canPlayType('application/vnd.apple.mpegurl'),
    )

    const preferNativeHls = canNativeHls && (isIos || isSafariOrWebKit)

    const attachNativeHls = (targetSrc = activeSrc) => {
      while (video.firstChild) {
        video.removeChild(video.firstChild)
      }
      video.removeAttribute('src')
      const sourceEl = document.createElement('source')
      sourceEl.src = targetSrc
      sourceEl.type = 'application/vnd.apple.mpegurl'
      const onHlsError = () => {
        if (!alive()) return
        if (tryAuthRefresh()) return
        setLoading(false)
        setMediaError('原生 HLS 加载失败，建议切换视频源')
        reportLoadFailed('native_hls')
      }
      sourceEl.addEventListener('error', onHlsError, { once: true })
      video.addEventListener('error', onHlsError, { once: true })
      video.appendChild(sourceEl)
      video.load()
      video.addEventListener('loadedmetadata', onReady, { once: true })

      let watchdogTimer: number | undefined
      let probeInFlight = false
      let lastProbeTime = 0
      let activeController: AbortController | null = null
      const NATIVE_PROBE_COOLDOWN_MS = 30_000

      const runStatusProbe = () => {
        if (!alive()) return
        if (!isControlledOrProxy || !onMediaAuthExpiredRef.current) return
        if (authAttemptingRef.current || authRecoverySucceededRef.current) return
        if (probeInFlight) return
        const now = Date.now()
        if (now - lastProbeTime < NATIVE_PROBE_COOLDOWN_MS) return

        let ticket = ''
        try {
          const u = new URL(activeSrc, window.location.origin)
          ticket = u.searchParams.get('t') || ''
        } catch {
          /* ignore */
        }
        if (!ticket) return

        probeInFlight = true
        lastProbeTime = now

        const controller = new AbortController()
        activeController = controller
        const timeoutId = window.setTimeout(() => controller.abort(), 3000)

        fetch(`/api/media/status?t=${encodeURIComponent(ticket)}`, {
          method: 'GET',
          cache: 'no-cache',
          credentials: 'same-origin',
          signal: controller.signal,
        })
          .then((r) => {
            window.clearTimeout(timeoutId)
            probeInFlight = false
            activeController = null
            if (!alive()) return
            if (r.status === 401 || r.status === 403) {
              tryAuthRefresh()
            }
          })
          .catch(() => {
            window.clearTimeout(timeoutId)
            probeInFlight = false
            activeController = null
          })
      }

      const scheduleNativeWatchdog = () => {
        if (!alive()) return
        if (!isControlledOrProxy || !onMediaAuthExpiredRef.current) return
        if (authAttemptingRef.current || authRecoverySucceededRef.current) return
        if (video.paused) return

        window.clearTimeout(watchdogTimer)
        const snapshotTime = video.currentTime || 0

        watchdogTimer = window.setTimeout(() => {
          if (!alive()) return
          if (video.paused) return
          const currentTime = video.currentTime || 0
          const hasAdvanced = Math.abs(currentTime - snapshotTime) > 0.1
          const isStarved = video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
          if (!hasAdvanced && isStarved) {
            runStatusProbe()
          }
        }, 2500)
      }

      const cancelNativeWatchdog = () => {
        window.clearTimeout(watchdogTimer)
      }

      video.addEventListener('stalled', scheduleNativeWatchdog)
      video.addEventListener('waiting', scheduleNativeWatchdog)
      video.addEventListener('playing', cancelNativeWatchdog)
      video.addEventListener('timeupdate', cancelNativeWatchdog)

      ;(video as HTMLVideoElement & { __nativeHlsCleanup?: () => void }).__nativeHlsCleanup = () => {
        window.clearTimeout(watchdogTimer)
        activeController?.abort()
        video.removeEventListener('stalled', scheduleNativeWatchdog)
        video.removeEventListener('waiting', scheduleNativeWatchdog)
        video.removeEventListener('playing', cancelNativeWatchdog)
        video.removeEventListener('timeupdate', cancelNativeWatchdog)
      }
    }

    const resolveClientCleanedSrc = async (rawSrc: string): Promise<string> => {
      if (adBlockerMode !== 'client') return rawSrc
      try {
        const res = await fetch(rawSrc, { cache: 'no-cache' })
        if (!res.ok) return rawSrc
        const text = await res.text()
        if (text.includes('#EXT-X-STREAM-INF')) {
          const lines = text.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#')) {
              const variantUrl = new URL(trimmed, rawSrc).href
              const varRes = await fetch(variantUrl, { cache: 'no-cache' })
              if (!varRes.ok) return rawSrc
              const varText = await varRes.text()
              const clean = filterM3u8AdsIfApplicable(varText, variantUrl)
              if (clean.filtered) {
                const blob = new Blob([clean.content], {
                  type: 'application/vnd.apple.mpegurl',
                })
                localBlobUrl = URL.createObjectURL(blob)
                return localBlobUrl
              }
              return rawSrc
            }
          }
        } else {
          const clean = filterM3u8AdsIfApplicable(text, rawSrc)
          if (clean.filtered) {
            const blob = new Blob([clean.content], {
              type: 'application/vnd.apple.mpegurl',
            })
            localBlobUrl = URL.createObjectURL(blob)
            return localBlobUrl
          }
        }
        return rawSrc
      } catch (err) {
        console.warn('[player] client ad-filter fallback:', err)
        return rawSrc
      }
    }

    if (isM3u8(activeSrc, formatHintRef.current)) {
      void (async () => {
        const targetSrc = await resolveClientCleanedSrc(activeSrc)
        if (!alive()) return
        if (preferNativeHls) {
          attachNativeHls(targetSrc)
        } else {
          void import('hls.js')
            .then((mod) => {
              if (!alive()) return
              const HlsCtor = mod.default
              if (HlsCtor.isSupported()) {
                const hls = new HlsCtor({
                  enableWorker: true,
                  startFragPrefetch: true,
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
                hls.loadSource(targetSrc)
                hls.attachMedia(video)
                hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
                  if (!alive()) return
                  onReady()
                })
                hls.on(HlsCtor.Events.FRAG_LOADED, (_e, data) => {
                  if (!alive()) return
                  onFragLoadedExtraRef.current?.(hls, data)
                })
                hls.on(HlsCtor.Events.LEVEL_LOADED, (_e, data) => {
                  if (!alive()) return
                  if (data.details.totalduration) {
                    setDuration(data.details.totalduration)
                  }
                  tryApplyInitialResumeRef.current?.()
                })
                hls.on(HlsCtor.Events.ERROR, (_e, data) => {
                  if (!alive()) return
                  if (!data.fatal) return
                  console.error('[player] hls fatal', data.type, data.details)
                  if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
                    const responseCode =
                      data.response?.code ||
                      (data.context as { xhr?: { status?: number } } | undefined)
                        ?.xhr?.status
                    if (
                      (responseCode === 401 || responseCode === 403) &&
                      tryAuthRefresh()
                    ) {
                      return
                    }
                    setLoading(false)
                    setBufferingUi(false)
                    setMediaError(`网络连接错误 ${data.details || ''}，建议切换视频源`)
                    reportLoadFailed(String(data.details || 'hls_network'))
                    return
                  } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
                    const now = Date.now()
                    if (now - lastMediaErrorTimeRef.current > 30_000) {
                      mediaErrorWindowCountRef.current = 0
                    }
                    lastMediaErrorTimeRef.current = now
                    mediaErrorWindowCountRef.current++
                    sessionMediaErrorTotalRef.current++

                    const playedSeconds = video.currentTime || 0
                    const effectiveMinutes = Math.max(playedSeconds / 60, 2)
                    const errorRatePerMinute =
                      sessionMediaErrorTotalRef.current / effectiveMinutes

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
              if (canNativeHls) {
                attachNativeHls(targetSrc)
                return
              }
              setLoading(false)
              setMediaError('当前浏览器不支持 HLS')
            })
            .catch((e) => {
              if (!alive()) return
              console.error('[player] hls import failed', e)
              if (canNativeHls) {
                attachNativeHls(targetSrc)
                return
              }
              setLoading(false)
              setMediaError('加载播放器失败')
            })
        }
      })()
    } else {
      attachProgressive()
    }

    let lastUiFloor = -1
    const onTime = () => {
      const d = video.duration
      const t = video.currentTime
      const now = Date.now()

      if (pendingSeekTargetRef.current !== null) {
        if (now < seekLockExpiryRef.current) {
          if (Math.abs(t - pendingSeekTargetRef.current) > 0.6) {
            return
          }
        }
        pendingSeekTargetRef.current = null
      }

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setSeekingUi(false)
        hideBufferingUi()
        isSeekingRef.current = false
      }

      const floor = Math.floor(t)
      if (now - lastUiProgressRef.current >= 250 || floor !== lastUiFloor) {
        lastUiProgressRef.current = now
        lastUiFloor = floor
        timeStore?.updateTime(t, Number.isFinite(d) && d > 0 ? d : 0)
        if (Number.isFinite(d) && d > 0) setDuration(d)
      }

      onTimeUpdateExtraRef.current?.(t, d)
    }

    const onPause = () => {
      if (shouldSuppressPauseRef.current(video) && !userPausedRef.current) {
        window.setTimeout(() => {
          if (!alive() || userPausedRef.current) return
          if (video.paused) {
            video.play().catch(() => {
              setPaused(true)
              if (showBarRef) showBarRef.current = true
              if (setShowBar) setShowBar(true)
            })
          }
        }, 30)
        return
      }

      setPaused(true)
      if (showBarRef) showBarRef.current = true
      setShowBarRef.current?.(true)
      onPauseExtraRef.current?.(video.currentTime, video.duration)
    }

    let hideBufferingUi: () => void = () => setBufferingUi(false)
    const onPlay = () => {
      setPaused(false)
      setLoading(false)
      hideBufferingUi()
      bumpBarRef.current?.()
    }

    const onRateChange = () => {
      if (!alive()) return
      if (
        !userPausedRef.current &&
        video.paused &&
        shouldSuppressPauseRef.current(video)
      ) {
        window.setTimeout(() => {
          if (!alive() || userPausedRef.current) return
          if (video.paused) {
            void video.play().catch(() => {})
          }
        }, 30)
      }
    }

    const onEndedHandler = () => {
      userPausedRef.current = false
      hideBufferingUi()
      onEndedExtraRef.current?.()
    }

    const onVol = () => {
      if (ignoreVolumePersistRef.current) return
      if (video.volume > 0.001 && !video.muted) {
        lastAudibleVolumeRef.current = video.volume
      }
      onPlayerChangeRef.current?.({
        volume: video.muted ? 0 : video.volume,
      })
    }

    const onSeeking = () => {
      isSeekingRef.current = true
      lastSkipTRef.current = video.currentTime
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

    let stallShowTimer = 0
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
    const isUnplayable = () => {
      const ahead = bufferedAhead(video)
      return (
        ahead < 0.2 ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      )
    }

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
        if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          return
        }
        setBufferingUi(true)
      }, STALL_SPINNER_DELAY_MS)
    }

    const onWaiting = () => {
      if (userPausedRef.current) return
      const ahead = bufferedAhead(video)
      if (ahead >= 0.35 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        return
      }
      armStallSpinner(true)
    }

    const onStalledPlay = () => {
      if (userPausedRef.current) return
      if (!isUnplayable()) return
      armStallSpinner(false)
    }

    const onCanPlay = () => {
      pendingSeekTargetRef.current = null
      setSeekingUi(false)
      hideBufferingUi()
      isSeekingRef.current = false
      onNoteDanmakuReadyRef.current?.()
      tryApplyInitialResumeRef.current?.()
    }

    const onPlayingClear = () => {
      pendingSeekTargetRef.current = null
      hideBufferingUi()
      setSeekingUi(false)
      isSeekingRef.current = false
      onNoteDanmakuReadyRef.current?.()
    }

    const onLoadedData = () => {
      if (bangumiId && bangumiId > 0) {
        perfMetrics.markFirstFrame(bangumiId)
      }
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', onPause)
    video.addEventListener('play', onPlay)
    video.addEventListener('ratechange', onRateChange)
    video.addEventListener('ended', onEndedHandler)
    video.addEventListener('volumechange', onVol)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalledPlay)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onPlayingClear)
    video.addEventListener('loadeddata', onLoadedData)

    return () => {
      genRef.current++
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl)
        localBlobUrl = null
      }
      try {
        softPlayCleanup?.()
      } catch {
        /* ignore */
      }
      softPlayCleanup = null
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ratechange', onRateChange)
      video.removeEventListener('ended', onEndedHandler)
      video.removeEventListener('volumechange', onVol)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalledPlay)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlayingClear)
      video.removeEventListener('loadeddata', onLoadedData)
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
      const nativeHlsCleanup = (
        video as HTMLVideoElement & { __nativeHlsCleanup?: () => void }
      ).__nativeHlsCleanup
      if (nativeHlsCleanup) {
        try {
          nativeHlsCleanup()
        } catch {
          /* ignore */
        }
        delete (video as HTMLVideoElement & { __nativeHlsCleanup?: () => void })
          .__nativeHlsCleanup
      }
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc])

  // External speed change
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const s = playerSettings.speed || 1
    if (
      Math.abs(lastAppliedSpeedRef.current - s) > 0.01 &&
      Math.abs(video.playbackRate - s) > 0.01
    ) {
      applySpeedChange(s)
    }
  }, [playerSettings.speed, applySpeedChange, videoRef])

  return {
    hlsRef,
    loading,
    setLoading,
    paused,
    setPaused,
    duration,
    setDuration,
    seekingUi,
    setSeekingUi,
    bufferingUi,
    setBufferingUi,
    mediaError,
    setMediaError,
    userPausedRef,
    isSeekingRef,
    pendingSeekTargetRef,
    lastSkipTRef,
    authAttemptingRef,
    authRecoverySucceededRef,
    loadFailedOnceRef,
    togglePlay,
    applySeek,
    seekTo,
    seekRatio,
    applySpeedChange,
    handleVolumeChange,
    toggleMute,
    reportLoadFailed,
  }
}
