import type { AnimePlayStats } from '@animaku/shared'
import { prepareStatement } from '../connection'

export class PlayStatsRepository {
  /**
   * Record a valid play view for a specific anime and increment the total anime play count.
   * Directly operates on anime_play_counts with atomic single-row upsert.
   * `episode` is accepted for backward-compatibility but no longer split into separate DB rows.
   */
  recordPlay(
    bangumiId: number,
    _episode?: number,
  ): { episodePlayCount: number; totalPlayCount: number } {
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      return { episodePlayCount: 0, totalPlayCount: 0 }
    }
    const now = Date.now()

    try {
      // Single-row atomic upsert with RETURNING to fetch updated count with 0 query overhead
      const upsertStmt = prepareStatement(`
        INSERT INTO anime_play_counts (bangumi_id, play_count, updated_at)
        VALUES (?, 1, ?)
        ON CONFLICT(bangumi_id) DO UPDATE SET
          play_count = play_count + 1,
          updated_at = excluded.updated_at
        RETURNING play_count;
      `)

      const row = upsertStmt.get(bangumiId, now) as { play_count?: number } | undefined
      const total = Number(row?.play_count || 1)

      return { episodePlayCount: total, totalPlayCount: total }
    } catch (err) {
      console.error('[db:play-stats] recordPlay error:', err)
      return { episodePlayCount: 0, totalPlayCount: 0 }
    }
  }

  /**
   * Retrieve play metrics for a specific anime subject.
   */
  getPlayStats(bangumiId: number): AnimePlayStats {
    const fallback: AnimePlayStats = {
      bangumiId,
      totalPlayCount: 0,
      episodePlayCounts: {},
    }
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      return fallback
    }

    try {
      const stmt = prepareStatement(`
        SELECT play_count
        FROM anime_play_counts
        WHERE bangumi_id = ?;
      `)
      const row = stmt.get(bangumiId) as { play_count?: number } | undefined
      const totalPlayCount = Number(row?.play_count || 0)

      return {
        bangumiId,
        totalPlayCount,
        episodePlayCounts: {},
      }
    } catch (err) {
      console.error('[db:play-stats] getPlayStats error:', err)
      return fallback
    }
  }

  /**
   * Retrieve top played anime bangumi IDs for rankings.
   */
  getTopPlayed(limit = 20): Array<{ bangumiId: number; totalPlayCount: number }> {
    try {
      const stmt = prepareStatement(`
        SELECT bangumi_id, play_count
        FROM anime_play_counts
        ORDER BY play_count DESC
        LIMIT ?;
      `)
      const rows = stmt.all(Math.max(1, limit)) as Array<{
        bangumi_id: number
        play_count: number
      }>
      return rows.map((r) => ({
        bangumiId: Number(r.bangumi_id),
        totalPlayCount: Number(r.play_count),
      }))
    } catch (err) {
      console.error('[db:play-stats] getTopPlayed error:', err)
      return []
    }
  }
}

export const playStatsRepo = new PlayStatsRepository()

