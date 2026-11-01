import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubtitleTrack } from '@animaku/shared'
import JASSUB from 'jassub'
import workerUrl from 'jassub/dist/worker/worker.js?worker&url'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'

interface UseAssEngineOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  subtitle?: import('@animaku/shared').SubtitleBundle
  subtitles?: SubtitleTrack[]
  fonts?: string[]
}

/**
 * 智能选取最合适的 ASS 字幕轨：
 * 1. 过滤 format === 'ass' 且有有效 url 的字幕；
 * 2. 匹配 default === true；
 * 3. 匹配包含简中（CHS/SC/简/GB）标识；
 * 4. 备用繁中（CHT/TC/繁/BIG5）或首条 ASS。
 */
export function selectBestAssTrack(subtitles?: SubtitleTrack[]): SubtitleTrack | null {
  if (!subtitles || !subtitles.length) return null

  // 特殊处理说明：
  // 若字幕列表中有明确标记为 default 的 VTT 文本轨（如 Netflix 官方流），
  // 说明当前默认首选为原生 WebVTT（浏览器原生字体渲染，避免西文字体包缺字炸成豆腐块），
  // JASSUB 不应强行抢占挂载，直接回退原生 VTT 渲染通道。
  const hasDefaultVtt = subtitles.some((s) => s.default && s.format === 'vtt')
  if (hasDefaultVtt) return null

  const assTracks = subtitles.filter((s) => s.format === 'ass' && Boolean(s.url))
  if (!assTracks.length) return null

  // 1. 显式标记 default
  const def = assTracks.find((s) => s.default)
  if (def) return def

  // 2. 简中优先
  const chs = assTracks.find((s) => /chs|sc|简|gb/i.test(s.label || s.id))
  if (chs) return chs

  // 3. 繁中备用
  const cht = assTracks.find((s) => /cht|tc|繁|big5/i.test(s.label || s.id))
  if (cht) return cht

  return assTracks[0] || null
}

export function useAssEngine({
  videoRef,
  subtitle,
  subtitles: legacySubtitles,
  fonts: legacyFonts,
}: UseAssEngineOptions) {
  const subtitles = subtitle?.subtitles ?? legacySubtitles
  const fonts = subtitle?.fonts ?? legacyFonts
  const activeTrack = useMemo(() => selectBestAssTrack(subtitles), [subtitles])
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const [assFailed, setAssFailed] = useState(false)
  const jassubRef = useRef<JASSUB | null>(null)

  const prevTrackUrlRef = useRef(activeTrack?.url)
  if (prevTrackUrlRef.current !== activeTrack?.url) {
    prevTrackUrlRef.current = activeTrack?.url
    if (assFailed) {
      setAssFailed(false)
    }
  }

  const activeAssTrack = assFailed ? null : activeTrack

  useEffect(() => {
    const video = videoRef.current
    if (!video || !canvasEl || !activeAssTrack?.url) {
      if (jassubRef.current) {
        try {
          void jassubRef.current.destroy()
        } catch {
          /* ignore */
        }
        jassubRef.current = null
      }
      return
    }

    let disposed = false
    let instance: JASSUB | null = null
    let boundOnAddTrack: ((e: Event) => void) | null = null

    const initAss = async () => {
      try {
        // 主线程预拉取 ASS 文本并作为 subContent 传入，避开 Worker 内部环境与相对路径限制
        const res = await fetch(activeAssTrack.url)
        if (!res.ok) throw new Error(`字幕下载失败 HTTP ${res.status}`)
        const subContent = await res.text()
        if (disposed) return

        /*
         * 特殊处理说明：
         * 1. 严格等待视频元数据就绪（videoWidth > 0），避免在 Safari 原生 HLS 冷启动首集时
         *    因 videoWidth/videoHeight 为 0 导致 JASSUB 内部计算 videoRatio (0/0) 产生 NaN，
         *    进而写入 canvas.style 导致字幕画布在第 1 集彻底失效（第 2 集因复用前序尺寸才碰巧正常）；
         * 2. 5s 防御性超时避免网络极端卡死导致挂起；
         * 3. Canvas 预先对齐视频物理分辨率，防止 transferControlToOffscreen 后默认为 300x150 导致画面模糊拉伸；
         * 4. 明确使用 dist/worker/worker.js 作为真正的 RPC 通信 Worker 入口（严禁使用 wasm/ 目录下的原生胶水文件）；
         * 5. 传入源站配套字体包以供 libass 渲染原版字形（如方正兰亭圆）；
         * 6. 仅在 JASSUB 真正 ready 成功后才关闭原生软字幕轨，避免双层重叠。
         */
        if (!(video.videoWidth > 0)) {
          await new Promise<void>((resolve) => {
            const done = () => {
              video.removeEventListener('loadedmetadata', done)
              video.removeEventListener('loadeddata', done)
              resolve()
            }
            video.addEventListener('loadedmetadata', done, { once: true })
            video.addEventListener('loadeddata', done, { once: true })
            if (video.videoWidth > 0) done()
            window.setTimeout(done, 5000)
          })
        }
        if (disposed) return

        const vWidth = video.videoWidth || 1920
        const vHeight = video.videoHeight || 1080
        canvasEl.width = vWidth
        canvasEl.height = vHeight

        instance = new JASSUB({
          video,
          canvas: canvasEl,
          subContent,
          fonts: fonts && fonts.length > 0 ? fonts : undefined,
          workerUrl,
          wasmUrl,
          modernWasmUrl,
          prescaleFactor: 1.0,
          prescaleHeightLimit: 1080,
          maxRenderHeight: 0,
        })
        jassubRef.current = instance

        await instance.ready
        if (disposed) return

        /*
         * 特殊处理说明：
         * 1. JASSUB 成功挂载后，静默禁用当前所有原生 video.textTracks；
         * 2. 必须监听 TextTrackList 的 addtrack 事件：Safari 在原生播放 HLS 流时，
         *    会在后台异步解析 M3U8 的 #EXT-X-MEDIA:TYPE=SUBTITLES 并动态向 textTracks 注入轨道，
         *    若不动态拦截，Safari 会在几百毫秒后默认将其设为 showing，造成 ASS + 原生 VTT 双层字幕打架。
         */
        const disableTrack = (track?: TextTrack | null) => {
          if (!track) return
          try {
            track.mode = 'disabled'
          } catch {
            /* ignore */
          }
        }
        for (let i = 0; i < video.textTracks.length; i++) {
          disableTrack(video.textTracks[i])
        }
        boundOnAddTrack = (e: Event) => {
          disableTrack((e as TrackEvent).track)
        }
        video.textTracks.addEventListener('addtrack', boundOnAddTrack)
      } catch (err) {
        console.warn('[JASSUB] 初始化失败，回退原生字幕:', err)
        if (!disposed) {
          setAssFailed(true)
        }
      }
    }

    void initAss()

    return () => {
      disposed = true
      if (boundOnAddTrack) {
        video.textTracks.removeEventListener('addtrack', boundOnAddTrack)
      }
      if (instance) {
        try {
          void instance.destroy()
        } catch {
          /* ignore */
        }
      }
      if (jassubRef.current === instance) {
        jassubRef.current = null
      }
    }
  }, [videoRef, canvasEl, activeAssTrack?.url, fonts])

  return {
    activeTrack: activeAssTrack,
    setCanvasEl,
  }
}
