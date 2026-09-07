import { useEffect, useRef, useState, type RefObject } from 'react'
import type Hls from 'hls.js'
import { STATS_VALID_PLAY_THRESHOLD_SEC } from '@animaku/shared'
import { statsApi } from '../../lib/api'
import { useWatchedStore } from '../../stores/watched'

export interface UsePlaybackStatsOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  hlsRef: RefObject<Hls | null>
  activeSrc: string
  bangumiId?: number
  episodeNumber?: number
  episodeIndex?: number
  onProgress?: (currentTime: number, duration: number) => void
}

export function usePlaybackStats({
  videoRef,
  hlsRef,
  activeSrc,
  bangumiId,
  episodeNumber,
  episodeIndex,
  onProgress,
}: UsePlaybackStatsOptions) {
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const lastSaveRef = useRef(0)
  const playSecAccumulatedRef = useRef<number>(0)
  const playViewReportedRef = useRef<boolean>(false)
  const lastPlaySecTickRef = useRef<number>(0)

  const [fps, setFps] = useState(0)
  const [droppedFrames, setDroppedFrames] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [bandwidthEstimateBps, setBandwidthEstimateBps] = useState(0)
  const [lastFragStats, setLastFragStats] = useState<{
    bytes: number
    loadTimeMs: number
    speedBytesPerSec: number
  } | null>(null)
  const [videoCodec, setVideoCodec] = useState('')
  const [audioCodec, setAudioCodec] = useState('')

  // 重置统计指标
  useEffect(() => {
    playSecAccumulatedRef.current = 0
    playViewReportedRef.current = false
    lastPlaySecTickRef.current = 0
  }, [bangumiId, episodeNumber, episodeIndex, activeSrc])

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
  }, [activeSrc, videoRef, hlsRef])

  /**
   * 在 timeupdate 时调用：累加有效播放时长并在满 15s 时上报、完播兜底与周期保存历史
   */
  const handleTimeUpdateStats = (t: number, d: number, isSeeking: boolean) => {
    const video = videoRef.current
    if (!video) return
    const now = Date.now()

    // 累加实际有效播放时长并在满 15s 时上报播放统计、标记已看并首次正式写入观看历史
    if (
      !playViewReportedRef.current &&
      bangumiId &&
      bangumiId > 0 &&
      !video.paused &&
      !isSeeking
    ) {
      const lastTick = lastPlaySecTickRef.current || t
      const tickDelta = t - lastTick
      if (tickDelta > 0 && tickDelta <= 2.5) {
        playSecAccumulatedRef.current += tickDelta
        if (playSecAccumulatedRef.current >= STATS_VALID_PLAY_THRESHOLD_SEC) {
          playViewReportedRef.current = true
          const epNum = typeof episodeNumber === 'number' ? episodeNumber : 0
          void statsApi.recordPlayView(bangumiId, epNum).catch(() => {})
          useWatchedStore.getState().markWatched(bangumiId, epNum)
          lastSaveRef.current = now
          onProgressRef.current?.(t, d)
        }
      }
    }
    lastPlaySecTickRef.current = t

    // 完播兜底：单集播放接近末尾（>= 85% 且视频时长有效）自动记录已看（纯客户端选集标记，严禁在未满 15s 自然播放前虚增服务端播放量）
    if (
      bangumiId &&
      bangumiId > 0 &&
      typeof episodeNumber === 'number' &&
      d > 30 &&
      t / d >= 0.85
    ) {
      useWatchedStore.getState().markWatched(bangumiId, episodeNumber)
    }

    // 周期保存历史进度：仅在达到有效播放门槛（满 15s）后，每 10s 同步一次最新进度
    if (playViewReportedRef.current && now - lastSaveRef.current >= 10_000) {
      lastSaveRef.current = now
      onProgressRef.current?.(t, d)
    }
  }

  /**
   * 在暂停时调用：仅在满 15s 后保存当前进度
   */
  const handlePauseStats = (t: number, d: number) => {
    if (playViewReportedRef.current && Number.isFinite(d) && d > 0) {
      onProgressRef.current?.(t, d)
    }
  }

  /**
   * 在完播（ended）时调用：标记已看
   */
  const handleEndedStats = () => {
    if (bangumiId && bangumiId > 0 && typeof episodeNumber === 'number') {
      useWatchedStore.getState().markWatched(bangumiId, episodeNumber)
    }
  }

  const resetPlayTick = (t: number) => {
    lastPlaySecTickRef.current = t
  }

  return {
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
    playViewReportedRef,
  }
}
