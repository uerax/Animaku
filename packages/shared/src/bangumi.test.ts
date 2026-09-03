import test from 'node:test'
import assert from 'node:assert/strict'
import {
  airBadgeLabel,
  airProgressLabel,
  estimateAirProgress,
  formatDoingCount,
  formatDoingLabel,
  parseBangumiItem,
} from './bangumi.ts'

test('formatDoingCount & formatDoingLabel: basic numbers and thresholds', () => {
  assert.equal(formatDoingCount(850), '850')
  assert.equal(formatDoingLabel(850), '850 人在看')
  assert.equal(formatDoingCount(99), '99')
  assert.equal(formatDoingCount(2058), '2.1k')
  assert.equal(formatDoingLabel(2058), '2.1k 人在看')
  assert.equal(formatDoingCount(1000), '1k')
  assert.equal(formatDoingCount(4321), '4.3k')
  assert.equal(formatDoingCount(12500), '1.3w')
  assert.equal(formatDoingLabel(12500), '1.3w 人在看')
  assert.equal(formatDoingCount(42397), '4.2w')
  assert.equal(formatDoingCount(100000), '10w')
  assert.equal(formatDoingCount(0), '')
  assert.equal(formatDoingLabel(0), null)
  assert.equal(formatDoingCount(-5), '')
  assert.equal(formatDoingCount(undefined), '')
  assert.equal(formatDoingCount(null), '')
})

test('estimateAirProgress & airProgressLabel: status classification', () => {
  const fixedNow = new Date(2026, 8, 3) // 2026-09-03

  // 1. Upcoming
  const upcomingItem = { airDate: '2026-10-01', eps: 12 }
  assert.equal(estimateAirProgress(upcomingItem, fixedNow).status, 'upcoming')
  assert.equal(airProgressLabel(upcomingItem, fixedNow), '未开播')

  // 2. Airing
  const airingItem = { airDate: '2026-07-06', eps: 12 }
  assert.equal(estimateAirProgress(airingItem, fixedNow).status, 'airing')
  assert.equal(airProgressLabel(airingItem, fixedNow), '连载中')

  // 3. Finished when planned eps completed
  const finishedItem = { airDate: '2026-01-10', eps: 12 }
  assert.equal(estimateAirProgress(finishedItem, fixedNow).status, 'finished')
  assert.equal(airProgressLabel(finishedItem, fixedNow), '已完结')

  // 4. Finished when eps is unknown but started > 180 days ago
  const oldItem = { airDate: '2024-04-01', eps: 0 }
  assert.equal(estimateAirProgress(oldItem, fixedNow).status, 'finished')
  assert.equal(airProgressLabel(oldItem, fixedNow), '已完结')
})

test('airBadgeLabel: label combinations', () => {
  const fixedNow = new Date(2026, 8, 3)

  // Airing with doing count
  assert.equal(
    airBadgeLabel({ airDate: '2026-07-06', eps: 12, doing: 2058 }, fixedNow),
    '连载中 · 2.1k人在看',
  )

  // Airing without doing count
  assert.equal(
    airBadgeLabel({ airDate: '2026-07-06', eps: 12 }, fixedNow),
    '连载中',
  )

  // Finished with doing count
  assert.equal(
    airBadgeLabel({ airDate: '2026-01-10', eps: 12, doing: 520 }, fixedNow),
    '已完结 · 520人在看',
  )

  // Upcoming without doing count
  assert.equal(
    airBadgeLabel({ airDate: '2026-10-01', eps: 12 }, fixedNow),
    '未开播',
  )
})

test('parseBangumiItem: doing count extraction', () => {
  // Official calendar item
  const item1 = parseBangumiItem({
    id: 123,
    name: 'Test',
    collection: { doing: 2058 },
  })
  assert.equal(item1.doing, 2058)

  // Next calendar format
  const item2 = parseBangumiItem({
    id: 123,
    name: 'Test',
    watchers: 2052,
  })
  assert.equal(item2.doing, 2052)

  // Next trending format
  const item3 = parseBangumiItem({
    id: 123,
    name: 'Test',
    count: 4301,
  })
  assert.equal(item3.doing, 4301)
})
