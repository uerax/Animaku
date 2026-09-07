import { useEffect, useRef, type RefObject } from 'react'
import type { DanmakuComment, DanmakuSettings } from '@animaku/shared'
import { CanvasDanmaku } from '../media/canvas-danmaku'
import {
  danmakuFontScaleBucket,
  danmakuPixelSpeed,
  type DanmakuLayoutHints,
} from '../media/danmaku-utils'

export interface UseDanmakuBridgeOptions {
  shellRef: RefObject<HTMLDivElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  layerRef: RefObject<HTMLDivElement | null>
  comments: DanmakuComment[]
  danmaku: DanmakuSettings
  pointerMode: 'desktop' | 'mobile'
  playerFs: boolean
  webFs: boolean
  onFlashHint?: (msg: string, ms?: number) => void
}

export function useDanmakuBridge({
  shellRef,
  videoRef,
  layerRef,
  comments,
  danmaku,
  pointerMode,
  playerFs,
  webFs,
  onFlashHint,
}: UseDanmakuBridgeOptions) {
  const danmakuCoreRef = useRef<CanvasDanmaku | null>(null)
  const danmakuMediaReadyRef = useRef(false)
  const lastDanmakuWidthRef = useRef(0)
  const danmakuContentKeyRef = useRef('')

  const commentsRef = useRef(comments)
  commentsRef.current = comments
  const danmakuRef = useRef(danmaku)
  danmakuRef.current = danmaku
  const pointerModeRef = useRef(pointerMode)
  pointerModeRef.current = pointerMode
  const playerFsRef = useRef(playerFs)
  playerFsRef.current = playerFs
  const webFsRef = useRef(webFs)
  webFsRef.current = webFs

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

  function applyDanmaku(forceReload = false) {
    const video = videoRef.current
    const layer = layerRef.current
    if (!video || !layer) return

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
        if (widthBucketChanged) core.resize(w)
      }
      const core = danmakuCoreRef.current
      if (dm.enabled === false) core.hide()
      else core.show()
    } catch (e) {
      console.warn('[danmaku]', e)
    }
  }

  function noteDanmakuMediaReady() {
    danmakuMediaReadyRef.current = true
    if (!danmakuCoreRef.current) applyDanmaku()
  }

  function destroyDanmaku() {
    try {
      danmakuCoreRef.current?.destroy()
    } catch {
      /* ignore */
    }
    danmakuCoreRef.current = null
    danmakuMediaReadyRef.current = false
    danmakuContentKeyRef.current = ''
  }

  // Comments / Settings update
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

  // ResizeObserver for font scale bucket changes
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const ro = new ResizeObserver(() => {
      try {
        const w = shell.clientWidth || 0
        const h = shell.clientHeight || 0
        const core = danmakuCoreRef.current
        if (!core || w <= 0) return
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
    ro.observe(shell)

    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellRef])

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
        onFlashHint?.('弹幕关闭', 1200)
      } else if (curSimplify) {
        onFlashHint?.('弹幕精简', 1200)
      } else {
        onFlashHint?.('弹幕开启', 1200)
      }
    }
  }, [danmaku.enabled, danmaku.simplify, onFlashHint])

  return {
    danmakuCoreRef,
    danmakuMediaReadyRef,
    applyDanmaku,
    noteDanmakuMediaReady,
    destroyDanmaku,
  }
}
