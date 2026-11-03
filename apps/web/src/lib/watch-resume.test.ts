import test from 'node:test'
import assert from 'node:assert/strict'
import type { WatchHistoryEntry } from '@animaku/shared'
import {
  formatMinutesSeconds,
  isPlaybackFinished,
  calculateResumePositionFromList,
  calculateHistorySourceUrlFromList,
  RESUME_MIN_POSITION,
} from './watch-resume.ts'

test('formatMinutesSeconds 格式化', () => {
  assert.equal(formatMinutesSeconds(0), '00:00')
  assert.equal(formatMinutesSeconds(65), '01:05')
  assert.equal(formatMinutesSeconds(725), '12:05')
  assert.equal(formatMinutesSeconds(3600), '60:00')
})

test('isPlaybackFinished 完播判定', () => {
  // 无效时长
  assert.equal(isPlaybackFinished(100, 0), false)
  assert.equal(isPlaybackFinished(100, -1), false)

  // 长视频 (>30s)
  // 时长 1440s (24分钟)，剩余 <= CONTINUE_PLAY_END_THRESHOLD_SEC (1425s) 或比例 >= CONTINUE_PLAY_END_RATIO_THRESHOLD (95% -> 1368s)
  assert.equal(isPlaybackFinished(1400, 1440), true) // > 95%
  assert.equal(isPlaybackFinished(1430, 1440), true) // 剩余 10s <= 15s
  assert.equal(isPlaybackFinished(100, 1440), false) // 未完播

  // 短视频 (<=30s)
  assert.equal(isPlaybackFinished(19, 20), true) // pos >= dur - 2
  assert.equal(isPlaybackFinished(10, 20), false)
})

const mockHistory: WatchHistoryEntry[] = [
  {
    id: '123::ep1',
    bangumiId: 123,
    title: '测试番剧',
    episode: 1,
    road: 0,
    pluginName: 'cycani',
    pageUrl: 'https://cycani.com/play/1-1.html',
    sourceUrl: 'https://cycani.com/detail/1.html',
    position: 450,
    duration: 1440,
    updatedAt: Date.now(),
  },
  {
    id: '123::ep2',
    bangumiId: 123,
    title: '测试番剧',
    episode: 2,
    road: 0,
    pluginName: 'cycani',
    pageUrl: 'https://cycani.com/play/1-2.html',
    sourceUrl: 'https://cycani.com/detail/1.html',
    position: 1400, // 接近完播
    duration: 1440,
    updatedAt: Date.now(),
  },
]

test('calculateResumePositionFromList: 精确匹配与完播清零', () => {
  // 第 1 集进行中：返回 450
  const pos1 = calculateResumePositionFromList(mockHistory, 123, 'cycani', 1, 0)
  assert.equal(pos1, 450)

  // 第 2 集已近完播：返回 0，从头开播
  const pos2 = calculateResumePositionFromList(mockHistory, 123, 'cycani', 2, 0)
  assert.equal(pos2, 0)

  // 跨线路/源回退继承同集进度
  const posFallback = calculateResumePositionFromList(mockHistory, 123, 'other-plugin', 1, 1)
  assert.equal(posFallback, 450)

  // 无记录集数：返回 0
  const posUnknown = calculateResumePositionFromList(mockHistory, 123, 'cycani', 3, 0)
  assert.equal(posUnknown, 0)
})

test('calculateHistorySourceUrlFromList: 历史 sourceUrl 检索', () => {
  // 按 pageUrl 精确匹配
  const url1 = calculateHistorySourceUrlFromList(
    mockHistory,
    123,
    'cycani',
    'https://cycani.com/play/1-1.html',
  )
  assert.equal(url1, 'https://cycani.com/detail/1.html')

  // URL 尾部斜杠容错
  const urlSlash = calculateHistorySourceUrlFromList(
    mockHistory,
    123,
    'cycani',
    'https://cycani.com/play/1-1.html/',
  )
  assert.equal(urlSlash, 'https://cycani.com/detail/1.html')

  // 未提供 pageUrl，回退获取任意有效 sourceUrl
  const urlAny = calculateHistorySourceUrlFromList(mockHistory, 123, 'cycani', '')
  assert.equal(urlAny, 'https://cycani.com/detail/1.html')

  // 不存在的插件
  const urlNone = calculateHistorySourceUrlFromList(mockHistory, 123, 'unknown', '')
  assert.equal(urlNone, '')
})
