import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveBangumiApiUrlFromImageHost,
  BANGUMI_API_URL_BANGUMI,
  BANGUMI_API_URL_MIRROR,
} from './bangumi-endpoint'
import {
  buildAdaptiveSamplePlan,
  cleanAndPickTags,
  computeBangumiRecommendations,
  extractYear,
  formatEpsLabel,
} from './bangumi-recommendations'

test('resolveBangumiApiUrlFromImageHost: correctly pairs official vs mirror API URLs', () => {
  // Official image hosts -> official API
  assert.equal(
    resolveBangumiApiUrlFromImageHost('lain.bgm.tv'),
    BANGUMI_API_URL_BANGUMI,
  )
  assert.equal(
    resolveBangumiApiUrlFromImageHost('https://lain.bgm.tv'),
    BANGUMI_API_URL_BANGUMI,
  )
  assert.equal(
    resolveBangumiApiUrlFromImageHost('bgm.tv'),
    BANGUMI_API_URL_BANGUMI,
  )

  // Mirror image hosts -> mirror API
  assert.equal(
    resolveBangumiApiUrlFromImageHost('bgmimg.anibt.net'),
    BANGUMI_API_URL_MIRROR,
  )
  assert.equal(
    resolveBangumiApiUrlFromImageHost(undefined),
    BANGUMI_API_URL_MIRROR,
  )
  assert.equal(
    resolveBangumiApiUrlFromImageHost(''),
    BANGUMI_API_URL_MIRROR,
  )
})

test('cleanAndPickTags: filters noise and appends movie and country tags', () => {
  const rawTags = ['2024年', 'TV', '日本动画', '科幻', '机战', '神作']
  const { pickedTags, searchTags } = cleanAndPickTags(rawTags, true, '日本')

  assert.equal(pickedTags.length, 2)
  assert.ok(pickedTags.includes('科幻') || pickedTags.includes('机战'))
  assert.ok(searchTags.includes('日本'))
  assert.ok(searchTags.includes('剧场版'))
  assert.ok(!searchTags.includes('TV'))
  assert.ok(!searchTags.includes('2024年'))
})

test('extractYear and formatEpsLabel: format correctly', () => {
  assert.equal(extractYear('2024-10-01'), '2024')
  assert.equal(extractYear(''), '')
  assert.equal(formatEpsLabel({ totalEpisodes: 12 }), '全12话')
  assert.equal(formatEpsLabel({ eps: 24 }), '全24话')
  assert.equal(formatEpsLabel({}), '')
})

test('computeBangumiRecommendations: executes successfully with mock fetch', async () => {
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/v0/subjects/100/subjects')) {
      // Mock relations: has a sequel (Slot 0)
      return new Response(
        JSON.stringify([
          {
            id: 101,
            type: 2,
            name: 'Sequel Anime',
            name_cn: '续篇动画',
            relation: '续集',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.includes('/v0/subjects/101')) {
      // Slot 0 detail
      return new Response(
        JSON.stringify({
          id: 101,
          name: 'Sequel Anime',
          name_cn: '续篇动画',
          rating: { score: 8.8 },
          date: '2023-04-01',
          total_episodes: 12,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.includes('/v0/search/subjects')) {
      // Search candidate
      return new Response(
        JSON.stringify({
          total: 1,
          data: [
            {
              id: 202,
              name: 'Similar Anime',
              name_cn: '类似动画',
              rating: { score: 7.9 },
              date: '2022-01-01',
              total_episodes: 24,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify({}), { status: 404 })
  }

  const result = await computeBangumiRecommendations(100, {
    tags: ['热血', '奇幻'],
    country: '日本',
    isMovie: false,
    imageHost: 'bgmimg.anibt.net',
    customFetch: mockFetch,
  })

  assert.ok(Array.isArray(result.items))
  assert.equal(result.items.length, 2)
  // Slot 0 is sequel
  assert.equal(result.items[0].id, 101)
  assert.equal(result.items[0].relationBadge, '续作')
  // Slot 1 is similar candidate
  assert.equal(result.items[1].id, 202)

  // 验证本地持久缓存生效：再次调用时不发起任何网络请求（mockFetch 抛错也会命中缓存秒回相同数据）
  const failFetch: typeof fetch = async () => {
    throw new Error('网络请求不应被触发！应命中 24h 本地缓存')
  }

  const cachedResult = await computeBangumiRecommendations(100, {
    tags: ['热血', '奇幻'],
    country: '日本',
    isMovie: false,
    imageHost: 'bgmimg.anibt.net',
    customFetch: failFetch,
  })

  // 验证跨源通用缓存：即使切换了图片源（如镜像切到官方），数据本体缓存依然生效，绝不重复拉取
  const crossSourceResult = await computeBangumiRecommendations(100, {
    tags: ['热血', '奇幻'],
    country: '日本',
    isMovie: false,
    imageHost: 'lain.bgm.tv',
    customFetch: failFetch,
  })

  assert.deepEqual(crossSourceResult, result)
})


