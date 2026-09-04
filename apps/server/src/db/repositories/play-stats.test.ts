import test from 'node:test'
import assert from 'node:assert/strict'
import { getDatabase } from '../connection'
import { initSchema } from '../schema'
import { playStatsRepo } from './play-stats'

test('PlayStatsRepository on anime_play_counts', async (t) => {
  // Initialize in-memory database
  const db = getDatabase({ path: ':memory:', wal: false })
  initSchema(db)

  await t.test('records play view atomically without splitting into separate episode rows', () => {
    // Record play for subject 50001, episode 1
    const r1 = playStatsRepo.recordPlay(50001, 1)
    assert.equal(r1.totalPlayCount, 1)
    assert.equal(r1.episodePlayCount, 1)

    // Record play for subject 50001, episode 2
    const r2 = playStatsRepo.recordPlay(50001, 2)
    assert.equal(r2.totalPlayCount, 2)
    assert.equal(r2.episodePlayCount, 2)

    // Check DB row directly
    const row = db.prepare('SELECT bangumi_id, play_count FROM anime_play_counts WHERE bangumi_id = ?').get(50001) as {
      bangumi_id: number
      play_count: number
    }
    assert.ok(row)
    assert.equal(row.bangumi_id, 50001)
    assert.equal(row.play_count, 2)

    // Check total count across the entire table for 50001 (must only be 1 row, not N+1 rows)
    const countRows = db.prepare('SELECT COUNT(*) as c FROM anime_play_counts WHERE bangumi_id = ?').get(50001) as { c: number }
    assert.equal(countRows.c, 1, 'Subject must only occupy a single row in anime_play_counts')
  })

  await t.test('getPlayStats retrieves metrics correctly', () => {
    const stats = playStatsRepo.getPlayStats(50001)
    assert.equal(stats.bangumiId, 50001)
    assert.equal(stats.totalPlayCount, 2)

    const nonExistent = playStatsRepo.getPlayStats(999999)
    assert.equal(nonExistent.bangumiId, 999999)
    assert.equal(nonExistent.totalPlayCount, 0)
  })

  await t.test('getTopPlayed ranks subjects by play_count descending', () => {
    // 50002 has 10 plays
    for (let i = 0; i < 10; i++) {
      playStatsRepo.recordPlay(50002)
    }
    // 50003 has 5 plays
    for (let i = 0; i < 5; i++) {
      playStatsRepo.recordPlay(50003)
    }

    const top = playStatsRepo.getTopPlayed(5)
    assert.ok(top.length >= 3)
    assert.equal(top[0].bangumiId, 50002)
    assert.equal(top[0].totalPlayCount, 10)
    assert.equal(top[1].bangumiId, 50003)
    assert.equal(top[1].totalPlayCount, 5)
    assert.equal(top[2].bangumiId, 50001)
    assert.equal(top[2].totalPlayCount, 2)
  })
})
