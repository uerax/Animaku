import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SuperResolutionMode } from '@animaku/shared'
import type { AspectRatioMode } from './types'
import {
  IconAspectRatio,
  IconCamera,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconFullscreen,
  IconLink,
  IconLoop,
  IconMirror,
  IconPip,
  IconSparkles,
  IconSpeed,
  IconStats,
  IconWebFs,
  IconWidescreen,
} from './icons'

export interface PlayerContextMenuProps {
  x: number
  y: number
  visible: boolean
  onClose: () => void
  statsOpen: boolean
  onToggleStats: () => void
  mirror: boolean
  onToggleMirror: () => void
  loop: boolean
  onToggleLoop: () => void
  aspectRatio: AspectRatioMode
  onAspectRatioChange: (mode: AspectRatioMode) => void
  speed: number
  onPickSpeed: (speed: number) => void
  speedOptions: readonly number[]
  srMode: SuperResolutionMode
  srActive: boolean
  webGpuOk: boolean | null
  onPickSr: (mode: SuperResolutionMode) => void
  srLabels: Record<SuperResolutionMode, string>
  widescreen?: boolean
  onToggleWidescreen?: () => void
  playerFs: boolean
  onTogglePlayerFs: () => void
  webFs: boolean
  onToggleWebFs: () => void
  pipActive: boolean
  pipSupported: boolean
  onTogglePip: () => void
  onCaptureFrame: () => void
  onCopyCurrentTimeUrl: () => void
  onCopyVideoUrl: () => void
  onCopyDebugStats: () => void
  videoWidth?: number
  videoHeight?: number
  bandwidthEstimateBps?: number
}

const ASPECT_RATIO_OPTIONS: { value: AspectRatioMode; label: string }[] = [
  { value: 'contain', label: '默认比例 (16:9)' },
  { value: 'cover', label: '画面铺满 (Cover)' },
  { value: 'fill', label: '100% 拉伸 (Fill)' },
  { value: '4:3', label: '画幅 4:3' },
]

function formatSpeedBadge(bps?: number): string {
  if (!bps || bps <= 0) return '0 KB/s'
  const mbps = bps / 1_000_000
  if (mbps >= 1) {
    const mBps = bps / 8 / 1024 / 1024
    return `${mBps.toFixed(1)} MB/s`
  }
  const kBps = bps / 8 / 1024
  return `${kBps.toFixed(0)} KB/s`
}

export function PlayerContextMenu({
  x,
  y,
  visible,
  onClose,
  statsOpen,
  onToggleStats,
  mirror,
  onToggleMirror,
  loop,
  onToggleLoop,
  aspectRatio,
  onAspectRatioChange,
  speed,
  onPickSpeed,
  speedOptions,
  srMode,
  srActive,
  webGpuOk,
  onPickSr,
  srLabels,
  widescreen = false,
  onToggleWidescreen,
  playerFs,
  onTogglePlayerFs,
  webFs,
  onToggleWebFs,
  pipActive,
  pipSupported,
  onTogglePip,
  onCaptureFrame,
  onCopyCurrentTimeUrl,
  onCopyVideoUrl,
  onCopyDebugStats,
  videoWidth = 0,
  videoHeight = 0,
  bandwidthEstimateBps = 0,
}: PlayerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<
    'aspectRatio' | 'speed' | 'sr' | 'fullscreen' | null
  >(null)

  // Open submenu to the right when context menu is near left border, otherwise to left
  const submenuSide = x < 220 ? 'right' : 'left'

  // Close when clicking anywhere outside
  useEffect(() => {
    if (!visible) return

    const handleWindowClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('mousedown', handleWindowClick, true)
    window.addEventListener('keydown', handleWindowKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', handleWindowClick, true)
      window.removeEventListener('keydown', handleWindowKeyDown, true)
    }
  }, [visible, onClose])

  if (!visible) return null

  const resolutionLabel =
    videoWidth > 0 && videoHeight > 0
      ? `${videoWidth}×${videoHeight}`
      : '自动分辨率'

  return (
    <div
      ref={menuRef}
      className="kz-context-menu absolute z-[90] min-w-[14.5rem] select-none rounded-xl border border-[rgba(255,255,255,0.18)] bg-[rgba(15,23,42,0.94)] p-1.5 text-xs text-white shadow-2xl backdrop-blur-2xl"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      data-player-chrome="true"
    >
      {/* Quick Status Header Card */}
      <div
        className="mb-1.5 flex items-center justify-between rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/10 cursor-pointer"
        onClick={() => {
          onToggleStats()
          onClose()
        }}
        title="点击切换视频详细统计信息"
      >
        <div className="flex items-center gap-1.5 truncate">
          <IconStats />
          <span className="font-semibold text-sky-400 truncate">
            {resolutionLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10.5px] text-emerald-400 font-mono">
          <span>{formatSpeedBadge(bandwidthEstimateBps)}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              statsOpen ? 'bg-sky-400 ring-2 ring-sky-400/40' : 'bg-slate-400'
            }`}
          />
        </div>
      </div>

      {/* Menu Action Items */}
      <div className="flex flex-col gap-0.5">
        {/* Toggle Stats for Nerds */}
        <MenuItem
          icon={<IconStats />}
          label="视频统计信息"
          active={statsOpen}
          onClick={() => {
            onToggleStats()
            onClose()
          }}
        />

        {/* Screenshot */}
        <MenuItem
          icon={<IconCamera />}
          label="视频截图"
          shortcut="PNG"
          onClick={() => {
            onCaptureFrame()
            onClose()
          }}
        />

        {/* Mirror Flip */}
        <MenuItem
          icon={<IconMirror />}
          label="画面镜像翻转"
          active={mirror}
          onClick={() => {
            onToggleMirror()
            onClose()
          }}
        />

        {/* Loop Play */}
        <MenuItem
          icon={<IconLoop />}
          label="循环播放"
          active={loop}
          onClick={() => {
            onToggleLoop()
            onClose()
          }}
        />

        {/* Picture-in-Picture */}
        {pipSupported && (
          <MenuItem
            icon={<IconPip />}
            label="画中画"
            active={pipActive}
            onClick={() => {
              onTogglePip()
              onClose()
            }}
          />
        )}

        <MenuDivider />

        {/* Aspect Ratio Submenu */}
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('aspectRatio')}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <MenuItem
            icon={<IconAspectRatio />}
            label="画面比例"
            value={
              ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio)?.label ||
              aspectRatio
            }
            hasSubmenu
          />
          {activeSubmenu === 'aspectRatio' && (
            <SubmenuContainer side={submenuSide}>
              {ASPECT_RATIO_OPTIONS.map((opt) => (
                <SubmenuItem
                  key={opt.value}
                  label={opt.label}
                  selected={aspectRatio === opt.value}
                  onClick={() => {
                    onAspectRatioChange(opt.value)
                    onClose()
                  }}
                />
              ))}
            </SubmenuContainer>
          )}
        </div>

        {/* Speed Submenu */}
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('speed')}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <MenuItem
            icon={<IconSpeed />}
            label="播放速度"
            value={`${speed}x`}
            hasSubmenu
          />
          {activeSubmenu === 'speed' && (
            <SubmenuContainer side={submenuSide}>
              {speedOptions.map((s) => (
                <SubmenuItem
                  key={s}
                  label={`${s}x`}
                  selected={Math.abs(speed - s) < 0.01}
                  onClick={() => {
                    onPickSpeed(s)
                    onClose()
                  }}
                />
              ))}
            </SubmenuContainer>
          )}
        </div>

        {/* Super Resolution Submenu */}
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('sr')}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <MenuItem
            icon={<IconSparkles />}
            label="画质超分"
            value={
              webGpuOk === false
                ? '不可用'
                : srLabels[srMode] || (srMode === 'off' ? '关闭' : srMode)
            }
            active={srMode !== 'off' && srActive}
            hasSubmenu
          />
          {activeSubmenu === 'sr' && (
            <SubmenuContainer side={submenuSide}>
              <SubmenuItem
                label="关闭超分"
                selected={srMode === 'off'}
                onClick={() => {
                  onPickSr('off')
                  onClose()
                }}
              />
              <SubmenuItem
                label="效率档 (Anime4K)"
                selected={srMode === 'efficiency'}
                disabled={webGpuOk === false}
                onClick={() => {
                  onPickSr('efficiency')
                  onClose()
                }}
              />
              <SubmenuItem
                label="质量档 (Anime4K)"
                selected={srMode === 'quality'}
                disabled={webGpuOk === false}
                onClick={() => {
                  onPickSr('quality')
                  onClose()
                }}
              />
            </SubmenuContainer>
          )}
        </div>

        {/* Widescreen Toggle */}
        {onToggleWidescreen && (
          <MenuItem
            icon={<IconWidescreen />}
            label="宽屏模式 (剧场)"
            active={widescreen}
            onClick={() => {
              onToggleWidescreen()
              onClose()
            }}
          />
        )}

        {/* Fullscreen Submenu */}
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('fullscreen')}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <MenuItem
            icon={webFs ? <IconWebFs /> : <IconFullscreen />}
            label="全屏模式"
            value={playerFs ? '窗口全屏' : webFs ? '网页全屏' : '标准'}
            hasSubmenu
          />
          {activeSubmenu === 'fullscreen' && (
            <SubmenuContainer side={submenuSide}>
              <SubmenuItem
                label="网页全屏"
                selected={webFs}
                onClick={() => {
                  onToggleWebFs()
                  onClose()
                }}
              />
              <SubmenuItem
                label="原生全屏"
                selected={playerFs}
                onClick={() => {
                  onTogglePlayerFs()
                  onClose()
                }}
              />
            </SubmenuContainer>
          )}
        </div>

        <MenuDivider />

        {/* Copy Links & Stats */}
        <MenuItem
          icon={<IconLink />}
          label="复制当前时间点播放链接"
          onClick={() => {
            onCopyCurrentTimeUrl()
            onClose()
          }}
        />

        <MenuItem
          icon={<IconCopy />}
          label="复制视频播放直链"
          onClick={() => {
            onCopyVideoUrl()
            onClose()
          }}
        />

        <MenuItem
          icon={<IconStats />}
          label="复制调试统计信息"
          onClick={() => {
            onCopyDebugStats()
            onClose()
          }}
        />
      </div>
    </div>
  )
}

function MenuDivider() {
  return <div className="my-1 border-t border-[rgba(255,255,255,0.1)]" />
}

interface MenuItemProps {
  icon?: ReactNode
  label: string
  value?: string
  shortcut?: string
  active?: boolean
  hasSubmenu?: boolean
  onClick?: () => void
}

function MenuItem({
  icon,
  label,
  value,
  shortcut,
  active,
  hasSubmenu,
  onClick,
}: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-normal transition-colors ${
        active
          ? 'bg-sky-500/20 text-sky-300 font-medium'
          : 'text-slate-200 hover:bg-white/10 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2 truncate">
        {icon && (
          <span className="text-slate-400 w-3.5 h-3.5 flex items-center justify-center">
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>

      <div className="ml-2 flex items-center gap-1.5 text-[11px] text-slate-400 flex-shrink-0">
        {value && <span className="text-slate-300">{value}</span>}
        {shortcut && (
          <span className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-slate-400">
            {shortcut}
          </span>
        )}
        {active && !hasSubmenu && !value && (
          <span className="text-sky-400 font-semibold">已开启</span>
        )}
        {hasSubmenu && <IconChevronRight />}
      </div>
    </button>
  )
}

function SubmenuContainer({
  side = 'left',
  children,
}: {
  side?: 'left' | 'right'
  children: ReactNode
}) {
  const sideClass = side === 'right' ? 'left-full ml-1.5' : 'right-full mr-1.5'

  return (
    <div
      className={`kz-submenu-popover absolute top-0 ${sideClass} min-w-[8.5rem] rounded-xl border border-[rgba(255,255,255,0.18)] bg-[rgba(15,23,42,0.96)] p-1 text-xs text-white shadow-2xl backdrop-blur-2xl`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

interface SubmenuItemProps {
  label: string
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
}

function SubmenuItem({
  label,
  selected,
  disabled,
  onClick,
}: SubmenuItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-40 text-slate-400'
          : selected
            ? 'bg-sky-500/20 text-sky-300 font-medium'
            : 'text-slate-200 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span>{label}</span>
      {selected && <IconCheck />}
    </button>
  )
}
