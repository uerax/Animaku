import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { isM3u8 } from '../media/format'

export interface UseAudioBoosterOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  activeSrc: string
  formatHint?: string
  isLocal?: boolean
  onFlashHint?: (msg: string, ms?: number) => void
}

export interface UseAudioBoosterResult {
  audioBoost: number
  setAudioBoost: (multiplier: number) => void
  supported: boolean
}

export const AUDIO_BOOST_OPTIONS: { value: number; label: string }[] = [
  { value: 1.0, label: '关闭 (1.0x)' },
  { value: 1.5, label: '1.5x (轻度 +3.5dB)' },
  { value: 2.0, label: '2.0x (翻倍 +6.0dB)' },
  { value: 2.5, label: '2.5x (强力 +8.0dB)' },
  { value: 3.0, label: '3.0x (超强 +9.5dB)' },
]

/**
 * 判断当前媒体流在架构层面是否支持 Web Audio 声音增强：
 * - HLS (m3u8 走 Hls.js + MSE blob): 天然同源，100% 支持
 * - 本地拖拽视频 (blob: URL): 天然同源，100% 支持
 * - 服务端代理流 (/api/media/proxy): 带同源响应头，100% 支持
 * - 第三方外链直链 MP4: 存在跨域限制与静音风险，直接不开放增强功能，从源头避免被静音或报错
 */
export function isAudioBoostSupported(
  activeSrc: string,
  formatHint?: string,
  isLocal?: boolean,
): boolean {
  if (!activeSrc) return false
  if (isLocal || activeSrc.startsWith('blob:')) return true
  if (activeSrc.includes('/api/media/')) return true
  if (isM3u8(activeSrc, formatHint)) return true
  return false
}

/**
 * Audio Booster Hook (基于 Web Audio API 的声音增强与软压限防破音)
 *
 * 信号拓扑链：
 *   HTMLMediaElement (<video>)
 *     -> MediaElementAudioSourceNode (单例复用，规避单次绑定限制)
 *     -> GainNode (线性增益倍率，平滑过渡防爆音)
 *     -> DynamicsCompressorNode (防削波软压限器，压制突发强音，保真不破音)
 *     -> AudioContext.destination
 *
 * 关键特性：
 * 1. 仅作用于本次播放：切集（activeSrc 变化）或刷新自动复位为 1.0x（关闭），不持久化到存储。
 * 2. 软压限防破音：选用柔和的 -6dB 阈值和 15dB 宽软拐点，既能提升弱音台词，又能避免边缘呼吸效应（pumping）。
 * 3. 规避 AudioContext 自动播放挂起：在用户交互（点击切换倍率）中显式调用 resume()。
 * 4. 异常安全降级：捕获可能的 CORS 跨域限制或浏览器拒绝，失败时优雅降级并给出提示。
 */
export function useAudioBooster({
  videoRef,
  activeSrc,
  formatHint,
  isLocal,
  onFlashHint,
}: UseAudioBoosterOptions): UseAudioBoosterResult {
  const [audioBoost, setAudioBoostState] = useState<number>(1)
  const isSupported = isAudioBoostSupported(activeSrc, formatHint, isLocal)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const boundVideoRef = useRef<HTMLVideoElement | null>(null)

  // 初始化并装配 Web Audio 图（惰性加载，仅在首次设置 > 1 时介入）
  const initAudioGraph = useCallback((video: HTMLVideoElement): boolean => {
    try {
      // 1. 获取或创建 AudioContext
      if (!audioCtxRef.current) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!AudioContextClass) {
          console.warn('[AudioBooster] Web Audio API is not supported in this browser.')
          return false
        }
        audioCtxRef.current = new AudioContextClass()
      }

      const ctx = audioCtxRef.current

      // 2. 创建 GainNode（增益节点）
      if (!gainNodeRef.current) {
        gainNodeRef.current = ctx.createGain()
        gainNodeRef.current.gain.value = 1.0
      }

      // 3. 创建 DynamicsCompressorNode（平滑软压限器）
      if (!compressorRef.current) {
        const comp = ctx.createDynamicsCompressor()
        // 参数调优：
        // threshold: -6dB，适度提前接入，留足柔和压缩余量，消除人声突发增大的呼吸感
        // knee: 15dB 宽软拐点，过渡自然通透
        // ratio: 16:1 强压比，充当防削波安全限幅罩
        // attack: 3ms 瞬态捕捉，拦截脉冲爆音
        // release: 250ms 平滑恢复，符合人耳听觉心理学
        comp.threshold.setValueAtTime(-6, ctx.currentTime)
        comp.knee.setValueAtTime(15, ctx.currentTime)
        comp.ratio.setValueAtTime(16, ctx.currentTime)
        comp.attack.setValueAtTime(0.003, ctx.currentTime)
        comp.release.setValueAtTime(0.25, ctx.currentTime)
        compressorRef.current = comp
      }

      // 4. 检查或绑定 MediaElementAudioSourceNode（规范限制：单个 video 元素一生只能绑定一次）
      if (!sourceNodeRef.current || boundVideoRef.current !== video) {
        try {
          sourceNodeRef.current?.disconnect()
        } catch {
          /* ignore */
        }
        sourceNodeRef.current = ctx.createMediaElementSource(video)
        boundVideoRef.current = video

        sourceNodeRef.current.connect(gainNodeRef.current)
        gainNodeRef.current.connect(compressorRef.current)
        compressorRef.current.connect(ctx.destination)
      }

      return true
    } catch (err) {
      console.warn('[AudioBooster] Failed to initialize Web Audio graph:', err)
      return false
    }
  }, [])

  // 设置声音增强倍率
  const setAudioBoost = useCallback(
    async (multiplier: number) => {
      const video = videoRef.current
      const safeMultiplier = Math.max(1, Math.min(5, multiplier))

      // 如果选中的是 1.0x（关闭增强）
      if (Math.abs(safeMultiplier - 1) < 0.01) {
        setAudioBoostState(1)
        if (gainNodeRef.current && audioCtxRef.current) {
          const ctx = audioCtxRef.current
          gainNodeRef.current.gain.setTargetAtTime(1.0, ctx.currentTime, 0.05)
        }
        onFlashHint?.('声音增强：已关闭', 1500)
        return
      }

      if (!video) {
        onFlashHint?.('当前视频未就绪，无法开启增强', 1500)
        return
      }

      if (!isSupported) {
        onFlashHint?.('当前第三方直链源受跨域限制，请切换 HLS 视频源', 2200)
        return
      }

      // 初始化 Web Audio 图
      const ready = initAudioGraph(video)
      if (!ready || !audioCtxRef.current || !gainNodeRef.current) {
        onFlashHint?.('声音增强启动失败（可能受视频源跨域安全策略限制）', 2500)
        setAudioBoostState(1)
        return
      }

      const ctx = audioCtxRef.current
      // 在用户点击手势上下文中唤醒 AudioContext
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch (e) {
          console.warn('[AudioBooster] AudioContext resume failed:', e)
        }
      }

      // 50ms 平滑渐变应用新增益，消除数字突变带来的咔哒爆音 (zipper noise / click)
      gainNodeRef.current.gain.setTargetAtTime(safeMultiplier, ctx.currentTime, 0.05)
      setAudioBoostState(safeMultiplier)

      onFlashHint?.(
        `声音增强：已设为 ${safeMultiplier.toFixed(1)}x (防破音压限已开启)`,
        1800,
      )
    },
    [videoRef, isSupported, initAudioGraph, onFlashHint],
  )

  // 监听 activeSrc：切集、换源时仅作用到本次播放，自动重置为 1.0x（关闭）
  const prevSrcRef = useRef(activeSrc)
  useEffect(() => {
    if (prevSrcRef.current !== activeSrc) {
      prevSrcRef.current = activeSrc
      setAudioBoostState(1)
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(1.0, audioCtxRef.current.currentTime, 0.02)
      }
    }
  }, [activeSrc])

  // 监听 video play 事件：防止浏览器休眠或切后台导致 AudioContext 被挂起
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => {
      if (audioCtxRef.current?.state === 'suspended' && audioBoost > 1) {
        void audioCtxRef.current.resume().catch(() => {})
      }
    }

    video.addEventListener('play', handlePlay)
    return () => {
      video.removeEventListener('play', handlePlay)
    }
  }, [videoRef, audioBoost])

  // 组件卸载时释放资源
  useEffect(() => {
    return () => {
      try {
        sourceNodeRef.current?.disconnect()
        gainNodeRef.current?.disconnect()
        compressorRef.current?.disconnect()
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          void audioCtxRef.current.close().catch(() => {})
        }
      } catch {
        /* ignore */
      }
    }
  }, [])

  return {
    audioBoost,
    setAudioBoost,
    supported: isSupported,
  }
}
