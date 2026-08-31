import test from 'node:test'
import assert from 'node:assert/strict'
import { commentFilters, type CommentItem } from './comment.ts'

function createMockComment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    id: 1,
    source: 'bangumi',
    author: {
      id: 100,
      username: 'test_user',
      nickname: '测试用户',
      avatar: 'https://example.com/avatar.jpg',
    },
    content: '这是一条很有深度的短评吐槽',
    rate: 8,
    collectionType: 2,
    createdAt: '2026-08-31T00:00:00.000Z',
    ...overrides,
  }
}

test('commentFilters.passthrough: always returns true for any comment', () => {
  const item1 = createMockComment({ content: '有文字' })
  const item2 = createMockComment({ content: '' })
  const item3 = createMockComment({ content: '   ', rate: undefined })

  assert.equal(commentFilters.passthrough(item1), true)
  assert.equal(commentFilters.passthrough(item2), true)
  assert.equal(commentFilters.passthrough(item3), true)
})

test('commentFilters.nonEmptyContent: filters out empty or whitespace-only comments', () => {
  const validItem = createMockComment({ content: '精彩！' })
  const emptyItem = createMockComment({ content: '' })
  const spacesItem = createMockComment({ content: '   \n\t  ' })

  assert.equal(commentFilters.nonEmptyContent(validItem), true)
  assert.equal(commentFilters.nonEmptyContent(emptyItem), false)
  assert.equal(commentFilters.nonEmptyContent(spacesItem), false)
})

test('commentFilters.ratedOnly: filters out unrated comments', () => {
  const ratedItem = createMockComment({ rate: 9 })
  const unratedItem = createMockComment({ rate: undefined })
  const zeroRatedItem = createMockComment({ rate: 0 })

  assert.equal(commentFilters.ratedOnly(ratedItem), true)
  assert.equal(commentFilters.ratedOnly(unratedItem), false)
  assert.equal(commentFilters.ratedOnly(zeroRatedItem), false)
})

test('commentFilters.createKeywordFilter: blocks comments containing specified keywords', () => {
  const filter = commentFilters.createKeywordFilter(['剧透', '广告'])

  const normalItem = createMockComment({ content: '作画精良，配乐封神！' })
  const spoilerItem = createMockComment({ content: '前方剧透注意：主角最后牺牲了' })
  const adItem = createMockComment({ content: '加Q群看最新动漫广告' })

  assert.equal(filter(normalItem), true)
  assert.equal(filter(spoilerItem), false)
  assert.equal(filter(adItem), false)
})

test('commentFilters.combine: combines multiple filters with logical AND', () => {
  const combined = commentFilters.combine(
    commentFilters.nonEmptyContent,
    commentFilters.ratedOnly,
    commentFilters.createKeywordFilter(['垃圾']),
  )

  const perfectItem = createMockComment({ content: '佳作', rate: 10 })
  const noContentItem = createMockComment({ content: '', rate: 10 })
  const noRateItem = createMockComment({ content: '佳作', rate: undefined })
  const blockedWordItem = createMockComment({ content: '真是垃圾', rate: 1 })

  assert.equal(combined(perfectItem), true)
  assert.equal(combined(noContentItem), false)
  assert.equal(combined(noRateItem), false)
  assert.equal(combined(blockedWordItem), false)
})
