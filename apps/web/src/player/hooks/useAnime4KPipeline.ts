import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SuperResolutionMode } from '@animaku/shared'
import {
  hasWebGPU,
  startAnime4K,
  SR_MAX_DIMENSION,
  supportsAnime4K,
  type Anime4KStop,
} from '../anime4k'

export interface UseAnime4KPipelineOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  shellRef: RefObject<HTMLDivElement | null>
  activeSrc: string
  superResolution?: SuperResolutionMode
  srMenuOpen: boolean
  onFlashHint: (msg: string, ms?: number) => void
}

export function useAnime4KPipeline({
  videoRef,
  canvasRef,
  shellRef,
  activeSrc,
  superResolution = 'off',
  srMenuOpen,
  onFlashHint,
}: UseAnime4KPipelineOptions) {
  const anime4kStopRef = useRef<Anime4KStop | null>(null)
  const [srActive, setSrActive] = useState(false)
  const [webGpuOk, setWebGpuOk] = useState<boolean | null>(
    () => (typeof navigator !== 'undefined' && hasWebGPU() ? null : false),
  )

  // Probe WebGPU once when user opens SR menu or has a non-off preference
  useEffect(() => {
    const mode = superResolution || 'off'
    if (mode === 'off' && !srMenuOpen) return
    if (webGpuOk !== null) return
    let cancelled = false
    void supportsAnime4K().then((ok) => {
      if (!cancelled) setWebGpuOk(ok)
    })
    return () => {
      cancelled = true
    }
  }, [superResolution, srMenuOpen, webGpuOk])

  // Anime4K: only when mode !== off. Dynamic-import + disposable GPU controller.
  useEffect(() => {
    const mode = superResolution || 'off'
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
        let ok = webGpuOk === true
        if (!ok) {
          ok = await supportsAnime4K()
          if (cancelled) return
          setWebGpuOk(ok)
        }
        if (!ok) {
          setSrActive(false)
          onFlashHint(unsupportedReason(), 4500)
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
            window.setTimeout(done, 12_000)
          })
        }
        if (cancelled) return
        if (!(video.videoWidth > 0)) {
          onFlashHint('超分等待视频尺寸超时，请等画面出来后再开', 4500)
          setSrActive(false)
          return
        }

        // Defer GPU pipeline until playback actually starts (playing).
        if (video.paused) {
          onFlashHint('超分将在开始播放后启动…', 2200)
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
        onFlashHint(
          srMode === 'quality' ? '超分：质量档启动中…' : '超分：效率档启动中…',
          2000,
        )

        stop = await startAnime4K({
          video,
          canvas,
          mode: srMode,
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
        onFlashHint(
          srMode === 'quality'
            ? `超分已开启（质量 · ${nw}p→2×）`
            : `超分已开启（效率 · ${nw}p→2×）`,
          2800,
        )
      } catch (e) {
        console.warn('[player] Anime4K failed', e)
        if (!cancelled) {
          setSrActive(false)
          onFlashHint(
            e instanceof Error
              ? `超分启动失败：${e.message}`
              : '超分启动失败（见控制台）',
            4500,
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
  }, [activeSrc, superResolution, videoRef, canvasRef, shellRef, webGpuOk, onFlashHint])

  const stopAnime4K = () => {
    try {
      anime4kStopRef.current?.()
    } catch {
      /* ignore */
    }
    anime4kStopRef.current = null
    setSrActive(false)
  }

  return {
    srActive,
    webGpuOk,
    stopAnime4K,
  }
}
