import { memo, useId, useMemo } from 'react'
import type { DanmakuComment } from '@animaku/shared'
import { formatTime } from '../media/format'
import {
  usePlayerPlayedRanges,
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
  onSeekRatio,
}: PlayerSeekRangeProps) {
  perfMetrics.recordProgressRender()
  const progress = usePlayerProgress()
  const effectiveProgress = dragRatio !== null ? dragRatio * 100 : progress

  return (
    <input
      type="range"
      className="kz-seek"
      min={0}
      max={1000}
      value={Math.round(effectiveProgress * 10)}
      onChange={(e) => onSeekRatio(Number(e.target.value) / 1000)}
      style={{ ['--kz-progress' as string]: `${effectiveProgress}%` }}
      aria-label="进度"
    />
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
  dragRatio?: number | null
  height?: number
  numBuckets?: number
  idPrefix?: string
}

/**
 * 局部订阅弹幕热力图组件（已播放的非连续区间上色，跳过的区间保持白色）
 * 仅根据 video.played 实际播放区间渲染 clipPath，跳过区域（如从 1 分钟跳到 5 分钟）不被包含在蒙版中，保持纯白
 */
export const PlayerDanmakuHeatmap = memo(function PlayerDanmakuHeatmap({
  comments,
  duration,
  height = 24,
  numBuckets = 60,
  idPrefix,
}: PlayerDanmakuHeatmapProps) {
  const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const prefix = idPrefix || `kz-hm-${autoId}`

  const heatmapPath = useMemo(
    () => computeDanmakuHeatmap(comments, duration, numBuckets, height),
    [comments, duration, numBuckets, height],
  )

  const playedRanges = usePlayerPlayedRanges()

  if (!heatmapPath || duration <= 0) return null

  const clipId = `${prefix}-clip`
  const gradPlayedId = `${prefix}-grad-p`
  const gradUnplayedId = `${prefix}-grad-u`

  // 映射真实观看/播放过的区间（秒）为 SVG userSpace 坐标（0 ~ 100）
  // 跳过的区间（如 1 分钟跳到 5 分钟）不会生成 rect，顶层主题色被裁切排除，从而显示底层白色
  const rangeRects = playedRanges
    .map(([start, end], idx) => {
      const left = Math.max(0, Math.min(100, (start / duration) * 100))
      const right = Math.max(0, Math.min(100, (end / duration) * 100))
      const width = Math.max(0, right - left)
      if (width <= 0) return null
      return (
        <rect
          key={idx}
          x={Number(left.toFixed(2))}
          y={0}
          width={Number(width.toFixed(2))}
          height={height}
        />
      )
    })
    .filter(Boolean)

  return (
    <svg
      className="kz-seek-heatmap"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* 已播放区域渐变（主题色，鲜明高亮） */}
        <linearGradient id={gradPlayedId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.7)" />
          <stop offset="100%" stopColor="rgba(56, 189, 248, 0.08)" />
        </linearGradient>

        {/* 未播放/跳过区域渐变（白色半透明） */}
        <linearGradient id={gradUnplayedId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.38)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.06)" />
        </linearGradient>

        {/* 动态裁切区域：仅包含真正播放过的所有区间矩形集合（跳过的部分被排除，自动显示底层白色） */}
        <clipPath id={clipId}>
          {rangeRects.length > 0 ? (
            rangeRects
          ) : (
            <rect x="0" y="0" width="0" height={height} />
          )}
        </clipPath>
      </defs>

      {/* 底层：未播放/跳过区域（全宽半透明白色波浪） */}
      <path
        d={heatmapPath}
        fill={`url(#${gradUnplayedId})`}
        className="kz-seek-heatmap-unplayed"
      />

      {/* 顶层：已播放区域（主题天蓝色，通过 clip-path 仅裁切出真正看过的片段） */}
      <path
        d={heatmapPath}
        fill={`url(#${gradPlayedId})`}
        clipPath={`url(#${clipId})`}
        className="kz-seek-heatmap-played"
      />
    </svg>
  )
})

