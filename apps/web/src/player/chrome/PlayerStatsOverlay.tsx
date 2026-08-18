import { useState } from 'react'
import type { SuperResolutionMode } from '@animaku/shared'
import { IconCheck, IconClose, IconCopy, IconStats } from './icons'

export interface PlayerStatsData {
  videoWidth: number
  videoHeight: number
  displayWidth: number
  displayHeight: number
  fps: number
  droppedFrames: number
  totalFrames: number
  bandwidthEstimateBps: number
  lastFragStats?: {
    bytes: number
    loadTimeMs: number
    speedBytesPerSec: number
  } | null
  bufferAhead: number
  duration: number
  currentTime: number
  volume: number
  speed: number
  videoCodec?: string
  audioCodec?: string
  engine: string
  srMode: SuperResolutionMode
  srActive: boolean
  sourceHost?: string
  aspectRatio: string
  isPaused: boolean
}

interface PlayerStatsOverlayProps {
  stats: PlayerStatsData
  onClose: () => void
  formatTime: (sec: number) => string
}

function formatBitrate(bps: number): string {
  if (!bps || bps <= 0) return '0 KB/s'
  const mbps = bps / 1_000_000
  if (mbps >= 1) {
    const mBps = bps / 8 / 1024 / 1024
    return `${mBps.toFixed(2)} MB/s (${mbps.toFixed(1)} Mbps)`
  }
  const kbps = bps / 1_000
  const kBps = bps / 8 / 1024
  return `${kBps.toFixed(1)} KB/s (${kbps.toFixed(0)} Kbps)`
}

function formatByteSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '---'
  const mbs = bytesPerSec / 1024 / 1024
  if (mbs >= 1) {
    return `${mbs.toFixed(2)} MB/s`
  }
  const kbs = bytesPerSec / 1024
  return `${kbs.toFixed(1)} KB/s`
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

export function PlayerStatsOverlay({
  stats,
  onClose,
  formatTime,
}: PlayerStatsOverlayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const summary = [
      `=== Animaku 视频播放统计信息 ===`,
      `原始分辨率: ${stats.videoWidth} × ${stats.videoHeight}`,
      `渲染尺寸: ${stats.displayWidth} × ${stats.displayHeight}`,
      `画幅比例: ${stats.aspectRatio}`,
      `实时带宽估算: ${formatBitrate(stats.bandwidthEstimateBps)}`,
      stats.lastFragStats
        ? `最近切片加载: ${formatBytes(stats.lastFragStats.bytes)} / ${Math.round(stats.lastFragStats.loadTimeMs)}ms (${formatByteSpeed(stats.lastFragStats.speedBytesPerSec)})`
        : null,
      `缓冲余量: ${stats.bufferAhead.toFixed(2)}s (${Math.min(100, Math.round((stats.bufferAhead / (stats.duration || 1)) * 100))}%)`,
      `解码帧率: ${stats.fps.toFixed(1)} FPS`,
      `丢帧情况: ${stats.droppedFrames} / ${stats.totalFrames} (${((stats.droppedFrames / Math.max(1, stats.totalFrames)) * 100).toFixed(2)}%)`,
      `编解码格式: 视频 ${stats.videoCodec || '自动/AVC'} · 音频 ${stats.audioCodec || '自动/AAC'}`,
      `播放引擎: ${stats.engine}`,
      `超分辨率 (Anime4K): ${stats.srMode} (${stats.srActive ? '运行中' : '未激活'})`,
      `播放进度: ${formatTime(stats.currentTime)} / ${formatTime(stats.duration)} (倍速: ${stats.speed}x, 音量: ${Math.round(stats.volume * 100)}%)`,
      `视频源主机: ${stats.sourceHost || 'Direct/Local'}`,
    ]
      .filter(Boolean)
      .join('\n')

    void navigator.clipboard.writeText(summary).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  const dropRate =
    stats.totalFrames > 0
      ? ((stats.droppedFrames / stats.totalFrames) * 100).toFixed(2)
      : '0.00'

  return (
    <div
      className="kz-stats-overlay absolute top-3 left-3 z-[80] select-text w-[22.5rem] max-w-[calc(100%-1.5rem)] box-border rounded-xl border border-[rgba(255,255,255,0.18)] bg-[rgba(15,23,42,0.92)] p-3.5 text-xs text-white shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-player-chrome="true"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.12)] pb-2 mb-2.5 gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-100 whitespace-nowrap min-w-0">
          <IconStats className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold whitespace-nowrap">详细统计信息</span>
          <span
            className={`inline-block h-2 w-2 rounded-full shrink-0 ${
              stats.isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
            }`}
            title={stats.isPaused ? '已暂停' : '正在播放'}
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            title="复制统计信息"
          >
            {copied ? (
              <>
                <IconCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 whitespace-nowrap">已复制</span>
              </>
            ) : (
              <>
                <IconCopy className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">复制</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-300 transition-colors hover:bg-white/15 hover:text-white cursor-pointer flex items-center justify-center"
            aria-label="关闭统计信息"
            title="关闭 (Esc)"
          >
            <IconClose className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1.5 font-mono text-[11px] leading-relaxed text-slate-200">
        <span className="text-slate-400">视频分辨率</span>
        <span className="truncate">
          {stats.videoWidth > 0 && stats.videoHeight > 0 ? (
            <>
              <span className="font-semibold text-sky-400">
                {stats.videoWidth} × {stats.videoHeight}
              </span>
              <span className="text-slate-400">
                {' '}
                → {stats.displayWidth} × {stats.displayHeight}
              </span>
            </>
          ) : (
            '加载中…'
          )}
        </span>

        <span className="text-slate-400">请求速度</span>
        <span className="truncate font-semibold text-emerald-400">
          {formatBitrate(stats.bandwidthEstimateBps)}
        </span>

        {stats.lastFragStats && (
          <>
            <span className="text-slate-400">切片吞吐</span>
            <span className="truncate text-slate-300">
              {formatBytes(stats.lastFragStats.bytes)} /{' '}
              {Math.round(stats.lastFragStats.loadTimeMs)}ms (
              <span className="text-emerald-400 font-semibold">
                {formatByteSpeed(stats.lastFragStats.speedBytesPerSec)}
              </span>
              )
            </span>
          </>
        )}

        <span className="text-slate-400">当前缓冲</span>
        <span className="truncate">
          <span className="font-semibold text-sky-300">
            {stats.bufferAhead.toFixed(2)}s
          </span>
          <span className="text-slate-400">
            {' '}
            (
            {Math.min(
              100,
              Math.round((stats.bufferAhead / (stats.duration || 1)) * 100),
            )}
            %)
          </span>
        </span>

        <span className="text-slate-400">帧率 / 丢帧</span>
        <span className="truncate">
          <span className="text-slate-100">{stats.fps.toFixed(1)} FPS</span>
          <span className="text-slate-400"> · 丢帧 </span>
          <span
            className={
              stats.droppedFrames > 0 ? 'text-amber-300' : 'text-slate-300'
            }
          >
            {stats.droppedFrames} / {stats.totalFrames} ({dropRate}%)
          </span>
        </span>

        <span className="text-slate-400">编解码器</span>
        <span className="truncate text-slate-300">
          {stats.videoCodec || 'AVC/H.264'} · {stats.audioCodec || 'AAC'}
        </span>

        <span className="text-slate-400">流媒体引擎</span>
        <span className="truncate text-slate-300">{stats.engine}</span>

        <span className="text-slate-400">画质超分</span>
        <span className="truncate">
          {stats.srMode !== 'off' ? (
            <span className="text-purple-400 font-semibold">
              Anime4K ({stats.srMode} · {stats.srActive ? '运行中' : '待机'})
            </span>
          ) : (
            <span className="text-slate-400">关闭</span>
          )}
        </span>

        <span className="text-slate-400">画幅 / 倍速</span>
        <span className="truncate text-slate-300">
          {stats.aspectRatio} · {stats.speed}x · 音量{' '}
          {Math.round(stats.volume * 100)}%
        </span>

        {stats.sourceHost && (
          <>
            <span className="text-slate-400">源站主机</span>
            <span className="truncate text-slate-300">{stats.sourceHost}</span>
          </>
        )}
      </div>
    </div>
  )
}
