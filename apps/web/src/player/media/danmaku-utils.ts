import type { DanmakuComment, DanmakuMode, DanmakuSettings } from '@animaku/shared'

/**
 * Bilibili standard on-screen transit durations (calibrated with integer timing):
 * - Desktop scroll: 11.0s constant physical transit duration across all playback rates
 * - Mobile fullscreen scroll: 8.0s (1.20x speedup for mobile visual angle)
 * - Mobile windowed scroll: 8.0s (1.20x speedup for mobile visual angle)
 * - Static hold (top / bottom): 5.0s
 */
export const BILI_SCROLL_BASE_DURATION = 11.0
export const BILI_SCROLL_MOBILE_FS_DURATION = 8.0
export const BILI_STATIC_BASE_DURATION = 5.0
export const BASE_DANMAKU_SPEED = 130

/**
 * Base size ~20px at a mid-size player (calibrated to 0.8x of legacy 25px); user fontSize is a multiplier.
 * Desktop scales with container width. Mobile is height-based with hard caps so
 * phone fullscreen (wide CSS width, short physical stage) does not blow up to
 * ~27px and blanket the frame.
 */
const DANMAKU_REF_WIDTH = 720
const DANMAKU_MIN_SCALE = 0.5 // ~10px @ default multiplier (desktop)
const DANMAKU_MAX_SCALE = 1.1
/** Matches canvas BILI_BASE_PX — scale is targetPx / this. */
const DANMAKU_BASE_PX = 20

export type DanmakuPointerMode = 'desktop' | 'mobile'

/** Layout context for font/speed — desktop keeps width curve; mobile is separate. */
export type DanmakuLayoutHints = {
  mode?: DanmakuPointerMode
  /** DOM / CSS / iOS video fullscreen */
  fullscreen?: boolean
  /** Stage CSS height; mobile sizes by height so landscape width does not inflate. */
  height?: number
}

type CompiledFilter =
  | { kind: 're'; re: RegExp }
  | { kind: 'sub'; text: string }

/** Compile keyword filters once per settings change (not per comment). */
function compileFilters(filters: string[] | undefined): CompiledFilter[] {
  const out: CompiledFilter[] = []
  if (!filters?.length) return out
  for (const rule of filters) {
    if (!rule) continue
    if (rule.startsWith('/') && rule.lastIndexOf('/') > 0) {
      try {
        const body = rule.slice(1, rule.lastIndexOf('/'))
        const flags = rule.slice(rule.lastIndexOf('/') + 1)
        out.push({ kind: 're', re: new RegExp(body, flags) })
      } catch {
        /* ignore bad regex */
      }
    } else {
      out.push({ kind: 'sub', text: rule })
    }
  }
  return out
}

/** Time window (seconds) within which identical/similar danmaku are merged */
export const SIMPLIFY_MERGE_WINDOW_SEC = 4.0

/** Max danmaku allowed per 1-second interval under simplify mode to avoid screen blanket */
export const SIMPLIFY_MAX_PER_SEC = 8

/** Normalize text for fuzzy equality match (e.g. 233333 -> 233, whitespace, fullwidth) */
export function normalizeDanmakuText(raw: string): string {
  let s = (raw || '').trim().toLowerCase()
  if (!s) return ''
  // Convert full-width ASCII chars to half-width
  s = s.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
  // Collapse repeated characters (3 or more -> 2, e.g. 233333 -> 233, 哈哈哈哈 -> 哈哈, ???? -> ??)
  s = s.replace(/(.)\1{2,}/g, '$1$1')
  // Strip leading/trailing decorative punctuation for matching key
  const stripped = s.replace(
    /^[\s,.;:!?~—_=+~～！，。？：、]+|[\s,.;:!?~—_=+~～！，。？：、]+$/g,
    '',
  )
  return stripped || s
}

/**
 * Bilibili / Pakku standard Danmaku Simplification:
 * 1. Sliding window (4.0s) deduplication & count badge `(xN)`
 * 2. High-density smart rate-limiting (preserves high-entropy meaningful comments)
 */
export function simplifyDanmaku(comments: DanmakuComment[]): DanmakuComment[] {
  if (comments.length <= 1) return comments

  // Ensure chronological order
  const sorted = comments.slice().sort((a, b) => a.time - b.time)
  const merged: DanmakuComment[] = []

  // Active merge buckets keyed by `${mode}|${normalizedText}`
  type MergeBucket = {
    lead: DanmakuComment
    normKey: string
    count: number
    lastTime: number
  }

  const activeBuckets = new Map<string, MergeBucket>()

  for (const c of sorted) {
    const norm = normalizeDanmakuText(c.text)
    const key = `${c.mode || 'rtl'}|${norm}`
    const existing = activeBuckets.get(key)

    if (existing && c.time - existing.lastTime <= SIMPLIFY_MERGE_WINDOW_SEC) {
      // In-window duplicate: accumulate count and advance lastTime
      existing.count += 1
      existing.lastTime = c.time
      // If the newcomer has a custom color and lead didn't, adopt it
      if (c.style?.color && !existing.lead.style?.color) {
        existing.lead.style = c.style
      }
    } else {
      // If there was an expired bucket, flush it
      if (existing) {
        merged.push(formatMergedComment(existing))
        activeBuckets.delete(key)
      }
      // Start new bucket
      activeBuckets.set(key, {
        lead: { ...c },
        normKey: norm,
        count: 1,
        lastTime: c.time,
      })
    }
  }

  // Flush remaining active buckets
  for (const bucket of activeBuckets.values()) {
    merged.push(formatMergedComment(bucket))
  }

  // Re-sort after bucket collection
  merged.sort((a, b) => a.time - b.time)

  // Smart high-density throttling (limit per-second bucket, drop lowest-entropy spam if overcrowded)
  return throttleHighDensity(merged)
}

function formatMergedComment(bucket: {
  lead: DanmakuComment
  normKey: string
  count: number
}): DanmakuComment {
  if (bucket.count <= 1) return bucket.lead
  const baseText = bucket.lead.text.trim()
  return {
    ...bucket.lead,
    text: `${baseText} (x${bucket.count})`,
  }
}

/** Rate limits extreme density spikes (e.g. >16/sec) by keeping higher-entropy comments */
function throttleHighDensity(comments: DanmakuComment[]): DanmakuComment[] {
  if (comments.length <= SIMPLIFY_MAX_PER_SEC) return comments

  const out: DanmakuComment[] = []
  let secBucket = -1
  let secComments: DanmakuComment[] = []

  const flushSec = () => {
    if (!secComments.length) return
    if (secComments.length <= SIMPLIFY_MAX_PER_SEC) {
      out.push(...secComments)
    } else {
      // Score each comment by information entropy / length / count
      const scored = secComments.map((c, idx) => {
        const hasCount = /\(x\d+\)$/.test(c.text)
        const isStatic = c.mode === 'top' || c.mode === 'bottom'
        const len = c.text.length
        const score = (hasCount ? 100 : 0) + (isStatic ? 50 : 0) + Math.min(30, len * 2)
        return { c, score, idx }
      })
      // Keep highest scoring ones, preserving original arrival order
      scored.sort((a, b) => b.score - a.score || a.idx - b.idx)
      const kept = scored.slice(0, SIMPLIFY_MAX_PER_SEC)
      kept.sort((a, b) => a.idx - b.idx)
      for (const item of kept) out.push(item.c)
    }
    secComments = []
  }

  for (const c of comments) {
    const sec = Math.floor(c.time)
    if (sec !== secBucket) {
      flushSec()
      secBucket = sec
    }
    secComments.push(c)
  }
  flushSec()

  return out
}

export function filterComments(
  comments: DanmakuComment[],
  settings: DanmakuSettings,
): DanmakuComment[] {
  const compiled = compileFilters(settings.filters)
  const filtered = comments.filter((c) => {
    if (!settings.showScroll && c.mode === 'rtl') return false
    if (!settings.showTop && c.mode === 'top') return false
    if (!settings.showBottom && c.mode === 'bottom') return false
    if (
      !settings.showColor &&
      c.style?.color &&
      c.style.color.toLowerCase() !== '#ffffff'
    ) {
      return false
    }
    for (const f of compiled) {
      if (f.kind === 're') {
        if (f.re.test(c.text)) return false
      } else if (c.text.includes(f.text)) {
        return false
      }
    }
    return true
  })

  if (settings.simplify) {
    return simplifyDanmaku(filtered)
  }
  return filtered
}

/**
 * Font scale relative to 25px base × user fontSize multiplier.
 * - desktop: width / 720, clamped [0.48, 1.1]
 * - mobile windowed: ~4.2% of stage height, clamped ~12–18px
 * - mobile fullscreen: ~3.2% of stage height, clamped ~11–14.5px (was ~27px on
 *   phone landscape because width≈844 hit the desktop max)
 */
export function danmakuFontScale(
  containerWidth: number,
  hints?: DanmakuLayoutHints,
): number {
  if (hints?.mode === 'mobile') {
    const w = containerWidth > 0 ? containerWidth : DANMAKU_REF_WIDTH
    const h =
      hints.height && hints.height > 0 ? hints.height : w * (9 / 16)
    // Height drives mobile size: landscape phones are wide but short.
    if (hints.fullscreen) {
      const targetPx = Math.min(14.5, Math.max(11, h * 0.032))
      return targetPx / DANMAKU_BASE_PX
    }
    const targetPx = Math.min(18, Math.max(12, h * 0.042))
    return targetPx / DANMAKU_BASE_PX
  }

  if (!(containerWidth > 0)) return 1
  return Math.min(
    DANMAKU_MAX_SCALE,
    Math.max(DANMAKU_MIN_SCALE, containerWidth / DANMAKU_REF_WIDTH),
  )
}

/** Coarse bucket for “did font scale meaningfully change?” checks. */
export function danmakuFontScaleBucket(
  containerWidth: number,
  hints?: DanmakuLayoutHints,
): number {
  const modeBit = hints?.mode === 'mobile' ? 1 : 0
  const fsBit = hints?.fullscreen ? 1 : 0
  return (
    Math.round(danmakuFontScale(containerWidth, hints) * 50) +
    modeBit * 1000 +
    fsBit * 2000
  )
}

/**
 * Bilibili standard on-screen transit duration (seconds in real-world physical time):
 * - Desktop scroll: 7.5s / userSpeed
 * - Mobile fullscreen scroll: 6.5s / userSpeed (smaller visual angle)
 * - Top / Bottom static: 4.0s
 */
export function danmakuRealDuration(
  mode: DanmakuMode,
  userSpeed = 1,
  hints?: DanmakuLayoutHints,
): number {
  const mult = userSpeed > 0 ? userSpeed : 1
  if (mode === 'top' || mode === 'bottom') {
    return BILI_STATIC_BASE_DURATION
  }
  const base =
    hints?.mode === 'mobile'
      ? (hints.fullscreen ? BILI_SCROLL_MOBILE_FS_DURATION : 8.0)
      : BILI_SCROLL_BASE_DURATION
  return Math.max(0.5, base / mult)
}

/** Pixel speed for scroll comments; based on stage width and transit duration. */
export function danmakuPixelSpeed(
  containerWidth: number,
  userSpeed: number,
  hints?: DanmakuLayoutHints,
): number {
  const w = containerWidth > 0 ? containerWidth : DANMAKU_REF_WIDTH
  const dur = danmakuRealDuration('rtl', userSpeed, hints)
  // Assume standard text width ~160px for px/s calculation
  return Math.max(40, (w + 160) / dur)
}
