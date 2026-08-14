/**
 * Canvas danmaku engine — High-precision smooth clock, Zero-GC direct rendering, Chase collision allocator.
 *
 * Core architectural features (2026-08 upgrade):
 * 1. High-precision continuous clock interpolation (performance.now):
 *    - HTMLMediaElement.currentTime is quantized (15Hz~30Hz); reading it directly causes staircase jitter.
 *    - Continuous time interpolation driven by performance.now() ensures buttery 60/120/144 FPS subpixel movement.
 *    - Damped drift correction gently aligns anchor time to audio/video clock without visible stutter.
 * 2. Zero-allocation batch rendering pipeline:
 *    - Eliminates per-string OffscreenCanvas allocations and memory churn (0 GC pauses).
 *    - Two-pass direct GPU-accelerated drawing: Batch 1 for outer high-contrast strokes, Batch 2 for inner colored text.
 * 3. Crisp Bilibili-grade typography & Retina anti-aliasing:
 *    - Full CJK font family stack (PingFang SC, Microsoft YaHei, SimHei).
 *    - Round stroke join with optimal contrast outline.
 * 4. Chase-collision lookahead lane allocator:
 *    - Validates both entry clearance gap and exit overtake timing to prevent overlapping and tail chasing.
 */
import type { DanmakuComment, DanmakuMode, DanmakuSettings } from '@animaku/shared'
import {
  danmakuFontScale,
  danmakuPixelSpeed,
  filterComments,
  type DanmakuLayoutHints,
} from './danmaku-utils'

const BILI_BASE_PX = 25
const REF_WIDTH = 720
const BILI_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans SC", SimHei, sans-serif'

/** Soft cap concurrent draws — density budget, not collision alone */
const MAX_RUNNING = 96
/** Desktop default: slightly lower than absolute max; room for adaptive raise */
const MAX_RUNNING_DESKTOP = 72
/** Mobile fullscreen: fewer concurrent lines so small screens stay readable */
const MAX_RUNNING_MOBILE_FS = 48
/** Top/bottom static hold (seconds), clamped */
const STATIC_MIN_S = 4
const STATIC_MAX_S = 6
/** Gap between successive scroll comments on same lane (px) */
const LANE_GAP_PX = 28

export type CanvasDanmakuOptions = {
  container: HTMLElement
  media: HTMLMediaElement
  comments: DanmakuComment[]
  settings: DanmakuSettings
  /** Container CSS width hint for font/speed (updated on resize) */
  width?: number
  /** Desktop vs mobile + fullscreen — drives font scale curve */
  layout?: DanmakuLayoutHints
}

type Prepared = {
  time: number
  mode: DanmakuMode
  text: string
  color: string
  /** Measured text width at current font; 0 = not measured yet */
  width: number
  height: number
  /** Scroll: seconds to cross (W + textW) / speed. Static: hold duration. */
  duration: number
  /** True after measureText for current font */
  measured: boolean
}

type Running = Prepared & {
  /** Lane top (scroll/top) or bottom offset (bottom mode) */
  y: number
  /** Binary-search index into prepared list when spawned */
  idx: number
  /** Cached render position computed per frame */
  renderX: number
  renderY: number
  renderVisible: boolean
}

type ScrollLaneState = {
  lastTime: number
  lastDuration: number
  lastWidth: number
}

function parseColor(c?: string): string {
  if (!c) return '#ffffff'
  const s = c.trim()
  if (!s) return '#ffffff'
  if (s.startsWith('#')) return s
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (!Number.isFinite(n)) return '#ffffff'
    return `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`
  }
  return s
}

export class CanvasDanmaku {
  private container: HTMLElement
  private media: HTMLMediaElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private prepared: Prepared[] = []
  private running: Running[] = []
  /** Next index in prepared to consider for spawn */
  private cursor = 0
  private raf = 0
  private visible = true
  private destroyed = false
  private dpr = 1
  private cssW = 0
  private cssH = 0
  private fontPx = 25
  private font = `bold 25px ${BILI_FONT_STACK}`
  private speedPx = 130
  private _opacity = 0.85
  private area = 0.75
  private settings: DanmakuSettings
  private layout: DanmakuLayoutHints = {}

  /** Smooth clock anchors for sub-frame microsecond interpolation */
  private anchorMediaTime = 0
  private anchorPerfTime = 0
  private isBuffering = false

  /** Lane states for collision and chase detection */
  private scrollLanes: ScrollLaneState[] = []
  private topLanes: number[] = []
  private bottomLanes: number[] = []
  private laneH = 28

  /** Event listener handles for clean teardown */
  private onPlay: () => void
  private onPlaying: () => void
  private onPause: () => void
  private onWaiting: () => void
  private onSeeking: () => void
  private onSeeked: () => void
  private onRate: () => void
  private onTimeUpdate: () => void
  private onSize: ResizeObserver

  /** Scratch context for measuring text (avoids thrashing main ctx state) */
  private measureCtx: CanvasRenderingContext2D | null = null

  constructor(opts: CanvasDanmakuOptions) {
    this.container = opts.container
    this.media = opts.media
    this.settings = opts.settings
    this.layout = opts.layout ? { ...opts.layout } : {}
    this._opacity = opts.settings.opacity ?? 0.85
    this.area = Math.min(1, Math.max(0.15, opts.settings.area ?? 0.75))

    const canvas = document.createElement('canvas')
    canvas.className = 'kz-danmaku-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    Object.assign(canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '0',
      display: 'block',
    } as CSSStyleDeclaration)
    this.canvas = canvas

    const ctx =
      canvas.getContext('2d', {
        alpha: true,
        desynchronized: true,
      } as CanvasRenderingContext2DSettings) ||
      canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('CanvasDanmaku: 2d context unavailable')
    this.ctx = ctx
    this.container.appendChild(canvas)

    const measureEl = document.createElement('canvas')
    measureEl.width = 1
    measureEl.height = 1
    this.measureCtx = measureEl.getContext('2d')

    this.syncClock(this.media.currentTime)

    this.onPlay = () => {
      this.isBuffering = false
      this.syncClock(this.media.currentTime)
      this.ensureLoop()
    }
    this.onPlaying = () => {
      this.isBuffering = false
      this.syncClock(this.media.currentTime)
      this.ensureLoop()
    }
    this.onPause = () => {
      this.isBuffering = false
      this.syncClock(this.media.currentTime)
      this.stopLoop()
      this.paint()
    }
    this.onWaiting = () => {
      this.isBuffering = true
      this.syncClock(this.media.currentTime)
    }
    this.onSeeking = () => {
      this.isBuffering = true
      this.syncClock(this.media.currentTime)
    }
    this.onSeeked = () => {
      this.isBuffering = false
      this.syncClock(this.media.currentTime)
      this.seek()
    }
    this.onRate = () => {
      this.syncClock(this.media.currentTime)
    }
    this.onTimeUpdate = () => {
      this.checkClockDrift(this.media.currentTime)
    }

    this.media.addEventListener('play', this.onPlay)
    this.media.addEventListener('playing', this.onPlaying)
    this.media.addEventListener('pause', this.onPause)
    this.media.addEventListener('waiting', this.onWaiting)
    this.media.addEventListener('seeking', this.onSeeking)
    this.media.addEventListener('seeked', this.onSeeked)
    this.media.addEventListener('ratechange', this.onRate)
    this.media.addEventListener('timeupdate', this.onTimeUpdate)

    this.onSize = new ResizeObserver(() => this.resize())
    this.onSize.observe(this.container)

    this.resize(opts.width)
    this.reload(opts.comments, opts.settings)
    if (!this.media.paused) this.ensureLoop()
    else this.paint()
  }

  get speed(): number {
    return this.speedPx
  }
  set speed(v: number) {
    if (!(v > 0) || !Number.isFinite(v)) return
    this.speedPx = v
    this.recomputeDurations()
  }

  get opacity(): number {
    return this._opacity
  }
  set opacity(v: number) {
    if (!Number.isFinite(v)) return
    this._opacity = Math.min(1, Math.max(0, v))
  }

  get scrollAreaPercent(): number {
    return this.area
  }
  set scrollAreaPercent(v: number) {
    this.area = Math.min(1, Math.max(0.15, v ?? 0.75))
    this.initLanes()
    this.seek()
  }

  /** Update desktop/mobile + fullscreen hints; triggers font recompute via resize. */
  setLayout(hints: DanmakuLayoutHints): this {
    const prev = this.layout
    const next: DanmakuLayoutHints = {
      mode: hints.mode ?? prev.mode,
      fullscreen: hints.fullscreen ?? prev.fullscreen,
      height: hints.height ?? prev.height,
    }
    const changed =
      prev.mode !== next.mode ||
      prev.fullscreen !== next.fullscreen ||
      Math.abs((prev.height || 0) - (next.height || 0)) > 0.5
    this.layout = next
    if (changed) this.resize()
    return this
  }

  private layoutHints(heightOverride?: number): DanmakuLayoutHints {
    return {
      mode: this.layout.mode,
      fullscreen: this.layout.fullscreen,
      height:
        heightOverride && heightOverride > 0
          ? heightOverride
          : this.layout.height || this.cssH || undefined,
    }
  }

  private maxRunning(): number {
    const areaRatio = Math.min(1, Math.max(0.2, this.area))
    if (this.layout.mode === 'mobile' && this.layout.fullscreen) {
      return Math.max(20, Math.round(MAX_RUNNING_MOBILE_FS * areaRatio))
    }
    if (this.layout.mode === 'mobile') {
      return Math.max(28, Math.round(MAX_RUNNING * areaRatio))
    }
    const lanes = this.scrollLanes.length || 1
    return Math.min(
      MAX_RUNNING,
      Math.max(32, Math.min(Math.round(MAX_RUNNING_DESKTOP * areaRatio), lanes * 4)),
    )
  }

  /** Effective device pixel ratio — clean integer scaling up to 2x for Retina sharpness. */
  private effectiveDpr(): number {
    const raw = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    return Math.min(2, Math.max(1, raw >= 1.75 ? 2 : 1))
  }

  show(): this {
    this.visible = true
    this.canvas.style.visibility = 'visible'
    this.ensureLoop()
    this.paint()
    return this
  }

  hide(): this {
    this.visible = false
    this.canvas.style.visibility = 'hidden'
    this.running.length = 0
    this.clearCanvas()
    return this
  }

  resize(widthHint?: number): this {
    if (this.destroyed) return this
    const cw = this.container.clientWidth || widthHint || 0
    const ch = this.container.clientHeight || 0
    if (cw <= 0 || ch <= 0) return this

    const prevW = this.cssW
    const prevH = this.cssH
    const prevDpr = this.dpr
    const dprNow = this.effectiveDpr()
    const sizeChanged =
      Math.abs(cw - prevW) > 0.5 ||
      Math.abs(ch - prevH) > 0.5 ||
      Math.abs(dprNow - prevDpr) > 0.01

    this.cssW = cw
    this.cssH = ch
    this.layout = { ...this.layout, height: ch }
    this.dpr = dprNow

    if (sizeChanged) {
      this.canvas.width = Math.max(1, Math.round(cw * dprNow))
      this.canvas.height = Math.max(1, Math.round(ch * dprNow))
      this.canvas.style.width = `${cw}px`
      this.canvas.style.height = `${ch}px`
      this.ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0)
    }

    const hints = this.layoutHints(ch)
    const scale = danmakuFontScale(cw, hints)
    const nextFontPx = Math.round(
      BILI_BASE_PX * scale * (this.settings.fontSize || 1),
    )
    const fontChanged = nextFontPx !== this.fontPx
    this.fontPx = nextFontPx
    this.font = `bold ${this.fontPx}px ${BILI_FONT_STACK}`

    const laneMult =
      this.layout.mode === 'mobile' && this.layout.fullscreen ? 1.25 : 1.35
    this.laneH = Math.max(16, Math.ceil(this.fontPx * laneMult))
    this.speedPx = danmakuPixelSpeed(cw, this.settings.speed || 1, hints)

    if (fontChanged) {
      for (const p of this.prepared) {
        p.measured = false
        p.width = 0
        p.height = this.laneH
        p.duration = 0
      }
    } else {
      for (const p of this.prepared) {
        p.height = this.laneH
      }
    }
    this.recomputeDurations()
    this.initLanes()
    this.seek()
    return this
  }

  reload(comments: DanmakuComment[], settings?: DanmakuSettings): this {
    if (settings) {
      this.settings = settings
      this._opacity = settings.opacity ?? 0.85
      this.area = Math.min(1, Math.max(0.15, settings.area ?? 0.75))
      const hints = this.layoutHints()
      const scale = danmakuFontScale(this.cssW || REF_WIDTH, hints)
      const nextFontPx = Math.round(
        BILI_BASE_PX * scale * (settings.fontSize || 1),
      )
      this.fontPx = nextFontPx
      this.font = `bold ${this.fontPx}px ${BILI_FONT_STACK}`
      const laneMult =
        this.layout.mode === 'mobile' && this.layout.fullscreen ? 1.25 : 1.35
      this.laneH = Math.max(16, Math.ceil(this.fontPx * laneMult))
      this.speedPx = danmakuPixelSpeed(
        this.cssW || REF_WIDTH,
        settings.speed || 1,
        hints,
      )
    }

    const offset = this.settings.timeOffset || 0
    const filtered = filterComments(comments, this.settings)
    this.prepared = filtered
      .map((c) => {
        const text = c.text || ''
        const mode = c.mode || 'rtl'
        const p: Prepared = {
          time: c.time + offset,
          mode,
          text,
          color: parseColor(c.style?.color),
          width: 0,
          height: this.laneH,
          duration: 0,
          measured: false,
        }
        return p
      })
      .sort((a, b) => a.time - b.time)

    this.initLanes()
    this.seek()
    return this
  }

  /** Visual-only settings without rebuilding the comment list */
  applyVisual(settings: DanmakuSettings): this {
    this.settings = settings
    this._opacity = settings.opacity ?? 0.85
    const nextArea = Math.min(1, Math.max(0.15, settings.area ?? 0.75))
    const areaChanged = Math.abs(nextArea - this.area) > 0.001
    this.area = nextArea
    this.speedPx = danmakuPixelSpeed(
      this.cssW || REF_WIDTH,
      settings.speed || 1,
      this.layoutHints(),
    )
    this.recomputeDurations()
    if (areaChanged) {
      this.initLanes()
      this.seek()
    }
    if (settings.enabled === false) this.hide()
    else this.show()
    return this
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.stopLoop()
    this.media.removeEventListener('play', this.onPlay)
    this.media.removeEventListener('playing', this.onPlaying)
    this.media.removeEventListener('pause', this.onPause)
    this.media.removeEventListener('waiting', this.onWaiting)
    this.media.removeEventListener('seeking', this.onSeeking)
    this.media.removeEventListener('seeked', this.onSeeked)
    this.media.removeEventListener('ratechange', this.onRate)
    this.media.removeEventListener('timeupdate', this.onTimeUpdate)
    this.onSize.disconnect()
    this.running.length = 0
    this.prepared = []
    try {
      this.canvas.remove()
    } catch {
      /* ignore */
    }
  }

  /** Sync continuous performance clock with video media time */
  private syncClock(mediaT?: number): void {
    const t = mediaT !== undefined ? mediaT : (this.media?.currentTime || 0)
    this.anchorMediaTime = Number.isFinite(t) ? t : 0
    this.anchorPerfTime = performance.now()
  }

  /** Monitor video clock drift and softly adjust anchor */
  private checkClockDrift(rawVideoTime: number): void {
    if (this.media.paused || this.isBuffering) {
      this.anchorMediaTime = rawVideoTime
      this.anchorPerfTime = performance.now()
      return
    }
    const now = performance.now()
    const rate = Math.max(0.1, this.media.playbackRate || 1)
    const elapsed = (now - this.anchorPerfTime) * 0.001 * rate
    const predicted = this.anchorMediaTime + elapsed
    const drift = rawVideoTime - predicted

    if (Math.abs(drift) > 0.25 || drift < -0.15) {
      this.anchorMediaTime = rawVideoTime
      this.anchorPerfTime = now
    } else if (Math.abs(drift) > 0.025) {
      this.anchorMediaTime += drift * 0.08
    }
  }

  /** High-precision smooth media time */
  private mediaTime(): number {
    if (!this.media) return 0
    const raw = this.media.currentTime || 0
    if (this.media.paused || this.isBuffering) {
      return raw
    }
    const now = performance.now()
    const rate = Math.max(0.1, this.media.playbackRate || 1)
    const elapsed = (now - this.anchorPerfTime) * 0.001 * rate
    const predicted = this.anchorMediaTime + elapsed
    const drift = raw - predicted

    if (Math.abs(drift) > 0.25 || drift < -0.15) {
      this.anchorMediaTime = raw
      this.anchorPerfTime = now
      return raw
    }
    if (Math.abs(drift) > 0.025) {
      this.anchorMediaTime += drift * 0.05
    }
    return Math.max(0, predicted)
  }

  private ensureMeasured(p: Prepared): void {
    if (p.measured && p.width > 0) return
    const mctx = this.measureCtx || this.ctx
    mctx.font = this.font
    p.width = Math.ceil(mctx.measureText(p.text).width) || 1
    p.height = this.laneH
    p.measured = true
    p.duration = this.durationFor(p)
  }

  private durationFor(p: Prepared): number {
    if (p.mode === 'top' || p.mode === 'bottom') {
      return Math.min(
        STATIC_MAX_S,
        Math.max(STATIC_MIN_S, (this.cssW || REF_WIDTH) / this.speedPx),
      )
    }
    const tw = p.measured && p.width > 0 ? p.width : Math.max(40, p.text.length * this.fontPx * 0.6)
    const path = (this.cssW || REF_WIDTH) + tw
    return Math.max(0.5, path / Math.max(40, this.speedPx))
  }

  private recomputeDurations(): void {
    for (const p of this.prepared) {
      if (p.measured) p.duration = this.durationFor(p)
      else p.duration = 0
    }
    for (const r of this.running) {
      this.ensureMeasured(r)
      r.duration = this.durationFor(r)
    }
  }

  private initLanes(): void {
    const h = this.cssH || 1
    const scrollH = h * this.area
    const nScroll = Math.max(1, Math.floor(scrollH / this.laneH))
    const nStatic = Math.max(1, Math.floor((h * 0.45) / this.laneH))
    this.scrollLanes = Array.from({ length: nScroll }, () => ({
      lastTime: -1e9,
      lastDuration: 0,
      lastWidth: 0,
    }))
    this.topLanes = Array.from({ length: nStatic }, () => -1e9)
    this.bottomLanes = Array.from({ length: nStatic }, () => -1e9)
  }

  private seek(): void {
    this.running.length = 0
    this.initLanes()
    const t = this.mediaTime()
    let lo = 0
    let hi = this.prepared.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.prepared[mid].time < t - 30) lo = mid + 1
      else hi = mid
    }
    this.cursor = lo
    while (this.cursor < this.prepared.length) {
      const p = this.prepared[this.cursor]
      if (p.time > t) break
      this.ensureMeasured(p)
      if (t - p.time <= p.duration) {
        this.trySpawn(p, this.cursor, t, true)
      }
      this.cursor++
    }
    this.paint()
    if (!this.media.paused && this.visible) this.ensureLoop()
  }

  private ensureLoop(): void {
    if (this.destroyed || this.raf || !this.visible) return
    if (this.media.paused) {
      this.paint()
      return
    }
    const tick = () => {
      this.raf = 0
      if (this.destroyed || !this.visible) return
      this.tick()
      if (!this.destroyed && this.visible && !this.media.paused) {
        this.raf = requestAnimationFrame(tick)
      }
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private tick(): void {
    const t = this.mediaTime()

    // In-place prune of finished comments (zero allocation)
    const run = this.running
    let w = 0
    for (let i = 0; i < run.length; i++) {
      if (t - run[i].time < run[i].duration && t >= run[i].time - 0.5) {
        if (w !== i) run[w] = run[i]
        w++
      }
    }
    run.length = w

    // Spawn newly due comments
    const cap = this.maxRunning()
    while (this.cursor < this.prepared.length) {
      const p = this.prepared[this.cursor]
      if (p.time > t) break
      this.ensureMeasured(p)
      if (t - p.time > p.duration) {
        this.cursor++
        continue
      }
      if (run.length < cap) {
        this.trySpawn(p, this.cursor, t, false)
      }
      this.cursor++
    }

    this.paint()
  }

  /** Chase-collision lookahead checker */
  private canFitScrollLane(
    lane: ScrollLaneState,
    p: Prepared,
    stageW: number,
  ): boolean {
    if (lane.lastTime <= -1e8) return true
    const prevAge = p.time - lane.lastTime
    if (prevAge < 0) return false
    if (prevAge >= lane.lastDuration) return true

    const prevPath = stageW + lane.lastWidth
    const prevX = stageW - (prevAge / Math.max(0.1, lane.lastDuration)) * prevPath
    const prevTailX = prevX + lane.lastWidth

    // 1. Entry check: previous danmaku tail must have entered and cleared gap
    if (prevTailX + LANE_GAP_PX > stageW) return false

    // 2. Exit / Chase check: current danmaku must not overtake previous danmaku on screen
    const prevExitTime = lane.lastTime + lane.lastDuration
    const curExitTime = p.time + p.duration
    if (curExitTime < prevExitTime) return false

    return true
  }

  private trySpawn(
    p: Prepared,
    idx: number,
    now: number,
    retro: boolean,
  ): boolean {
    if (this.running.length >= this.maxRunning()) return false
    this.ensureMeasured(p)

    if (p.mode === 'rtl') {
      const lanes = this.scrollLanes
      if (!lanes.length) return false
      const stageW = this.cssW || REF_WIDTH

      let chosen = -1
      // Strictly allocate collision-free lane (No-Overlap)
      for (let i = 0; i < lanes.length; i++) {
        if (this.canFitScrollLane(lanes[i], p, stageW)) {
          chosen = i
          break
        }
      }

      // If all lanes in the active area are occupied, drop cleanly to preserve visual comfort
      if (chosen < 0) return false

      lanes[chosen] = {
        lastTime: p.time,
        lastDuration: p.duration,
        lastWidth: p.width,
      }

      const y = chosen * this.laneH
      if (!retro || now - p.time < p.duration) {
        this.running.push({
          ...p,
          y,
          idx,
          renderX: 0,
          renderY: 0,
          renderVisible: false,
        })
      }
      return true
    }

    if (p.mode === 'top') {
      const lanes = this.topLanes
      let chosen = -1
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= p.time) {
          chosen = i
          break
        }
      }
      if (chosen < 0) return false
      lanes[chosen] = p.time + p.duration
      this.running.push({
        ...p,
        y: chosen * this.laneH,
        idx,
        renderX: 0,
        renderY: 0,
        renderVisible: false,
      })
      return true
    }

    if (p.mode === 'bottom') {
      const lanes = this.bottomLanes
      let chosen = -1
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= p.time) {
          chosen = i
          break
        }
      }
      if (chosen < 0) return false
      lanes[chosen] = p.time + p.duration
      this.running.push({
        ...p,
        y: chosen * this.laneH,
        idx,
        renderX: 0,
        renderY: 0,
        renderVisible: false,
      })
      return true
    }

    return false
  }

  private clearCanvas(): void {
    const { ctx, cssW, cssH } = this
    if (cssW <= 0 || cssH <= 0) return
    ctx.clearRect(0, 0, cssW, cssH)
  }

  /**
   * Two-pass direct GPU-accelerated batch paint (Zero-GC):
   * Pass 1: Outer high-contrast black stroke
   * Pass 2: Inner text color fill
   */
  private paint(): void {
    if (this.destroyed || !this.visible) return
    const { ctx, cssW, cssH } = this
    if (cssW <= 0 || cssH <= 0) return

    ctx.clearRect(0, 0, cssW, cssH)
    const n = this.running.length
    if (!n) return

    const t = this.mediaTime()
    const W = cssW
    const laneMid = (this.laneH - this.fontPx) * 0.5

    let visibleCount = 0
    for (let i = 0; i < n; i++) {
      const r = this.running[i]
      const age = t - r.time
      if (age < 0 || age >= r.duration) {
        r.renderVisible = false
        continue
      }

      let x: number
      let y: number
      if (r.mode === 'rtl') {
        const path = W + r.width
        x = W - (age / r.duration) * path
        y = r.y + laneMid
      } else if (r.mode === 'top') {
        x = (W - r.width) * 0.5
        y = r.y + laneMid
      } else if (r.mode === 'bottom') {
        x = (W - r.width) * 0.5
        y = cssH - r.height - r.y + laneMid
      } else {
        r.renderVisible = false
        continue
      }

      r.renderX = x
      r.renderY = y
      r.renderVisible = true
      visibleCount++
    }

    if (visibleCount === 0) return

    ctx.save()
    ctx.globalAlpha = this._opacity
    ctx.font = this.font
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2

    // Batch Pass 1: High contrast outer stroke (set strokeStyle once)
    const lineW = Math.max(2, Math.round(this.fontPx * 0.125))
    ctx.lineWidth = lineW
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'

    for (let i = 0; i < n; i++) {
      const r = this.running[i]
      if (r.renderVisible) {
        ctx.strokeText(r.text, r.renderX, r.renderY)
      }
    }

    // Batch Pass 2: Crisp inner text fill
    for (let i = 0; i < n; i++) {
      const r = this.running[i]
      if (r.renderVisible) {
        ctx.fillStyle = r.color || '#ffffff'
        ctx.fillText(r.text, r.renderX, r.renderY)
      }
    }

    ctx.restore()
  }
}
