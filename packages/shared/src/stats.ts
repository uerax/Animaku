export interface RecordPlayViewRequest {
  bangumiId: number
  episode: number
}

/**
 * Continuous uninterrupted playback duration required before reporting a valid play view.
 * Prevents inflated play metrics from short bounces (<15s).
 */
export const STATS_VALID_PLAY_THRESHOLD_SEC = 15

export interface RecordPlayViewResponse {
  success: boolean
  playCount: number
  totalPlayCount?: number
  deduped?: boolean
}

export interface AnimePlayStats {
  bangumiId: number
  totalPlayCount: number
  episodePlayCounts: Record<number, number>
}
