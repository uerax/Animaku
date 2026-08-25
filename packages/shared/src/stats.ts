export interface RecordPlayViewRequest {
  bangumiId: number
  episode: number
}

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
