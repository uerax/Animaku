import { memo } from 'react'
import { formatTime } from '../media/format'
import { usePlayerProgress, usePlayerTime } from '../timeStore'
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
