import type { ReactNode } from 'react'
import type {
  DanmakuComment,
  PlayerSettings,
  SuperResolutionMode,
} from '@animaku/shared'

export type AspectRatioMode = 'contain' | 'cover' | 'fill' | '4:3'

/**
 * Control-bar props bag — display state + callbacks only.
 * No media engine refs (video/hls/danmaku core).
 */
export interface PlayerControlsProps {
  title?: string
  showBar: boolean
  paused: boolean
  panelOpen: boolean
  speedMenuOpen: boolean
  srMenuOpen: boolean
  settingsMenuOpen?: boolean
  /** Mobile vertical volume popup */
  volumeMenuOpen: boolean
  current: number
  duration: number
  progress: number
  comments?: DanmakuComment[]
  danmakuEnabled: boolean
  danmakuSimplify?: boolean
  hasDanmakuPanel: boolean
  /** Rendered Danmaku panel element for desktop inline anchor alignment */
  danmakuPanelNode?: ReactNode
  player: PlayerSettings
  srMode: SuperResolutionMode
  srActive: boolean
  webGpuOk: boolean | null
  playerFs: boolean
  webFs: boolean
  aspectRatio?: AspectRatioMode
  onTogglePlay: () => void
  onPrev?: () => void
  onNext?: () => void
  onSeekRatio: (ratio: number) => void
  onToggleDanmaku?: () => void
  onTogglePanel: () => void
  onToggleSpeedMenu: () => void
  onToggleSrMenu: () => void
  onToggleSettingsMenu?: () => void
  onToggleVolumeMenu: () => void
  onPickSpeed: (speed: number) => void
  onPickSr: (mode: SuperResolutionMode) => void
  onAspectRatioChange?: (mode: AspectRatioMode) => void
  onToggleAutoNext?: () => void
  onToggleOpedSkip?: () => void
  onToggleOpedDrawer?: () => void
  hasOpedDrawer?: boolean
  opedDrawerOpen?: boolean
  /** Rendered OP/ED marker panel for desktop inline popover alignment */
  opedDrawerNode?: ReactNode
  onVolume: (vol: number) => void
  /** Desktop speaker icon: mute ↔ restore last audible volume */
  onToggleMute: () => void
  onTogglePlayerFs: () => void
  onToggleWebFs: () => void
  formatTime: (sec: number) => string
  speedOptions: readonly number[]
  srLabels: Record<SuperResolutionMode, string>
}
