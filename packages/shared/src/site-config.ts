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
}
