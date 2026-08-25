import type { AnimePlayStats } from '@animaku/shared'
import { getDatabase, prepareStatement, transaction } from '../connection'

export class PlayStatsRepository {
  /**
   * Record a valid play view for a specific anime episode and increment the total anime play count.
   * episode = 0 represents the total play count for the whole anime series.
   * episode >= 1 represents the specific episode.
   */
  recordPlay(
    bangumiId: number,
    episode: number,
  ): { episodePlayCount: number; totalPlayCount: number } {
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      return { episodePlayCount: 0, totalPlayCount: 0 }
    }
    const epNum = Math.max(0, Math.trunc(episode || 0))
    const now = Date.now()

    try {
      // Execute in a transaction to ensure episode count & total count stay atomic
      return transaction(() => {
        const upsertStmt = prepareStatement(`
          INSERT INTO anime_play_stats (bangumi_id, episode, play_count, updated_at)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(bangumi_id, episode) DO UPDATE SET
            play_count = play_count + 1,
            updated_at = excluded.updated_at;
        `)

        // 1. Increment specific episode (if epNum > 0)
        if (epNum > 0) {
          upsertStmt.run(bangumiId, epNum, now)
        }

        // 2. Always increment whole anime total (episode = 0)
        upsertStmt.run(bangumiId, 0, now)

        // 3. Fetch latest counts
        const queryStmt = prepareStatement(`
          SELECT episode, play_count
          FROM anime_play_stats
          WHERE bangumi_id = ? AND episode IN (?, 0);
        `)
        const rows = queryStmt.all(bangumiId, epNum) as Array<{
          episode: number
          play_count: number
        }>

        let epCount = 0
        let totalCount = 0
        for (const row of rows) {
          if (row.episode === 0) {
            totalCount = Number(row.play_count)
          }
          if (epNum > 0 && row.episode === epNum) {
            epCount = Number(row.play_count)
          }
        }

        if (epNum === 0) {
          epCount = totalCount
        }

        return { episodePlayCount: epCount, totalPlayCount: totalCount }
      })
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
        SELECT episode, play_count
        FROM anime_play_stats
        WHERE bangumi_id = ?
        ORDER BY episode ASC;
      `)
      const rows = stmt.all(bangumiId) as Array<{
        episode: number
        play_count: number
      }>

      let totalPlayCount = 0
      const episodePlayCounts: Record<number, number> = {}

      for (const row of rows) {
        const ep = Number(row.episode)
        const count = Number(row.play_count)
        if (ep === 0) {
          totalPlayCount = count
        } else {
          episodePlayCounts[ep] = count
        }
      }

      return {
        bangumiId,
        totalPlayCount,
        episodePlayCounts,
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
        FROM anime_play_stats
        WHERE episode = 0
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
