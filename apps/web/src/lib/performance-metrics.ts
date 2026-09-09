/**
 * Animaku Playback Performance & Render Frequency Metrics
 *
 * 核心指标体系：
 * 1. TTFP (Time To First Presentation): 路由跳转 -> WatchPage 挂载直出 (基于 Seed 瞬时直出)
 * 2. TTFS (Time To First Source): 路由跳转 -> 首个可用视频源准备就绪
 * 3. TTFR (Time To First Resolve): 路由跳转 -> 流地址解析完成
 * 4. TTFF (Time To First Frame): 路由跳转 -> 播放器首帧画面渲染 (loadeddata)
 *
 * 渲染隔离防线指标：
 * 1. VideoPlayer renders/sec: 播放期间整壳重渲染频次（目标: ~0/s）
 * 2. Progress UI renders/sec: 进度条/时间戳局部组件重渲染频次（目标: ~4/s 稳定心跳）
 */

export interface PlaybackPipelineMetrics {
  bangumiId: number
  navStart: number
  ttfp?: number
  ttfs?: number
  ttfr?: number
  ttff?: number
}

class PerformanceMetricsManager {
  private activePipeline: PlaybackPipelineMetrics | null = null
  private pastPipelines: PlaybackPipelineMetrics[] = []

  // 1 秒滑动窗口计数器
  private playerRenderTimestamps: number[] = []
  private progressRenderTimestamps: number[] = []

  /** 路由点击跳转时触发 */
  markNavigation(bangumiId: number) {
    const now = performance.now()
    this.activePipeline = {
      bangumiId,
      navStart: now,
    }
  }

  /** WatchPage 挂载并基于 Seed 呈现首屏 */
  markWatchMounted(bangumiId: number) {
    if (!this.activePipeline || this.activePipeline.bangumiId !== bangumiId) {
      this.markNavigation(bangumiId)
    }
    if (this.activePipeline && this.activePipeline.ttfp === undefined) {
      this.activePipeline.ttfp = Math.round(performance.now() - this.activePipeline.navStart)
    }
  }

  /** 默认视频源搜索就绪 */
  markSourceReady(bangumiId: number) {
    if (this.activePipeline && this.activePipeline.bangumiId === bangumiId && this.activePipeline.ttfs === undefined) {
      this.activePipeline.ttfs = Math.round(performance.now() - this.activePipeline.navStart)
    }
  }

  /** 流地址 Resolver 解析成功 */
  markResolverReady(bangumiId: number) {
    if (this.activePipeline && this.activePipeline.bangumiId === bangumiId && this.activePipeline.ttfr === undefined) {
      this.activePipeline.ttfr = Math.round(performance.now() - this.activePipeline.navStart)
    }
  }

  /** 视频元素首次渲染画面 (loadeddata) */
  markFirstFrame(bangumiId: number) {
    if (this.activePipeline && this.activePipeline.bangumiId === bangumiId && this.activePipeline.ttff === undefined) {
      this.activePipeline.ttff = Math.round(performance.now() - this.activePipeline.navStart)
      this.pastPipelines.unshift({ ...this.activePipeline })
      if (this.pastPipelines.length > 10) {
        this.pastPipelines.pop()
      }
    }
  }

  /** 记录 VideoPlayer 渲染一次 */
  recordPlayerRender() {
    const now = performance.now()
    this.playerRenderTimestamps.push(now)
    this.cleanRenderTimestamps(now)
  }

  /** 记录 Progress UI 渲染一次 */
  recordProgressRender() {
    const now = performance.now()
    this.progressRenderTimestamps.push(now)
    this.cleanRenderTimestamps(now)
  }

  private cleanRenderTimestamps(now: number) {
    const cutoff = now - 1000
    while (this.playerRenderTimestamps.length > 0 && this.playerRenderTimestamps[0] < cutoff) {
      this.playerRenderTimestamps.shift()
    }
    while (this.progressRenderTimestamps.length > 0 && this.progressRenderTimestamps[0] < cutoff) {
      this.progressRenderTimestamps.shift()
    }
  }

  /** 获取最近 1 秒内的重渲染次数 */
  getRenderRates(): { playerRendersPerSec: number; progressRendersPerSec: number } {
    const now = performance.now()
    this.cleanRenderTimestamps(now)
    return {
      playerRendersPerSec: this.playerRenderTimestamps.length,
      progressRendersPerSec: this.progressRenderTimestamps.length,
    }
  }

  getPipelineMetrics(): PlaybackPipelineMetrics | null {
    return this.activePipeline
  }
}

export const perfMetrics = new PerformanceMetricsManager()

// 挂载到 window 便于在 DevTools 控制台直接审查 window.__ANIMAKU_PERF__
if (typeof window !== 'undefined') {
  ;(window as unknown as { __ANIMAKU_PERF__: PerformanceMetricsManager }).__ANIMAKU_PERF__ = perfMetrics
}
