import test from 'node:test'
import assert from 'node:assert/strict'
import type { PlayableSlot } from '@animaku/shared'

/**
 * 提取自 use-watch-session 的当前集索引定位与边界判定纯逻辑
 */
function resolveEpisodeBoundaries(
  episode: { pageUrl: string; episode: number; sourceIndex?: number } | null | undefined,
  slots: PlayableSlot[],
) {
  if (!episode || !slots.length) {
    return {
      currentSlotIndex: -1,
      hasPrevEpisode: false,
      hasNextEpisode: false,
    }
  }

  // 1. 优先按 pageUrl 严格比对
  let idx = slots.findIndex((s) => s.pageUrl === episode.pageUrl)

  // 2. 备用按 sourceIndex 比对（合法区间内）
  if (
    idx < 0 &&
    episode.sourceIndex !== undefined &&
    episode.sourceIndex >= 0 &&
    episode.sourceIndex < slots.length
  ) {
    idx = slots.findIndex((s) => s.sourceIndex === episode.sourceIndex)
  }

  // 3. 备用按 canonicalEp（标准集数号）比对
  if (idx < 0) {
    idx = slots.findIndex((s) => s.canonicalEp === episode.episode)
  }

  const currentSlotIndex = idx
  const hasPrevEpisode = currentSlotIndex > 0
  const hasNextEpisode =
    currentSlotIndex >= 0 && currentSlotIndex < slots.length - 1

  return {
    currentSlotIndex,
    hasPrevEpisode,
    hasNextEpisode,
  }
}

const mockSlots12: PlayableSlot[] = Array.from({ length: 12 }, (_, i) => ({
  canonicalEp: i + 1,
  officialTitle: `第${i + 1}话`,
  displayTitle: `第${i + 1}话`,
  sourceIndex: i,
  pageUrl: `https://example.com/ep/${i + 1}`,
  sourceTitle: `第${i + 1}集`,
  isLayer2: false,
}))

const mockSingleMovieSlots: PlayableSlot[] = [
  {
    canonicalEp: 1,
    officialTitle: '剧场版',
    displayTitle: '剧场版',
    sourceIndex: 0,
    pageUrl: 'https://example.com/movie/1',
    sourceTitle: '全片',
    isLayer2: false,
  },
]

test('第一集：hasPrevEpisode 为 false，hasNextEpisode 为 true', () => {
  const res = resolveEpisodeBoundaries(
    { pageUrl: 'https://example.com/ep/1', episode: 1, sourceIndex: 0 },
    mockSlots12,
  )
  assert.equal(res.currentSlotIndex, 0)
  assert.equal(res.hasPrevEpisode, false)
  assert.equal(res.hasNextEpisode, true)
})

test('中间集（如第6集）：hasPrevEpisode 和 hasNextEpisode 均为 true', () => {
  const res = resolveEpisodeBoundaries(
    { pageUrl: 'https://example.com/ep/6', episode: 6, sourceIndex: 5 },
    mockSlots12,
  )
  assert.equal(res.currentSlotIndex, 5)
  assert.equal(res.hasPrevEpisode, true)
  assert.equal(res.hasNextEpisode, true)
})

test('最后一集（第12集）：hasPrevEpisode 为 true，hasNextEpisode 为 false', () => {
  const res = resolveEpisodeBoundaries(
    { pageUrl: 'https://example.com/ep/12', episode: 12, sourceIndex: 11 },
    mockSlots12,
  )
  assert.equal(res.currentSlotIndex, 11)
  assert.equal(res.hasPrevEpisode, true)
  assert.equal(res.hasNextEpisode, false)
})

test('单集/剧场版：hasPrevEpisode 与 hasNextEpisode 均为 false', () => {
  const res = resolveEpisodeBoundaries(
    { pageUrl: 'https://example.com/movie/1', episode: 1, sourceIndex: 0 },
    mockSingleMovieSlots,
  )
  assert.equal(res.currentSlotIndex, 0)
  assert.equal(res.hasPrevEpisode, false)
  assert.equal(res.hasNextEpisode, false)
})

test('备用回退匹配：当 pageUrl 不匹配时按 sourceIndex 或 canonicalEp 匹配，杜绝误判为 0', () => {
  const res = resolveEpisodeBoundaries(
    { pageUrl: 'https://example.com/ep/different-url', episode: 12, sourceIndex: 11 },
    mockSlots12,
  )
  assert.equal(res.currentSlotIndex, 11)
  assert.equal(res.hasPrevEpisode, true)
  assert.equal(res.hasNextEpisode, false)
})

test('完全不匹配或空数据：全部返回 false，杜绝误判', () => {
  const res = resolveEpisodeBoundaries(
    { pageUrl: 'https://unknown.com', episode: 999 },
    mockSlots12,
  )
  assert.equal(res.currentSlotIndex, -1)
  assert.equal(res.hasPrevEpisode, false)
  assert.equal(res.hasNextEpisode, false)
})
