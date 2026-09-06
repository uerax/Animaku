import test from 'node:test'
import assert from 'node:assert/strict'
import {
  historyId,
  formatPlaybackTime,
  getPlaybackPercentage,
  isPlaybackFinished,
  formatRelativeWatchTime,
  groupWatchHistory,
  computeHistoryStats,
  getLocalDayStart,
  type WatchHistoryEntry,
} from './history'

test('historyId: generates key by bangumiId and episode regardless of plugin and road', () => {
  // Same anime same ep with different plugins -> identical ID (collapses plugin variations)
  assert.equal(historyId(100403, 'xifan', 1, 0), '100403::ep1')
  assert.equal(historyId(100403, 'cycani', 1, 1), '100403::ep1')

  // Different episode of the same anime -> distinct ID
  assert.equal(historyId(100403, 'xifan', 2, 0), '100403::ep2')
  assert.notEqual(historyId(100403, 'xifan', 1), historyId(100403, 'xifan', 2))
})

test('formatPlaybackTime: correctly formats seconds into mm:ss and hh:mm:ss', () => {
  assert.equal(formatPlaybackTime(0), '0:00')
  assert.equal(formatPlaybackTime(-10), '0:00')
  assert.equal(formatPlaybackTime(59), '0:59')
  assert.equal(formatPlaybackTime(60), '1:00')
  assert.equal(formatPlaybackTime(1425), '23:45')
  assert.equal(formatPlaybackTime(3600), '1:00:00')
  assert.equal(formatPlaybackTime(3665), '1:01:05')
  assert.equal(formatPlaybackTime(7325), '2:02:05')
})

test('getPlaybackPercentage & isPlaybackFinished: checks completion accuracy', () => {
  assert.equal(getPlaybackPercentage(0, 1440), 0)
  assert.equal(getPlaybackPercentage(720, 1440), 50)
  assert.equal(getPlaybackPercentage(1440, 1440), 100)
  assert.equal(getPlaybackPercentage(1500, 1440), 100)
  assert.equal(getPlaybackPercentage(100, 0), 0)

  // Under 90% and more than 60s remaining
  assert.equal(isPlaybackFinished(1000, 1440), false)
  // Reached 90% (1300 / 1440 = 90.2%)
  assert.equal(isPlaybackFinished(1300, 1440), true)
  // Within 60 seconds of end
  assert.equal(isPlaybackFinished(1400, 1440), true)
  // Zero duration
  assert.equal(isPlaybackFinished(100, 0), false)
})

test('groupWatchHistory: partitions entries into industry-standard 4 buckets', () => {
  // Fix a reference "now": 2026-09-06 14:30:00 local time
  const refDate = new Date(2026, 8, 6, 14, 30, 0)
  const now = refDate.getTime()
  const todayStart = getLocalDayStart(now)
  const yesterdayStart = todayStart - 86_400_000

  const mockItem = (id: string, updatedAt: number): WatchHistoryEntry => ({
    id,
    bangumiId: 100,
    title: `Anime ${id}`,
    episode: 1,
    road: 0,
    pluginName: 'test',
    pageUrl: '',
    position: 600,
    duration: 1440,
    updatedAt,
  })

  const entries: WatchHistoryEntry[] = [
    // Today
    mockItem('t1', now - 1000 * 60 * 10), // 10 mins ago today
    mockItem('t2', todayStart + 1000), // early this morning
    // Yesterday
    mockItem('y1', yesterdayStart + 1000 * 3600 * 12), // yesterday noon
    // Last 7 days (e.g. 3 days ago, 5 days ago)
    mockItem('l1', todayStart - 86_400_000 * 3 + 1000), // 3 days ago
    mockItem('l2', todayStart - 86_400_000 * 6 + 1000), // 6 days ago
    // Earlier (e.g. 10 days ago, last year)
    mockItem('e1', todayStart - 86_400_000 * 10),
    mockItem('e2', new Date(2025, 0, 1).getTime()),
  ]

  const groups = groupWatchHistory(entries, now)

  assert.equal(groups.length, 4)
  assert.equal(groups[0].key, 'today')
  assert.equal(groups[0].items.length, 2)
  assert.deepEqual(
    groups[0].items.map((i) => i.id),
    ['t1', 't2'],
  )

  assert.equal(groups[1].key, 'yesterday')
  assert.equal(groups[1].items.length, 1)
  assert.equal(groups[1].items[0].id, 'y1')

  assert.equal(groups[2].key, 'last7Days')
  assert.equal(groups[2].items.length, 2)
  assert.deepEqual(
    groups[2].items.map((i) => i.id),
    ['l1', 'l2'],
  )

  assert.equal(groups[3].key, 'earlier')
  assert.equal(groups[3].items.length, 2)
  assert.deepEqual(
    groups[3].items.map((i) => i.id),
    ['e1', 'e2'],
  )
})

test('formatRelativeWatchTime: outputs human-friendly strings', () => {
  const refDate = new Date(2026, 8, 6, 14, 30, 0)
  const now = refDate.getTime()
  const todayStart = getLocalDayStart(now)

  // 30 seconds ago -> 刚刚
  assert.equal(formatRelativeWatchTime(now - 30_000, now), '刚刚')
  // 15 minutes ago -> 15分钟前
  assert.equal(formatRelativeWatchTime(now - 15 * 60_000, now), '15分钟前')
  // 2 hours ago today -> 12:30
  assert.equal(formatRelativeWatchTime(now - 2 * 3600_000, now), '12:30')

  // Yesterday at 21:15
  const yesterdayTime = todayStart - 86_400_000 + (21 * 3600 + 15 * 60) * 1000
  assert.equal(formatRelativeWatchTime(yesterdayTime, now), '昨天 21:15')

  // 3 days ago
  const threeDaysAgo = todayStart - 3 * 86_400_000 + 3600_000
  assert.match(formatRelativeWatchTime(threeDaysAgo, now), /^\d+天前$/)

  // Earlier in same year
  const aug15 = new Date(2026, 7, 15, 10, 0, 0).getTime()
  assert.equal(formatRelativeWatchTime(aug15, now), '08-15')

  // Earlier in different year
  const prevYear = new Date(2024, 11, 25, 10, 0, 0).getTime()
  assert.equal(formatRelativeWatchTime(prevYear, now), '2024-12-25')
})

test('computeHistoryStats: calculates aggregated metrics accurately', () => {
  const refDate = new Date(2026, 8, 6, 14, 30, 0)
  const now = refDate.getTime()

  const entries: WatchHistoryEntry[] = [
    {
      id: '1',
      bangumiId: 1,
      title: 'Anime 1',
      episode: 1,
      road: 0,
      pluginName: 'p1',
      pageUrl: '',
      position: 1400,
      duration: 1440, // Finished
      updatedAt: now - 1000, // Today
    },
    {
      id: '2',
      bangumiId: 2,
      title: 'Anime 2',
      episode: 2,
      road: 0,
      pluginName: 'p2',
      pageUrl: '',
      position: 720,
      duration: 1440, // Not finished
      updatedAt: now - 3600_000, // Today
    },
    {
      id: '3',
      bangumiId: 3,
      title: 'Anime 3',
      episode: 3,
      road: 0,
      pluginName: 'p3',
      pageUrl: '',
      position: 2200,
      duration: 2400, // Finished
      updatedAt: now - 86_400_000 * 5, // 5 days ago
    },
  ]

  const stats = computeHistoryStats(entries, now)
  assert.equal(stats.totalCount, 3)
  assert.equal(stats.todayCount, 2)
  assert.equal(stats.finishedCount, 2)
  // Total seconds: 1400 + 720 + 2200 = 4320s = 72 mins = 1.2h
  assert.equal(stats.totalWatchMinutes, 72)
  assert.equal(stats.totalWatchHoursText, '1.2 小时')
})
