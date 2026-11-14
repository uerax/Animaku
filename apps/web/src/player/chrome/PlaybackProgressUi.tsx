import { memo, useId, useMemo } from 'react'
import type { DanmakuComment } from '@animaku/shared'
import { formatTime } from '../media/format'
import {
  usePlayerProgress,
  usePlayerTime,
} from '../timeStore'
import { perfMetrics } from '../../lib/performance-metrics'

export interface PlayerTimeDisplayProps {
  staticDuration?: number
}

/**
 * 局部订阅时间戳组件（用于 01:23 / 24:00 时间显示）
 * 仅当 current 或 duration 改变时局部重渲染，完全切断对外层控制栏的污染
 */
export const PlayerTimeDisplay = memo(function PlayerTimeDisplay({
  staticDuration,
}: PlayerTimeDisplayProps) {
  const { current, duration } = usePlayerTime()
  const d = staticDuration ?? duration

  return (
    <span className="kz-time">
      {formatTime(current)} / {formatTime(d)}
    </span>
  )
})

export interface PlayerSeekRangeProps {
  dragRatio: number | null
  onSeekRatio: (ratio: number) => void
}

/**
 * 局部订阅进度滑块组件（用于 kz-seek 与 CSS --kz-progress 进度条样式）
 * 仅当 progress 百分比改变时局部重渲染，彻底阻断每秒 4 次向 Controls 树扩散
 */
export const PlayerSeekRange = memo(function PlayerSeekRange({
  dragRatio,
}: PlayerSeekRangeProps) {
  perfMetrics.recordProgressRender()
  const progress = usePlayerProgress()
  const effectiveProgress = dragRatio !== null ? dragRatio * 100 : progress

  return (
    <div
      className="kz-seek"
      style={{ ['--kz-progress' as string]: `${effectiveProgress}%` }}
      aria-label="进度"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(effectiveProgress)}
    >
      <div className="kz-seek-track">
        <div
          className="kz-seek-played"
          style={{ width: `${effectiveProgress}%` }}
        />
      </div>
      <div
        className="kz-seek-thumb"
        style={{ left: `${effectiveProgress}%` }}
      />
    </div>
  )
})

/**
 * 计算弹幕热力图 SVG 波浪曲线路径
 */
export function computeDanmakuHeatmap(
  comments: DanmakuComment[] | undefined,
  duration: number,
  numBuckets = 60,
  height = 24,
): string | null {
  if (!comments || comments.length < 5 || duration <= 0) return null
  const buckets = new Array(numBuckets).fill(0)
  for (const c of comments) {
    if (c.time >= 0 && c.time <= duration) {
      const idx = Math.min(
        numBuckets - 1,
        Math.floor((c.time / duration) * numBuckets),
      )
      buckets[idx]++
    }
  }
  const max = Math.max(...buckets)
  if (max <= 1) return null

  // 3-point moving average smoothing
  const smoothed = buckets.map((val, i) => {
    const prev = buckets[i - 1] ?? val
    const next = buckets[i + 1] ?? val
    return (prev + val * 2 + next) / 4
  })
  const smoothedMax = Math.max(...smoothed) || 1

  let path = `M 0 ${height}`
  for (let i = 0; i < numBuckets; i++) {
    const x = (i / (numBuckets - 1)) * 100
    const normalized = smoothed[i] / smoothedMax
    const y = height - Math.pow(normalized, 0.75) * (height - 3)
    path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  path += ` L 100 ${height} Z`
  return path
}

export interface PlayerDanmakuHeatmapProps {
  comments?: DanmakuComment[]
  duration: number
  height?: number
  numBuckets?: number
  idPrefix?: string
}

/**
 * 局部订阅弹幕热力图组件（纯净优雅的弹幕密度波浪，鼠标悬停时高亮浮现）
 */
export const PlayerDanmakuHeatmap = memo(function PlayerDanmakuHeatmap({
  comments,
  duration,
  height = 24,
  numBuckets = 60,
  idPrefix,
}: PlayerDanmakuHeatmapProps) {
  const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const gradId = idPrefix ? `${idPrefix}-grad` : `kz-hm-grad-${autoId}`

  const heatmapPath = useMemo(
    () => computeDanmakuHeatmap(comments, duration, numBuckets, height),
    [comments, duration, numBuckets, height],
  )

  if (!heatmapPath || duration <= 0) return null

  return (
    <svg
      className="kz-seek-heatmap"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.45)" />
          <stop offset="100%" stopColor="rgba(56, 189, 248, 0.02)" />
        </linearGradient>
      </defs>
      <path d={heatmapPath} fill={`url(#${gradId})`} />
    </svg>
  )
})

