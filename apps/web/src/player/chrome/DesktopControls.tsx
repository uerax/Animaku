import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { DanmakuComment, SuperResolutionMode } from '@animaku/shared'
import type { AspectRatioMode, PlayerControlsProps } from './types'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDanmakuOff,
  IconDanmakuOn,
  IconDanmakuSimplify,
  IconDanmakuSettings,
  IconFullscreen,
  IconFullscreenExit,
  IconNext,
  IconOpedMarker,
  IconPause,
  IconPlay,
  IconPrev,
  IconSettings,
  IconVolume,
  IconVolumeMute,
  IconWebFs,
  IconWebFsExit,
  IconWidescreen,
  IconWidescreenExit,
} from './icons'

const ASPECT_RATIO_OPTIONS: { value: AspectRatioMode; label: string }[] = [
  { value: 'contain', label: '默认比例 (16:9)' },
  { value: 'cover', label: '画面铺满 (Cover)' },
  { value: 'fill', label: '100% 拉伸 (Fill)' },
  { value: '4:3', label: '画幅 4:3' },
]

function srTitle(
  webGpuOk: boolean | null,
  srMode: SuperResolutionMode,
  srActive: boolean,
  labels: Record<SuperResolutionMode, string>,
): string {
  if (webGpuOk === false) return '超分（当前环境无 WebGPU）'
  if (srMode === 'off') return '超分（关闭）'
  return `超分（${labels[srMode]}${srActive ? ' · 运行中' : ' · 等待画面'}）`
}

/**
 * Compute SVG danmaku density curve path across seekbar.
 */
function computeDanmakuHeatmap(
  comments: DanmakuComment[] | undefined,
  duration: number,
  numBuckets = 60,
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

  const height = 24
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

/**
 * Desktop control bar — full volume rail + FS labels + Unified Settings Menu + Heatmap & Markers.
 */
export function DesktopControls(props: PlayerControlsProps) {
  const {
    showBar,
    paused,
    panelOpen,
    speedMenuOpen,
    srMenuOpen,
    settingsMenuOpen,
    current,
    duration,
    progress,
    comments,
    danmakuEnabled,
    danmakuSimplify,
    hasDanmakuPanel,
    danmakuPanelNode,
    player,
    srMode,
    srActive,
    webGpuOk,
    playerFs,
    webFs,
    widescreen = false,
    aspectRatio = 'contain',
    onTogglePlay,
    onPrev,
    onNext,
    onSeekRatio,
    onToggleDanmaku,
    onTogglePanel,
    onToggleSpeedMenu,
    onToggleSrMenu,
    onToggleSettingsMenu,
    onPickSpeed,
    onPickSr,
    onAspectRatioChange,
    onToggleAutoNext,
    onToggleOpedSkip,
    onToggleOpedDrawer,
    hasOpedDrawer,
    opedDrawerOpen,
    opedDrawerNode,
    onVolume,
    onToggleMute,
    onTogglePlayerFs,
    onToggleWebFs,
    onToggleWidescreen,
    formatTime,
    speedOptions,
    srLabels,
  } = props

  const [settingsSubmenu, setSettingsSubmenu] = useState<
    'root' | 'speed' | 'sr' | 'aspectRatio' | 'shortcuts'
  >('root')

  const [hoverRatio, setHoverRatio] = useState<number | null>(null)

  useEffect(() => {
    if (!settingsMenuOpen) {
      setSettingsSubmenu('root')
    }
  }, [settingsMenuOpen])

  // Heatmap path calculation
  const heatmapPath = useMemo(
    () => computeDanmakuHeatmap(comments, duration),
    [comments, duration],
  )

  // OP / ED chapter markers — only active when bangumi-oped is enabled and valid timestamps exist
  const opMarker = useMemo(() => {
    if (
      player.preferBangumiOped === false ||
      !player.skipOp?.enabled ||
      !(player.skipOp.duration > 0) ||
      duration <= 0
    ) {
      return null
    }
    const start = player.skipOp.start || 0
    const left = (start / duration) * 100
    const width = (player.skipOp.duration / duration) * 100
    return { left, width }
  }, [player.preferBangumiOped, player.skipOp, duration])

  const edMarker = useMemo(() => {
    if (
      player.preferBangumiOped === false ||
      !player.skipEd?.enabled ||
      !(player.skipEd.duration > 0) ||
      duration <= 0
    ) {
      return null
    }
    const dur = player.skipEd.duration
    const start =
      player.skipEd.start > 0
        ? player.skipEd.start
        : Math.max(0, duration - dur)
    const left = (start / duration) * 100
    const width = (dur / duration) * 100
    return { left, width }
  }, [player.preferBangumiOped, player.skipEd, duration])

  const isHoverInOp =
    hoverRatio !== null &&
    opMarker !== null &&
    hoverRatio * 100 >= opMarker.left &&
    hoverRatio * 100 <= opMarker.left + opMarker.width

  const isHoverInEd =
    hoverRatio !== null &&
    edMarker !== null &&
    hoverRatio * 100 >= edMarker.left &&
    hoverRatio * 100 <= edMarker.left + edMarker.width

  const pinBar =
    showBar ||
    paused ||
    panelOpen ||
    srMenuOpen ||
    speedMenuOpen ||
    settingsMenuOpen ||
    opedDrawerOpen
  const vol = player.volume ?? 0.7
  const isMuted = vol <= 0.001

  const releaseSliderFocus = (e: PointerEvent<HTMLInputElement>) => {
    e.currentTarget.blur()
  }

  const isDraggingRef = useRef(false)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const seekWrapRef = useRef<HTMLDivElement>(null)

  const calcSeekRatio = (clientX: number) => {
    const el = seekWrapRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const handleSeekPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const ratio = calcSeekRatio(e.clientX)
    setDragRatio(ratio)
    setHoverRatio(ratio)
  }

  const handleSeekPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const ratio = calcSeekRatio(e.clientX)
    setHoverRatio(ratio)
    if (isDraggingRef.current) {
      setDragRatio(ratio)
    }
  }

  const handleSeekPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        /* ignore */
      }
      const ratio = calcSeekRatio(e.clientX)
      setDragRatio(null)
      onSeekRatio(ratio)

      const el = seekWrapRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const isInside =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        if (!isInside) {
          setHoverRatio(null)
        }
      } else {
        setHoverRatio(null)
      }
    }
  }

  const handleSeekPointerLeave = () => {
    if (!isDraggingRef.current) {
      setHoverRatio(null)
    }
  }

  const effectiveProgress = dragRatio !== null ? dragRatio * 100 : progress

  return (
    <div
      className={`kz-bar ${pinBar ? 'kz-bar--show' : ''}`}
      onMouseDown={(e) => e.stopPropagation()}
      data-player-chrome
    >
      <div
        ref={seekWrapRef}
        className="kz-seek-wrap"
        onPointerDown={handleSeekPointerDown}
        onPointerMove={handleSeekPointerMove}
        onPointerUp={handleSeekPointerUp}
        onPointerCancel={handleSeekPointerUp}
        onPointerLeave={handleSeekPointerLeave}
      >
        {/* Danmaku Heatmap Wave */}
        {heatmapPath && (
          <svg
            className="kz-seek-heatmap"
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="kz-heatmap-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(56, 189, 248, 0.45)" />
                <stop offset="100%" stopColor="rgba(56, 189, 248, 0.02)" />
              </linearGradient>
            </defs>
            <path d={heatmapPath} fill="url(#kz-heatmap-grad)" />
          </svg>
        )}

        {/* OP/ED Chapter Markers */}
        {opMarker && (
          <div
            className="kz-seek-marker"
            style={{
              left: `${opMarker.left}%`,
              width: `${opMarker.width}%`,
            }}
            title="片头曲 (OP)"
          />
        )}
        {edMarker && (
          <div
            className="kz-seek-marker"
            style={{
              left: `${edMarker.left}%`,
              width: `${edMarker.width}%`,
            }}
            title="片尾曲 (ED)"
          />
        )}

        {/* Hover Tooltip Card */}
        {hoverRatio !== null && duration > 0 && (
          <div
            className="kz-seek-tooltip"
            style={{ left: `${hoverRatio * 100}%` }}
          >
            <span className="kz-seek-tooltip-time">
              {formatTime(hoverRatio * duration)}
            </span>
            {isHoverInOp && (
              <span className="kz-seek-tooltip-tag">片头曲 (OP)</span>
            )}
            {isHoverInEd && (
              <span className="kz-seek-tooltip-tag">片尾曲 (ED)</span>
            )}
          </div>
        )}

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
      </div>

      <div className="kz-bar-row">
        <div className="kz-bar-left">
          <button
            type="button"
            className="kz-ctrl kz-ctrl-icon"
            onClick={onTogglePlay}
            title={paused ? '播放 (Space)' : '暂停 (Space)'}
            aria-label={paused ? '播放' : '暂停'}
          >
            {paused ? <IconPlay /> : <IconPause />}
          </button>
          <button
            type="button"
            className="kz-ctrl kz-ctrl-icon"
            onClick={() => onPrev?.()}
            title="上一集 (P)"
            aria-label="上一集"
          >
            <IconPrev />
          </button>
          <button
            type="button"
            className="kz-ctrl kz-ctrl-icon"
            onClick={() => onNext?.()}
            title="下一集 (N)"
            aria-label="下一集"
          >
            <IconNext />
          </button>
          <span className="kz-time">
            {formatTime(current)} / {formatTime(duration)}
          </span>
        </div>
        <div className="kz-bar-right">
          {/* Danmaku 3-state toggle (On -> Simplify -> Off -> On) */}
          <button
            type="button"
            className="kz-ctrl kz-ctrl-icon"
            data-active={danmakuEnabled}
            data-state={!danmakuEnabled ? 'off' : danmakuSimplify ? 'simplify' : 'on'}
            onClick={() => onToggleDanmaku?.()}
            title={
              !danmakuEnabled
                ? '开启弹幕 (D)'
                : danmakuSimplify
                  ? '关闭弹幕 (当前精简) (D)'
                  : '切换弹幕精简 (当前开启) (D)'
            }
            aria-label={
              !danmakuEnabled
                ? '开启弹幕'
                : danmakuSimplify
                  ? '关闭弹幕'
                  : '精简弹幕'
            }
          >
            {!danmakuEnabled ? (
              <IconDanmakuOff />
            ) : danmakuSimplify ? (
              <IconDanmakuSimplify />
            ) : (
              <IconDanmakuOn />
            )}
          </button>

          {/* Danmaku Settings Panel trigger */}
          {hasDanmakuPanel && (
            <div className="kz-speed-wrap kz-danmaku-wrap">
              <button
                type="button"
                className="kz-ctrl kz-ctrl-icon"
                data-active={panelOpen}
                onClick={onTogglePanel}
                title="弹幕设置与搜索 (Alt+M)"
                aria-label="弹幕设置"
              >
                <IconDanmakuSettings />
              </button>
              {panelOpen && danmakuPanelNode}
            </div>
          )}

          {/* Quick Speed Menu */}
          <div className="kz-speed-wrap">
            <button
              type="button"
              className="kz-ctrl"
              onClick={onToggleSpeedMenu}
              title="播放倍速"
            >
              {player.speed || 1}x
            </button>
            {speedMenuOpen && (
              <div className="kz-speed-menu">
                {[...speedOptions].reverse().map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-active={Math.abs((player.speed || 1) - s) < 0.01}
                    onClick={() => onPickSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Super Resolution Menu */}
          <div className="kz-speed-wrap kz-sr-wrap">
            <button
              type="button"
              className="kz-ctrl"
              data-active={srMode !== 'off'}
              onClick={onToggleSrMenu}
              title={srTitle(webGpuOk, srMode, srActive, srLabels)}
            >
              {srMode === 'off'
                ? '超分'
                : `${srLabels[srMode]}${srActive ? '' : '…'}`}
            </button>
            {srMenuOpen && (
              <div className="kz-speed-menu">
                {webGpuOk === false && (
                  <div
                    className="px-2 py-1.5 text-[11px] leading-snug text-amber-200/90"
                    style={{ maxWidth: '12rem' }}
                  >
                    {typeof window !== 'undefined' && !window.isSecureContext
                      ? 'WebGPU 需 HTTPS 或 localhost；用局域网 IP 的 HTTP 访问时不可用'
                      : '当前环境无 WebGPU，选档会提示失败'}
                  </div>
                )}
                {(['off', 'efficiency', 'quality'] as SuperResolutionMode[]).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      data-active={srMode === m}
                      onClick={() => onPickSr(m)}
                    >
                      {srLabels[m]}
                      {m === srMode && srActive && m !== 'off' ? ' ✓' : ''}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* OP/ED Marker Assistant */}
          {hasOpedDrawer && (
            <div className="kz-speed-wrap kz-oped-wrap">
              <button
                type="button"
                className="kz-ctrl kz-ctrl-icon"
                data-active={opedDrawerOpen}
                onClick={onToggleOpedDrawer}
                title="OP/ED 标记助手"
                aria-label="OP/ED 标记助手"
              >
                <IconOpedMarker />
              </button>
              {opedDrawerOpen && opedDrawerNode}
            </div>
          )}

          {/* Unified Player Settings Menu */}
          <div className="kz-speed-wrap">
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon"
              data-active={settingsMenuOpen}
              onClick={onToggleSettingsMenu}
              title="播放器设置"
              aria-label="播放器设置"
            >
              <IconSettings />
            </button>
            {settingsMenuOpen && (
              <div className="kz-settings-popover">
                {settingsSubmenu === 'root' && (
                  <div>
                    <button
                      type="button"
                      className="kz-settings-item"
                      onClick={() => setSettingsSubmenu('speed')}
                    >
                      <span>⚡ 播放倍速</span>
                      <span className="kz-settings-item-val">
                        {player.speed || 1}x
                        <IconChevronRight />
                      </span>
                    </button>

                    <button
                      type="button"
                      className="kz-settings-item"
                      onClick={() => setSettingsSubmenu('sr')}
                    >
                      <span>✨ 超分增强 (Anime4K)</span>
                      <span className="kz-settings-item-val">
                        {srLabels[srMode]}
                        <IconChevronRight />
                      </span>
                    </button>

                    <button
                      type="button"
                      className="kz-settings-item"
                      onClick={() => setSettingsSubmenu('aspectRatio')}
                    >
                      <span>📐 画面比例 (W)</span>
                      <span className="kz-settings-item-val">
                        {ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio)
                          ?.label.split(' ')[0] ?? '默认'}
                        <IconChevronRight />
                      </span>
                    </button>

                    <button
                      type="button"
                      className="kz-settings-item"
                      onClick={() => onToggleOpedSkip?.()}
                    >
                      <span>⏭️ 跳过片头片尾</span>
                      <div
                        className="kz-switch"
                        data-checked={player.preferBangumiOped !== false}
                      >
                        <div className="kz-switch-thumb" />
                      </div>
                    </button>

                    {onToggleWidescreen && (
                      <button
                        type="button"
                        className="kz-settings-item"
                        onClick={() => onToggleWidescreen?.()}
                      >
                        <span>🖥️ 宽屏模式</span>
                        <div
                          className="kz-switch"
                          data-checked={widescreen}
                        >
                          <div className="kz-switch-thumb" />
                        </div>
                      </button>
                    )}

                    <button
                      type="button"
                      className="kz-settings-item"
                      onClick={() => onToggleAutoNext?.()}
                    >
                      <span>🔁 自动连播下一话</span>
                      <div
                        className="kz-switch"
                        data-checked={player.autoNext !== false}
                      >
                        <div className="kz-switch-thumb" />
                      </div>
                    </button>

                    {hasOpedDrawer && (
                      <button
                        type="button"
                        className="kz-settings-item"
                        onClick={() => {
                          onToggleOpedDrawer?.()
                        }}
                      >
                        <span>⏱️ OP/ED 标记助手</span>
                        <span className="kz-settings-item-val">
                          <IconChevronRight />
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="kz-settings-item"
                      onClick={() => setSettingsSubmenu('shortcuts')}
                    >
                      <span>⌨️ 快捷键指南</span>
                      <span className="kz-settings-item-val">
                        <IconChevronRight />
                      </span>
                    </button>
                  </div>
                )}

                {settingsSubmenu === 'speed' && (
                  <div>
                    <div className="kz-settings-header">
                      <button
                        type="button"
                        className="kz-settings-back-btn"
                        onClick={() => setSettingsSubmenu('root')}
                      >
                        <IconChevronLeft />
                      </button>
                      <span>播放倍速</span>
                    </div>
                    {[...speedOptions].reverse().map((s) => {
                      const active =
                        Math.abs((player.speed || 1) - s) < 0.01
                      return (
                        <button
                          key={s}
                          type="button"
                          className="kz-settings-item"
                          data-active={active}
                          onClick={() => {
                            onPickSpeed(s)
                            setSettingsSubmenu('root')
                          }}
                        >
                          <span>{s}x</span>
                          {active && <IconCheck />}
                        </button>
                      )
                    })}
                  </div>
                )}

                {settingsSubmenu === 'sr' && (
                  <div>
                    <div className="kz-settings-header">
                      <button
                        type="button"
                        className="kz-settings-back-btn"
                        onClick={() => setSettingsSubmenu('root')}
                      >
                        <IconChevronLeft />
                      </button>
                      <span>超分增强 (Anime4K WebGPU)</span>
                    </div>
                    {(['off', 'efficiency', 'quality'] as SuperResolutionMode[]).map(
                      (m) => {
                        const active = srMode === m
                        return (
                          <button
                            key={m}
                            type="button"
                            className="kz-settings-item"
                            data-active={active}
                            onClick={() => {
                              onPickSr(m)
                              setSettingsSubmenu('root')
                            }}
                          >
                            <span>{srLabels[m]}</span>
                            {active && <IconCheck />}
                          </button>
                        )
                      },
                    )}
                  </div>
                )}

                {settingsSubmenu === 'aspectRatio' && (
                  <div>
                    <div className="kz-settings-header">
                      <button
                        type="button"
                        className="kz-settings-back-btn"
                        onClick={() => setSettingsSubmenu('root')}
                      >
                        <IconChevronLeft />
                      </button>
                      <span>画面比例</span>
                    </div>
                    {ASPECT_RATIO_OPTIONS.map((opt) => {
                      const active = aspectRatio === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className="kz-settings-item"
                          data-active={active}
                          onClick={() => {
                            onAspectRatioChange?.(opt.value)
                            setSettingsSubmenu('root')
                          }}
                        >
                          <span>{opt.label}</span>
                          {active && <IconCheck />}
                        </button>
                      )
                    })}
                  </div>
                )}

                {settingsSubmenu === 'shortcuts' && (
                  <div>
                    <div className="kz-settings-header">
                      <button
                        type="button"
                        className="kz-settings-back-btn"
                        onClick={() => setSettingsSubmenu('root')}
                      >
                        <IconChevronLeft />
                      </button>
                      <span>快捷键指南</span>
                    </div>
                    <div className="space-y-1 py-1 max-h-56 overflow-y-auto">
                      <div className="kz-settings-shortcut-row">
                        <span>播放 / 暂停</span>
                        <span className="kz-settings-shortcut-kbd">Space / K</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>快退 5 秒 / 快进 5 秒</span>
                        <span className="kz-settings-shortcut-kbd">← / →</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>音量增加 / 减小</span>
                        <span className="kz-settings-shortcut-kbd">↑ / ↓</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>全屏 / 退出全屏</span>
                        <span className="kz-settings-shortcut-kbd">F</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>网页全屏</span>
                        <span className="kz-settings-shortcut-kbd">Shift + W</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>切换画面比例</span>
                        <span className="kz-settings-shortcut-kbd">W</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>弹幕开启 / 关闭</span>
                        <span className="kz-settings-shortcut-kbd">D</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>上一集 / 下一集</span>
                        <span className="kz-settings-shortcut-kbd">P / N</span>
                      </div>
                      <div className="kz-settings-shortcut-row">
                        <span>弹幕设置面板</span>
                        <span className="kz-settings-shortcut-kbd">Alt + M</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Volume Control */}
          <div className="kz-vol-wrap">
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon kz-vol-btn"
              data-active={isMuted}
              onClick={onToggleMute}
              title={isMuted ? '取消静音' : '静音'}
              aria-label={isMuted ? '取消静音' : '静音'}
              aria-pressed={isMuted}
            >
              {isMuted ? <IconVolumeMute /> : <IconVolume />}
            </button>
            <div className="kz-vol-slider">
              <div className="kz-vol-rail" aria-hidden>
                <div
                  className="kz-vol-fill"
                  style={{
                    width: `${Math.round(vol * 100)}%`,
                  }}
                />
              </div>
              <input
                type="range"
                className="kz-vol"
                min={0}
                max={100}
                value={Math.round(vol * 100)}
                onChange={(e) => onVolume(Number(e.target.value) / 100)}
                onPointerUp={releaseSliderFocus}
                aria-label="音量"
              />
            </div>
          </div>

          {/* Wide Screen / Theater Mode (Bilibili-style) */}
          {onToggleWidescreen && (
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon kz-ctrl-widescreen"
              data-active={widescreen}
              onClick={(e) => {
                e.currentTarget.blur()
                onToggleWidescreen()
              }}
              title={widescreen ? '退出宽屏模式' : '宽屏模式'}
              aria-label={widescreen ? '退出宽屏模式' : '宽屏模式'}
            >
              {widescreen ? <IconWidescreenExit /> : <IconWidescreen />}
            </button>
          )}

          {/* Web Fullscreen */}
          <button
            type="button"
            className="kz-ctrl kz-ctrl-icon kz-ctrl-web-fs"
            data-active={webFs}
            onClick={onToggleWebFs}
            title={webFs ? '退出网页全屏 (Shift+W)' : '网页全屏 (Shift+W)'}
            aria-label={webFs ? '退出网页全屏' : '网页全屏'}
          >
            {webFs ? <IconWebFsExit /> : <IconWebFs />}
          </button>

          {/* Player Fullscreen */}
          <button
            type="button"
            className="kz-ctrl kz-ctrl-icon kz-ctrl-fs"
            data-active={playerFs}
            onClick={onTogglePlayerFs}
            title={playerFs ? '退出全屏 (F)' : '全屏 (F)'}
            aria-label={playerFs ? '退出全屏' : '全屏'}
          >
            {playerFs ? <IconFullscreenExit /> : <IconFullscreen />}
          </button>
        </div>
      </div>
    </div>
  )
}
