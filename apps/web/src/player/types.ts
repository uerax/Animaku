import type {
  DanmakuAnime,
  DanmakuComment,
  DanmakuEpisode,
  DanmakuSettings,
  PlayerSettings,
} from '@animaku/shared'
import type {
  DanmakuPoolId,
  DanmakuSourceChip,
} from '../lib/danmaku-pools'

export interface DanmakuPanelState {
  status: string
  commentsCount: number
  /** currently drawn after source toggles */
  visibleCount?: number
  keyword: string
  onKeywordChange: (v: string) => void
  onSearch: () => void
  searchBusy?: boolean
  animes: DanmakuAnime[]
  episodes: DanmakuEpisode[]
  animeId: number | ''
  episodeId: number | ''
  onAnimeChange: (id: number) => void
  onEpisodeChange: (id: number) => void
  bvInput: string
  onBvInputChange: (v: string) => void
  bvPage: number
  onBvPageChange: (p: number) => void
  onLoadBilibili: () => void
  bilibiliBusy?: boolean
  onLoadXmlFile: (file: File) => void
  sources?: DanmakuSourceChip[]
  onToggleSource?: (id: DanmakuPoolId) => void
  poolOffsets?: Record<DanmakuPoolId, number>
  onSetPoolOffset?: (id: DanmakuPoolId, offset: number) => void
  globalTimeOffset?: number
  onSetGlobalTimeOffset?: (offset: number) => void
  onClearEpisodeTimeOffsets?: () => void
  /** Relative offset for danmaku episode alignment (e.g. -1 for prologue shift) */
  danmakuOffset?: number
  onResetOffset?: () => void
}

export interface VideoPlayerProps {
  title?: string
  src: string
  initialTime?: number
  comments: DanmakuComment[]
  danmaku: DanmakuSettings
  player: PlayerSettings
  onPlayerChange?: (partial: Partial<PlayerSettings>) => void
  onProgress?: (position: number, duration: number) => void
  onToggleDanmaku?: () => void
  onDanmakuChange?: (partial: Partial<DanmakuSettings>) => void
  onPrev?: () => void
  onNext?: () => void
  /** Desktop wide-screen / theater mode for current watch session */
  widescreen?: boolean
  onToggleWidescreen?: () => void
  embedded?: boolean
  hideHints?: boolean
  danmakuPanel?: DanmakuPanelState
  /** HUD toast message overlaid inside the player frame (e.g. source switch notification) */
  hudMessage?: string | null
  /**
   * Cookie / signed media expired (proxy 403 auth_expired or media error on cookie URL).
   * Parent should re-resolve and pass a new src; return a Promise to await.
   */
  onMediaAuthExpired?: (position: number) => void | Promise<void>
  /**
   * Unrecoverable media failure (e.g. direct CDN CORS / hotlink block).
   * Parent may switch to proxyUrl and remount. Called at most once per src.
   */
  onMediaLoadFailed?: (info: {
    position: number
    reason: string
  }) => void
  /** Bangumi Subject ID for OP/ED marker assistant */
  bangumiId?: number
  /** Current episode number (1-based) */
  episodeNumber?: number
  /** Total episodes of the anime */
  totalEpisodes?: number
  /** Official bangumi-oped data map for reference & merging */
  officialOpedData?: Map<number, import('../lib/bangumi-oped').BgmOpedEntry> | null
}
