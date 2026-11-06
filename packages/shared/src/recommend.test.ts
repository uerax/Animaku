import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AnimeTagFilter,
  SeededRandom,
  computeDailySeed,
  RecommendItem,
  resolveDisplayTag,
  buildRecommendReason,
  collectUserGenreFrequencies,
  DailyRecommendService,
  type DailyRecommendClient,
} from './recommend'
import type { BangumiItem, BangumiCollectionEntry } from './bangumi'
import type { WatchHistoryEntry } from './history'

test('computeDailySeed: computes deterministic 32-bit positive integer', () => {
  const d1 = new Date(2026, 10, 6)
  const seed1 = computeDailySeed('device-12345', d1)
  const seed2 = computeDailySeed('device-12345', d1)
  assert.equal(seed1, seed2)
  assert.ok(seed1 > 0)
  assert.ok(seed1 <= 0x7fffffff)

  // Different device -> different seed
  const seed3 = computeDailySeed('device-99999', d1)
  assert.notEqual(seed1, seed3)

  // Different date -> different seed
  const d2 = new Date(2026, 10, 7)
  const seed4 = computeDailySeed('device-12345', d2)
  assert.notEqual(seed1, seed4)
})

test('AnimeTagFilter: filters noise and preserves standard genres', () => {
  assert.equal(AnimeTagFilter.isAllowedGenre('恋爱'), true)
  assert.equal(AnimeTagFilter.isAllowedGenre('异世界'), true)
  assert.equal(AnimeTagFilter.isAllowedGenre('原创'), true)
  assert.equal(AnimeTagFilter.isAllowedGenre('tv'), false)
  assert.equal(AnimeTagFilter.isAllowedGenre('2026'), false)
  assert.equal(AnimeTagFilter.isAllowedGenre('2026年7月'), false)
  assert.equal(AnimeTagFilter.isAllowedGenre('10月新番'), false)

  assert.equal(AnimeTagFilter.isTemporalTag('2026'), true)
  assert.equal(AnimeTagFilter.isTemporalTag('2024年秋'), true)
  assert.equal(AnimeTagFilter.isTemporalTag('7月新番'), true)
  assert.equal(AnimeTagFilter.isTemporalTag('日常'), false)

  assert.equal(AnimeTagFilter.isNoiseTag('tv'), true)
  assert.equal(AnimeTagFilter.isNoiseTag('日本'), true)
  assert.equal(AnimeTagFilter.isNoiseTag('科幻'), false)

  const rawFreq = {
    恋爱: 5,
    tv: 10,
    '2026': 8,
    悬疑: 3,
    漫改: 12,
  }
  const clean = AnimeTagFilter.filterByGenreAllowList(rawFreq)
  assert.deepEqual(clean, { 恋爱: 5, 悬疑: 3 })
})

test('SeededRandom: generates deterministic sequences', () => {
  const rng1 = new SeededRandom(12345)
  const rng2 = new SeededRandom(12345)

  const seq1 = [rng1.nextInt(100), rng1.nextInt(100), rng1.nextInt(100)]
  const seq2 = [rng2.nextInt(100), rng2.nextInt(100), rng2.nextInt(100)]
  assert.deepEqual(seq1, seq2)

  const list = [1, 2, 3, 4, 5, 6, 7]
  const shuffled1 = rng1.shuffle([...list])
  const shuffled2 = rng2.shuffle([...list])
  assert.deepEqual(shuffled1, shuffled2)
})

test('collectUserGenreFrequencies: deduplicates history by anime and merges Bangumi tags', () => {
  // History with 3 episodes of the same anime (id 100), 1 episode of another anime (id 200)
  const historyItems: WatchHistoryEntry[] = [
    {
      id: '100::ep1',
      bangumiId: 100,
      title: '葬送的芙莉莲',
      episode: 1,
      road: 0,
      pluginName: 'cycani',
      pageUrl: '...',
      position: 100,
      duration: 1400,
      updatedAt: 1,
      genres: ['奇幻', '治愈', '冒险'],
    },
    {
      id: '100::ep2',
      bangumiId: 100,
      title: '葬送的芙莉莲',
      episode: 2,
      road: 0,
      pluginName: 'cycani',
      pageUrl: '...',
      position: 100,
      duration: 1400,
      updatedAt: 2,
      genres: ['奇幻', '治愈', '冒险'],
    },
    {
      id: '200::ep1',
      bangumiId: 200,
      title: '命运石之门',
      episode: 1,
      road: 0,
      pluginName: 'cycani',
      pageUrl: '...',
      position: 100,
      duration: 1400,
      updatedAt: 3,
      genres: ['科幻', '悬疑', '智斗'],
    },
  ]

  // Bangumi collection: watching (type 2) and watched (type 3)
  const bangumiCollections: BangumiCollectionEntry[] = [
    {
      subjectId: 300,
      type: 2, // 在看
      rate: 9,
      subject: {
        id: 300,
        type: 2,
        name: '迷宫饭',
        nameCn: '迷宫饭',
        tags: [{ name: '奇幻' }, { name: '美食' }, { name: '冒险' }],
      } as BangumiItem,
    },
    {
      subjectId: 400,
      type: 1, // 想看 -> 应该忽略
      subject: {
        id: 400,
        type: 2,
        name: '想看条目',
        nameCn: '想看条目',
        tags: [{ name: '恋爱' }],
      } as BangumiItem,
    },
  ]

  // userSystemTags (预留自建用户系统口子)
  const userSystemTags = ['恋爱', '校园']

  const freq = collectUserGenreFrequencies({
    historyItems,
    bangumiCollections,
    userSystemTags,
  })

  // 芙莉莲虽然看了 2 集，但只贡献 1 次！
  assert.equal(freq['治愈'], 1)
  // 奇幻: 芙莉莲 (1) + 迷宫饭 (1) = 2
  assert.equal(freq['奇幻'], 2)
  assert.equal(freq['美食'], 1)
  assert.equal(freq['科幻'], 1)
  assert.equal(freq['悬疑'], 1)
  // 想看未被计入，但 userSystemTags 包含了恋爱和校园
  assert.equal(freq['恋爱'], 1)
  assert.equal(freq['校园'], 1)
})

test('RecommendItem.generateRecommendations: fallback generator', () => {
  const dummyItems: BangumiItem[] = [
    {
      id: 1,
      type: 2,
      name: 'Item 1',
      nameCn: '条目 1',
      ratingScore: 8.5,
      votes: 100,
      images: { large: 'https://example.com/1.jpg' },
    } as BangumiItem,
    {
      id: 2,
      type: 2,
      name: 'Item 2',
      nameCn: '条目 2',
      ratingScore: 7.8,
      votes: 80,
      images: { large: 'https://example.com/2.jpg' },
    } as BangumiItem,
  ]

  const recs = RecommendItem.generateRecommendations(dummyItems, 2)
  assert.equal(recs.length, 2)
  assert.equal(recs[0].item.id, 1)
  assert.equal(recs[0].tag, '口碑神作')
  assert.equal(recs[0].matchRate, 98)
  assert.equal(recs[1].matchRate, 96)
})

test('DailyRecommendService: full scattered recommendation execution', async () => {
  const mockClient: DailyRecommendClient = {
    searchWithTotal: async (_keyword, opts) => {
      const tag = opts.tags?.[0] || '默认'
      return {
        items: [
          {
            id: Math.floor(Math.random() * 100000) + 1,
            type: 2,
            name: `${tag} 作品 A`,
            nameCn: `${tag} 作品 A`,
            ratingScore: 8.0,
            votes: 500,
            images: { large: `https://example.com/${tag}.jpg` },
            tags: [{ name: tag }],
          } as BangumiItem,
        ],
        total: 200,
      }
    },
    getTagTotal: async () => 200,
    getTrending: async () => [],
  }

  const recs = await DailyRecommendService.getDailyRecommendations({
    client: mockClient,
    customDeviceId: 'test-device-uuid',
    customDate: new Date(2026, 10, 6),
    rawUserTagFreq: { 恋爱: 10, 悬疑: 5, 科幻: 3 },
  })

  assert.equal(recs.length, 5)
  assert.ok(recs[0].reason.length > 0)
  assert.ok(recs[0].tag.startsWith('#'))
  assert.equal(recs[0].matchRate, 98)
  assert.equal(recs[4].matchRate, 90)

  // Verify memory caching
  const recsCached = await DailyRecommendService.getDailyRecommendations({
    client: mockClient,
    customDeviceId: 'test-device-uuid',
    customDate: new Date(2026, 10, 6),
  })
  assert.equal(recs, recsCached)
})
