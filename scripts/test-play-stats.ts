import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initSchema } from '../apps/server/src/db/schema'
import { playStatsRepo } from '../apps/server/src/db/repositories/play-stats'
import { getDatabase } from '../apps/server/src/db/connection'

async function runTests() {
  console.log('🧪 开始测试播放量统计 (Play Stats Repository)...')

  // Initialize DB schema in memory or target path
  const db = getDatabase({ path: ':memory:' })
  initSchema(db)

  const testBangumiId = 999999

  // Test 1: Record play for episode 1
  console.log('1. 测试记录第 1 集播放量')
  const res1 = playStatsRepo.recordPlay(testBangumiId, 1)
  assert.equal(res1.episodePlayCount, 1, '第 1 集播放量应为 1')
  assert.equal(res1.totalPlayCount, 1, '全剧总播放量应为 1')

  // Test 2: Record play for episode 2
  console.log('2. 测试记录第 2 集播放量')
  const res2 = playStatsRepo.recordPlay(testBangumiId, 2)
  assert.equal(res2.episodePlayCount, 1, '第 2 集播放量应为 1')
  assert.equal(res2.totalPlayCount, 2, '全剧总播放量应为 2')

  // Test 3: Record play again for episode 1
  console.log('3. 测试再次记录第 1 集播放量')
  const res3 = playStatsRepo.recordPlay(testBangumiId, 1)
  assert.equal(res3.episodePlayCount, 2, '第 1 集播放量应为 2')
  assert.equal(res3.totalPlayCount, 3, '全剧总播放量应为 3')

  // Test 4: Query play stats
  console.log('4. 测试查询番剧播放量统计')
  const stats = playStatsRepo.getPlayStats(testBangumiId)
  assert.equal(stats.bangumiId, testBangumiId)
  assert.equal(stats.totalPlayCount, 3, '全剧总播放量应为 3')
  assert.equal(stats.episodePlayCounts[1], 2, '第 1 集播放量应为 2')
  assert.equal(stats.episodePlayCounts[2], 1, '第 2 集播放量应为 1')

  // Test 5: Top played ranking
  console.log('5. 测试排行榜查询')
  const top = playStatsRepo.getTopPlayed(5)
  assert.ok(top.length > 0)
  assert.equal(top[0].bangumiId, testBangumiId)
  assert.equal(top[0].totalPlayCount, 3)

  console.log('✅ 播放量统计全部单测通过！')
}

runTests().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
