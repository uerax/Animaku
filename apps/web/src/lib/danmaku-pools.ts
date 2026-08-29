import type { DanmakuComment } from '@animaku/shared'

/** Independent comment pools that can be shown / hidden without reloading */
export type DanmakuPoolId = 'dandan' | 'bilibili_auto' | 'bilibili_manual' | 'upload'

export const DANMAKU_POOL_ORDER: DanmakuPoolId[] = [
  'dandan',
  'bilibili_auto',
  'bilibili_manual',
  'upload',
]

export const DANMAKU_POOL_LABEL: Record<DanmakuPoolId, string> = {
  dandan: '弹弹',
  bilibili_auto: 'B站',
  bilibili_manual: 'bilibili',
  upload: '用户上传',
}

export type DanmakuPoolSlice = {
  comments: DanmakuComment[]
  enabled: boolean
  /** short label e.g. file name / bvid */
  meta?: string
  /** Per-source time offset in seconds (e.g. +3.5 to delay, -2 to advance) */
  timeOffset?: number
}

export type DanmakuPools = Record<DanmakuPoolId, DanmakuPoolSlice>

export type DanmakuSourceChip = {
  id: DanmakuPoolId
  label: string
  count: number
  enabled: boolean
  /** has any comments loaded */
  loaded: boolean
  meta?: string
  timeOffset: number
}

export function emptyDanmakuPools(): DanmakuPools {
  return {
    dandan: { comments: [], enabled: true, timeOffset: 0 },
    bilibili_auto: { comments: [], enabled: false, timeOffset: 0 },
    bilibili_manual: { comments: [], enabled: true, timeOffset: 0 },
    upload: { comments: [], enabled: true, timeOffset: 0 },
  }
}

function commentKey(c: DanmakuComment): string {
  return `${c.time}\0${c.mode}\0${c.text}\0${c.style?.color || ''}`
}

/** Dedupe by time+mode+text; keep earlier order then sort by time */
export function mergeComments(
  existing: DanmakuComment[],
  incoming: DanmakuComment[],
): DanmakuComment[] {
  if (!incoming.length) return existing
  if (!existing.length) {
    return [...incoming].sort((a, b) => a.time - b.time)
  }
  const seen = new Set(existing.map(commentKey))
  const extra: DanmakuComment[] = []
  for (const c of incoming) {
    const k = commentKey(c)
    if (seen.has(k)) continue
    seen.add(k)
    extra.push(c)
  }
  if (!extra.length) return existing
  return [...existing, ...extra].sort((a, b) => a.time - b.time)
}

export function tagCommentsPool(
  comments: DanmakuComment[],
  pool: DanmakuPoolId,
): DanmakuComment[] {
  return comments.map((c) => ({
    ...c,
    // keep original source if present; pool id is tracked by the pools map
    source: c.source || pool,
  }))
}

/**
 * Write into one pool.
 * - replace: used for 弹弹 re-match / re-pick episode
 * - append: default for B站 / 本地 XML import
 * If enabled is provided, sets enabled state explicitly; otherwise defaults to true.
 */
export function writePool(
  pools: DanmakuPools,
  id: DanmakuPoolId,
  comments: DanmakuComment[],
  mode: 'replace' | 'append',
  meta?: string,
  enabled?: boolean,
  timeOffset?: number,
): DanmakuPools {
  const tagged = tagCommentsPool(comments, id)
  const prev = pools[id]
  const nextComments =
    mode === 'append' ? mergeComments(prev.comments, tagged) : tagged
  return {
    ...pools,
    [id]: {
      comments: nextComments,
      enabled: enabled !== undefined ? enabled : true,
      meta: meta !== undefined ? meta : prev.meta,
      timeOffset:
        timeOffset !== undefined ? timeOffset : (prev.timeOffset ?? 0),
    },
  }
}

export function setPoolOffset(
  pools: DanmakuPools,
  id: DanmakuPoolId,
  offset: number,
): DanmakuPools {
  const slice = pools[id]
  return {
    ...pools,
    [id]: {
      ...slice,
      timeOffset: Number.isFinite(offset) ? offset : 0,
    },
  }
}

export function togglePool(
  pools: DanmakuPools,
  id: DanmakuPoolId,
): DanmakuPools {
  const slice = pools[id]
  return {
    ...pools,
    [id]: { ...slice, enabled: !slice.enabled },
  }
}

/** Comments actually drawn on the player (enabled pools only, with per-pool timeOffset applied) */
export function flattenEnabledPools(pools: DanmakuPools): DanmakuComment[] {
  const out: DanmakuComment[] = []
  for (const id of DANMAKU_POOL_ORDER) {
    const slice = pools[id]
    if (!slice.enabled || !slice.comments.length) continue
    const offset = slice.timeOffset ?? 0
    if (offset === 0) {
      out.push(...slice.comments)
    } else {
      for (const c of slice.comments) {
        out.push({
          ...c,
          time: Math.max(0, c.time + offset),
        })
      }
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

export function totalLoadedCount(pools: DanmakuPools): number {
  let n = 0
  for (const id of DANMAKU_POOL_ORDER) n += pools[id].comments.length
  return n
}

export function enabledCount(pools: DanmakuPools): number {
  // Sum lengths only — avoid full flatten+sort used by flattenEnabledPools
  let n = 0
  for (const id of DANMAKU_POOL_ORDER) {
    const slice = pools[id]
    if (slice.enabled) n += slice.comments.length
  }
  return n
}

export function sourceChips(pools: DanmakuPools): DanmakuSourceChip[] {
  return DANMAKU_POOL_ORDER.map((id) => ({
    id,
    label: DANMAKU_POOL_LABEL[id],
    count: pools[id].comments.length,
    enabled: pools[id].enabled,
    loaded: pools[id].comments.length > 0,
    meta: pools[id].meta,
    timeOffset: pools[id].timeOffset ?? 0,
  }))
}

export function poolsStatusLine(pools: DanmakuPools, fallback = '—'): string {
  const parts = DANMAKU_POOL_ORDER.filter((id) => pools[id].comments.length).map(
    (id) => {
      const s = pools[id]
      const on = s.enabled ? '' : '·关'
      const meta = s.meta ? ` ${s.meta}` : ''
      return `${DANMAKU_POOL_LABEL[id]}${meta} ${s.comments.length}${on}`
    },
  )
  if (!parts.length) return fallback
  const drawn = enabledCount(pools)
  return `${parts.join(' · ')} · 显示 ${drawn}`
}
