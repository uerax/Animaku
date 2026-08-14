import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type SyntheticEvent,
} from 'react'
import type { DanmakuComment, SuperResolutionMode } from '@animaku/shared'
import type { AspectRatioMode, PlayerControlsProps } from './types'
import {
  IconBack,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDanmaku,
  IconFullscreen,
  IconFullscreenExit,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconSettings,
  IconVolume,
  IconVolumeMute,
  IconWebFs,
  IconWebFsExit,
} from './icons'

type PopupPos = { left: number }

const ASPECT_RATIO_OPTIONS: {
  value: AspectRatioMode
  label: string
  mobileLabel: string
}[] = [
  { value: 'contain', label: '默认比例 (16:9)', mobileLabel: '默认 (16:9)' },
  { value: 'cover', label: '画面铺满 (Cover)', mobileLabel: '铺满 (Cover)' },
  { value: 'fill', label: '100% 拉伸 (Fill)', mobileLabel: '拉伸 (Fill)' },
  { value: '4:3', label: '画幅 4:3', mobileLabel: '4:3 比例' },
]

/**
 * Place popup relative to the control bar (position:absolute on .kz-bar).
 */
function placeInBar(
  bar: HTMLElement | null,
  btn: HTMLElement | null,
): PopupPos | null {
  if (!bar || !btn) return null
  const br = bar.getBoundingClientRect()
  const r = btn.getBoundingClientRect()
  return {
    left: r.left - br.left + r.width / 2,
  }
}

function barPopupStyle(pos: PopupPos): CSSProperties {
  return {
    position: 'absolute',
    left: pos.left,
    transform: 'translateX(-50%)',
  }
}

/**
 * Compute SVG danmaku density curve path across seekbar.
 */
function computeDanmakuHeatmap(
  comments: DanmakuComment[] | undefined,
  duration: number,
  numBuckets = 50,
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

  const smoothed = buckets.map((val, i) => {
    const prev = buckets[i - 1] ?? val
    const next = buckets[i + 1] ?? val
    return (prev + val * 2 + next) / 4
  })
  const smoothedMax = Math.max(...smoothed) || 1

  const height = 20
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
 * Mobile / touch control bar + Unified Settings.
 */
export function MobileControls(props: PlayerControlsProps) {
  const {
    title,
    showBar,
    paused,
    panelOpen,
    speedMenuOpen,
    srMenuOpen,
    settingsMenuOpen,
    volumeMenuOpen,
    current,
    duration,
    progress,
    comments,
    danmakuEnabled,
    hasDanmakuPanel,
    player,
    srMode,
    srActive,
    webGpuOk,
    playerFs,
    webFs,
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
    onToggleVolumeMenu,
    onPickSpeed,
    onPickSr,
    onAspectRatioChange,
    onToggleAutoNext,
    onToggleOpedSkip,
    onVolume,
    onTogglePlayerFs,
    onToggleWebFs,
    formatTime,
    speedOptions,
    srLabels,
  } = props

  const isFs = webFs || playerFs
  const exitFs = webFs ? onToggleWebFs : onTogglePlayerFs

  const [settingsSubmenu, setSettingsSubmenu] = useState<
    'root' | 'speed' | 'sr' | 'aspectRatio' | 'shortcuts'
  >('root')

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

  const pinBar =
    showBar ||
    paused ||
    panelOpen ||
    srMenuOpen ||
    volumeMenuOpen ||
    settingsMenuOpen

  const vol = player.volume ?? 0.7
  const volPct = Math.round(Math.min(1, Math.max(0, vol)) * 100)

  const barRef = useRef<HTMLDivElement>(null)

  const releaseSliderFocus = (e: PointerEvent<HTMLInputElement>) => {
    e.currentTarget.blur()
  }
  const srBtnRef = useRef<HTMLButtonElement>(null)
  const volBtnRef = useRef<HTMLButtonElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  const [srPos, setSrPos] = useState<PopupPos | null>(null)
  const [volPos, setVolPos] = useState<PopupPos | null>(null)
  const [settingsPos, setSettingsPos] = useState<PopupPos | null>(null)

  useLayoutEffect(() => {
    if (!srMenuOpen) setSrPos(null)
    else setSrPos(placeInBar(barRef.current, srBtnRef.current))
  }, [srMenuOpen, showBar, pinBar])

  useLayoutEffect(() => {
    if (!volumeMenuOpen) setVolPos(null)
    else setVolPos(placeInBar(barRef.current, volBtnRef.current))
  }, [volumeMenuOpen, showBar, pinBar])

  useLayoutEffect(() => {
    if (!settingsMenuOpen) {
      setSettingsPos(null)
      setSettingsSubmenu('root')
    } else {
      setSettingsPos(placeInBar(barRef.current, settingsBtnRef.current))
    }
  }, [settingsMenuOpen, showBar, pinBar])

  const stop = (e: SyntheticEvent) => e.stopPropagation()

  const anyMenuOpen = srMenuOpen || volumeMenuOpen || settingsMenuOpen

  const lastDismissAtRef = useRef(0)

  const dismissMenus = (e: SyntheticEvent) => {
    e.stopPropagation()
    lastDismissAtRef.current = Date.now()
    if (srMenuOpen) onToggleSrMenu()
    if (volumeMenuOpen) onToggleVolumeMenu()
    if (settingsMenuOpen) onToggleSettingsMenu?.()
  }

  const safeToggleSr = (e: SyntheticEvent) => {
    e.stopPropagation()
    if (Date.now() - lastDismissAtRef.current < 300) return
    onToggleSrMenu()
  }

  const safeToggleVolume = (e: SyntheticEvent) => {
    e.stopPropagation()
    if (Date.now() - lastDismissAtRef.current < 300) return
    onToggleVolumeMenu()
  }

  const safeToggleSettings = (e: SyntheticEvent) => {
    e.stopPropagation()
    if (Date.now() - lastDismissAtRef.current < 300) return
    onToggleSettingsMenu?.()
  }

  return (
    <>
      {anyMenuOpen && (
        <div
          className="kz-player-backdrop"
          onClick={dismissMenus}
          onPointerDown={stop}
          onTouchStart={stop}
        />
      )}
      {isFs && (
        <div
          className={`kz-mobile-top-bar ${pinBar ? 'kz-mobile-top-bar--show' : ''}`}
          onMouseDown={stop}
          onClick={stop}
          data-player-chrome
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon text-white/90 hover:text-white"
              onClick={(e) => {
                e.stopPropagation()
                exitFs()
              }}
              title="退出全屏"
              aria-label="退出全屏"
            >
              <IconBack />
            </button>
            {title && (
              <span className="kz-mobile-top-title truncate text-xs font-medium text-white/90">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon text-white/80 hover:text-white"
              onClick={safeToggleSettings}
              title="播放器设置"
              aria-label="播放器设置"
            >
              <IconSettings />
            </button>
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon text-white/70 hover:text-white"
              onClick={(e) => {
                e.stopPropagation()
                exitFs()
              }}
              title="退出全屏"
              aria-label="退出全屏"
            >
              <IconFullscreenExit />
            </button>
          </div>
        </div>
      )}
      <div
        ref={barRef}
        className={`kz-bar ${pinBar ? 'kz-bar--show' : ''}`}
        onMouseDown={stop}
        data-player-chrome
      >
        <div className="kz-seek-wrap">
          {/* Danmaku Heatmap Wave */}
          {heatmapPath && (
            <svg
              className="kz-seek-heatmap"
              viewBox="0 0 100 20"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="kz-heatmap-grad-m" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(56, 189, 248, 0.45)" />
                  <stop offset="100%" stopColor="rgba(56, 189, 248, 0.02)" />
                </linearGradient>
              </defs>
              <path d={heatmapPath} fill="url(#kz-heatmap-grad-m)" />
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

          <input
            type="range"
            className="kz-seek"
            min={0}
            max={1000}
            value={Math.round(progress * 10)}
            onChange={(e) => onSeekRatio(Number(e.target.value) / 1000)}
            onPointerUp={releaseSliderFocus}
            style={{ ['--kz-progress' as string]: `${progress}%` }}
            aria-label="进度"
          />
        </div>
        <div className="kz-bar-row">
          <div className="kz-bar-left">
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon"
              onClick={onTogglePlay}
              title={paused ? '播放' : '暂停'}
              aria-label={paused ? '播放' : '暂停'}
            >
              {paused ? <IconPlay /> : <IconPause />}
            </button>
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon"
              onClick={() => onPrev?.()}
              title="上一集"
              aria-label="上一集"
            >
              <IconPrev />
            </button>
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon"
              onClick={() => onNext?.()}
              title="下一集"
              aria-label="下一集"
            >
              <IconNext />
            </button>
            <span className="kz-time">
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>
          <div className="kz-bar-right">
            <button
              type="button"
              className="kz-ctrl"
              data-active={danmakuEnabled}
              onClick={() => onToggleDanmaku?.()}
              title="弹幕开关"
              aria-label="弹幕开关"
            >
              {danmakuEnabled ? '弹' : '关'}
            </button>
            {hasDanmakuPanel && (
              <button
                type="button"
                className="kz-ctrl kz-ctrl-icon"
                data-active={panelOpen}
                onClick={onTogglePanel}
                title="弹幕设置与搜索"
                aria-label="弹幕设置"
              >
                <IconDanmaku />
              </button>
            )}

            <div className="kz-speed-wrap kz-sr-wrap">
              <button
                ref={srBtnRef}
                type="button"
                className="kz-ctrl"
                data-active={srMode !== 'off' || srMenuOpen}
                onClick={safeToggleSr}
                title={
                  webGpuOk === false
                    ? '当前浏览器不支持 WebGPU 超分'
                    : srMode === 'off'
                      ? '超分'
                      : `超分：${srLabels[srMode]}`
                }
                aria-expanded={srMenuOpen}
              >
                {srMode === 'off'
                  ? '超分'
                  : `${srLabels[srMode]}${srActive ? '' : '…'}`}
              </button>
            </div>

            <div className="kz-vol-popup-wrap">
              <button
                ref={volBtnRef}
                type="button"
                className="kz-ctrl kz-ctrl-icon"
                data-active={volumeMenuOpen || volPct === 0}
                onClick={safeToggleVolume}
                title="音量"
                aria-label="音量"
                aria-expanded={volumeMenuOpen}
              >
                {volPct === 0 ? <IconVolumeMute /> : <IconVolume />}
              </button>
            </div>

            {/* Unified Settings Gear button on mobile */}
            <div className="kz-speed-wrap">
              <button
                ref={settingsBtnRef}
                type="button"
                className="kz-ctrl kz-ctrl-icon"
                data-active={settingsMenuOpen}
                onClick={safeToggleSettings}
                title="播放器设置"
                aria-label="播放器设置"
                aria-expanded={settingsMenuOpen}
              >
                <IconSettings />
              </button>
            </div>

            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon kz-ctrl-web-fs"
              data-active={webFs}
              onClick={onToggleWebFs}
              title={webFs ? '退出网页全屏' : '网页全屏'}
              aria-label={webFs ? '退出网页全屏' : '网页全屏'}
            >
              {webFs ? <IconWebFsExit /> : <IconWebFs />}
            </button>
            <button
              type="button"
              className="kz-ctrl kz-ctrl-icon kz-ctrl-fs"
              data-active={playerFs}
              onClick={onTogglePlayerFs}
              title={playerFs ? '退出全屏' : '全屏'}
              aria-label={playerFs ? '退出全屏' : '全屏'}
            >
              {playerFs ? <IconFullscreenExit /> : <IconFullscreen />}
            </button>
          </div>
        </div>

        {/* Absolute menus on .kz-bar — outside .kz-bar-row overflow clip */}
        {srMenuOpen && srPos && (
          <div
            className="kz-speed-menu kz-mobile-bar-menu"
            data-player-chrome
            style={barPopupStyle(srPos)}
            onMouseDown={stop}
            onClick={stop}
            onPointerDown={stop}
          >
            {webGpuOk === false && (
              <div
                className="px-2 py-1.5 text-[11px] leading-snug text-amber-200/90"
                style={{ maxWidth: '12rem' }}
              >
                {typeof window !== 'undefined' && !window.isSecureContext
                  ? 'WebGPU 需 HTTPS 或 localhost'
                  : '当前环境无 WebGPU'}
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

        {volumeMenuOpen && volPos && (
          <div
            className="kz-vol-popup kz-mobile-bar-menu"
            data-player-chrome
            style={barPopupStyle(volPos)}
            onMouseDown={stop}
            onClick={stop}
            onPointerDown={stop}
          >
            <span className="kz-vol-popup-label tabular-nums">{volPct}</span>
            <div className="kz-vol-popup-slider">
              <div className="kz-vol-popup-rail" aria-hidden>
                <div
                  className="kz-vol-popup-fill"
                  style={{ height: `${volPct}%` }}
                />
              </div>
              <input
                type="range"
                className="kz-vol-popup-range"
                min={0}
                max={100}
                value={volPct}
                onChange={(e) => onVolume(Number(e.target.value) / 100)}
                onPointerUp={releaseSliderFocus}
                aria-label="音量"
              />
            </div>
          </div>
        )}

        {/* Mobile Settings Popover */}
        {settingsMenuOpen && (
          <div
            className="kz-settings-popover kz-settings-popover--mobile kz-mobile-bar-menu"
            data-player-chrome
            style={
              settingsPos
                ? barPopupStyle(settingsPos)
                : {
                    position: 'absolute',
                    bottom: 'calc(var(--kz-ctrl-h, 32px) + 0.35rem + 2px)',
                    right: '0.5rem',
                  }
            }
            onMouseDown={stop}
            onClick={stop}
            onPointerDown={stop}
          >
            {settingsSubmenu === 'root' && (
              <div>
                <button
                  type="button"
                  className="kz-settings-item"
                  onClick={() => setSettingsSubmenu('speed')}
                >
                  <span>⚡ 倍速</span>
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
                  <span>✨ 超分</span>
                  <span className="kz-settings-item-val">
                    {srMode === 'off' ? '关' : srMode === 'efficiency' ? 'Mode A' : 'Mode B'}
                    <IconChevronRight />
                  </span>
                </button>

                <button
                  type="button"
                  className="kz-settings-item"
                  onClick={() => setSettingsSubmenu('aspectRatio')}
                >
                  <span>📐 比例</span>
                  <span className="kz-settings-item-val">
                    {aspectRatio === 'contain'
                      ? '默认'
                      : aspectRatio === 'cover'
                        ? '铺满'
                        : aspectRatio === 'fill'
                          ? '拉伸'
                          : '4:3'}
                    <IconChevronRight />
                  </span>
                </button>

                <button
                  type="button"
                  className="kz-settings-item"
                  onClick={() => onToggleOpedSkip?.()}
                >
                  <span>⏭️ 跳过OP/ED</span>
                  <div
                    className="kz-switch"
                    data-checked={player.preferBangumiOped !== false}
                  >
                    <div className="kz-switch-thumb" />
                  </div>
                </button>

                <button
                  type="button"
                  className="kz-settings-item"
                  onClick={() => onToggleAutoNext?.()}
                >
                  <span>🔁 自动连播</span>
                  <div
                    className="kz-switch"
                    data-checked={player.autoNext !== false}
                  >
                    <div className="kz-switch-thumb" />
                  </div>
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
                  <span>倍速设置</span>
                </div>
                {[...speedOptions].reverse().map((s) => {
                  const active = Math.abs((player.speed || 1) - s) < 0.01
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
                  <span>超分设置</span>
                </div>
                {(['off', 'efficiency', 'quality'] as SuperResolutionMode[]).map(
                  (m) => {
                    const active = srMode === m
                    const label =
                      m === 'off'
                        ? '关闭'
                        : m === 'efficiency'
                          ? 'Mode A (轻)'
                          : 'Mode B (高)'
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
                        <span>{label}</span>
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
                      <span>{opt.mobileLabel}</span>
                      {active && <IconCheck />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
