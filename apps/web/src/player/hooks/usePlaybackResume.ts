import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type Hls from 'hls.js'
import { CONTINUE_PLAY_MIN_THRESHOLD_SEC } from '@animaku/shared'
import { isM3u8 } from '../media/format'

export interface UsePlaybackResumeOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  hlsRef: RefObject<Hls | null>
  activeSrc: string
  formatHint?: string
  initialTime?: number
  continuePlay?: boolean
  isStaleOrRetrying?: () => boolean
  onResumed?: (targetTime: number) => void
}

export function usePlaybackResume({
  videoRef,
  hlsRef,
  activeSrc,
  formatHint,
  initialTime = 0,
  continuePlay = true,
  isStaleOrRetrying,
  onResumed,
}: UsePlaybackResumeOptions) {
  const resumedRef = useRef(false)
  const initialTimeRef = useRef(initialTime)
  initialTimeRef.current = initialTime
  const continuePlayRef = useRef(continuePlay)
  continuePlayRef.current = continuePlay
  const isStaleOrRetryingRef = useRef(isStaleOrRetrying)
  isStaleOrRetryingRef.current = isStaleOrRetrying
  const onResumedRef = useRef(onResumed)
  onResumedRef.current = onResumed

  /**
   * 解析媒体当前可信的最终总时长（秒）。
   * 区分 MP4 与 HLS VOD 解析态，若处于切片探测期返回 null 挂起，杜绝误判。
   */
  const resolveAuthoritativeDuration = useCallback((): number | null => {
    const video = videoRef.current
    if (!video) return null
    const isHls = isM3u8(activeSrc, formatHint)

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
  }, [activeSrc, formatHint, videoRef, hlsRef])

  /**
   * 幂等且时序安全的初始续播调度器：
   * 1. Stale Instance Guard：失效/重试中实例绝不响应；
   * 2. 权威时长决断：未稳定时挂起重试，杜绝代理指标漏洞；
   * 3. 严格防越界裁剪与 try/catch 保护。
   */
  const tryApplyInitialResume = useCallback((): boolean => {
    const video = videoRef.current
    const targetTime = initialTimeRef.current

    if (
      !video ||
      !continuePlayRef.current ||
      resumedRef.current ||
      targetTime <= CONTINUE_PLAY_MIN_THRESHOLD_SEC
    ) {
      return false
    }

    // Stale Instance Guard：若当前实例已处于凭证重试、报错或失效状态，坚决不执行
    if (isStaleOrRetryingRef.current?.()) {
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
    try {
      video.currentTime = safeTarget
      onResumedRef.current?.(safeTarget)
      return true
    } catch (e) {
      console.warn('[player] initial resume seek failed:', e)
      return false
    }
  }, [resolveAuthoritativeDuration, videoRef])

  // 入口 1: Prop 驱动入口（处理 Late Hydrate 异步到达）
  useEffect(() => {
    if (initialTime > CONTINUE_PLAY_MIN_THRESHOLD_SEC && !resumedRef.current) {
      tryApplyInitialResume()
    }
  }, [initialTime, tryApplyInitialResume])

  const resetResume = () => {
    resumedRef.current = false
  }

  return {
    resumedRef,
    resetResume,
    resolveAuthoritativeDuration,
    tryApplyInitialResume,
  }
}
