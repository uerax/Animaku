import type { SuperResolutionMode } from './player'

export interface SiteNavDefaults {
  showUserMenu?: boolean
  showHistory?: boolean
  showThemeToggle?: boolean
  showGitHub?: boolean
  openInNewTab?: boolean
}

export interface SitePlayerDefaults {
  speed?: number
  autoplay?: boolean
  autoNext?: boolean
  continuePlay?: boolean
  customSeekTime?: number
  superResolution?: SuperResolutionMode
  preferBangumiOped?: boolean
  firstEpisodeProtect?: boolean
  skipOp?: {
    enabled?: boolean
    start?: number
    duration?: number
  }
  skipEd?: {
    enabled?: boolean
    start?: number
    duration?: number
  }
}

export interface SiteDanmakuDefaults {
  enabled?: boolean
  opacity?: number
  fontSize?: number
  speed?: number
  area?: number
  showTop?: boolean
  showBottom?: boolean
  showScroll?: boolean
  showColor?: boolean
  simplify?: boolean
  filters?: string[]
}

export interface SiteDefaultSettings {
  bangumiImageHost?: string
  theme?: 'light' | 'dark'
  nav?: SiteNavDefaults
  player?: SitePlayerDefaults
  danmaku?: SiteDanmakuDefaults
  pluginOrder?: string[]
  disabledPlugins?: string[]
  /**
   * 每个视频源针对特定 Bangumi ID 的专属加权名单（key 为源名称小写，value 为 bangumiId 数组）。
   * 播放该 ID 的番剧时对应源权重增加 20。
   */
  sourceBangumiIds?: Record<string, number[]>
}
