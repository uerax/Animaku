import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchClientCalendar,
  fetchClientTrending,
  fetchClientSearch,
  fetchClientSubject,
  fetchClientEpisodes,
  slimItem,
  getCurrentSeasonAirDate,
} from './bangumi-client'
import type { BangumiItem } from './bangumi'

test('slimItem: drops summary and alias, caps tags to 6', () => {
  const fullItem: BangumiItem = {
    id: 1,
    type: 2,
    name: 'Full Name',
    nameCn: '全名',
    summary: 'Very long summary that should be dropped',
    airDate: '2024-01-01',
    airWeekday: 1,
    rank: 10,
    images: { common: 'https://test.jpg' },
    tags: [
      { name: '1' },
      { name: '2' },
      { name: '3' },
      { name: '4' },
      { name: '5' },
      { name: '6' },
      { name: '7' },
      { name: '8' },
    ],
    alias: ['Alias1', 'Alias2'],
    ratingScore: 8.0,
    votes: 100,
    eps: 12,
    totalEpisodes: 12,
  }

  const slim = slimItem(fullItem)
  assert.equal(slim.summary, '')
  assert.deepEqual(slim.alias, [])
  assert.equal(slim.tags.length, 6)
  assert.equal(slim.id, 1)
})

test('getCurrentSeasonAirDate: returns valid YYYY-MM-01 quarterly date', () => {
  const d = getCurrentSeasonAirDate()
  assert.match(d, /^\d{4}-(01|04|07|10)-01$/)
})

test('fetchClientCalendar: normalizes calendar array into 7 days', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/calendar')) {
      return new Response(
        JSON.stringify([
          {
            weekday: { id: 1 },
            items: [
              {
                id: 101,
                name: 'Monday Anime',
                name_cn: '周一动画',
              },
            ],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('', { status: 404 })
  }

  const days = await fetchClientCalendar({ customFetch: mockFetch })
  assert.equal(days.length, 7)
  // Day 1 (Monday) has items
  assert.equal(days[0].length, 1)
  assert.equal(days[0][0].id, 101)
  assert.equal(days[0][0].nameCn, '周一动画')
  // Day 2 (Tuesday) is empty
  assert.equal(days[1].length, 0)
})

test('fetchClientTrending: retrieves and parses trending anime list', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/v0/search/subjects')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 201,
              name: 'Trending Anime',
              name_cn: '热门动画',
              rating: { score: 9.1 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('', { status: 404 })
  }

  const items = await fetchClientTrending(10, 0, 2, { customFetch: mockFetch })
  assert.equal(items.length, 1)
  assert.equal(items[0].id, 201)
  assert.equal(items[0].nameCn, '热门动画')
})

test('fetchClientSearch: handles search with keyword, tags, and date sorting', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        total: 2,
        data: [
          { id: 301, name: 'Older Anime', date: '2020-01-01' },
          { id: 302, name: 'Newer Anime', date: '2024-05-01' },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const res = await fetchClientSearch(
    { keyword: 'test', sort: 'date' },
    { customFetch: mockFetch },
  )

  assert.equal(res.data.length, 2)
  // Date sort desc: 2024-05-01 before 2020-01-01
  assert.equal(res.data[0].id, 302)
  assert.equal(res.data[1].id, 301)
  assert.equal(res.total, 2)
})

test('fetchClientSubject: fetches and parses single subject detail', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/v0/subjects/401')) {
      return new Response(
        JSON.stringify({
          id: 401,
          name: 'Single Anime',
          name_cn: '单个动画',
          summary: 'Story about anime',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('', { status: 404 })
  }

  const subject = await fetchClientSubject(401, { customFetch: mockFetch })
  assert.equal(subject.id, 401)
  assert.equal(subject.nameCn, '单个动画')
  assert.equal(subject.summary, 'Story about anime')
})

test('fetchClientEpisodes: fetches and maps episodes list', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/v0/episodes')) {
      return new Response(
        JSON.stringify({
          total: 2,
          data: [
            { id: 501, sort: 1, name: 'Episode 1', ep: 1, duration_seconds: 1440 },
            { id: 502, sort: 2, name: 'Episode 2', ep: 2, duration_seconds: 1440 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('', { status: 404 })
  }

  const episodes = await fetchClientEpisodes(500, { customFetch: mockFetch })
  assert.equal(episodes.length, 2)
  assert.equal(episodes[0].id, 501)
  assert.equal(episodes[0].sort, 1)
  assert.equal(episodes[1].id, 502)

  // 验证本地持久缓存生效且跨官方/镜像源通用（数据本体与网络源解耦）
  const failFetch: typeof fetch = async () => {
    throw new Error('网络请求不应被触发！应命中本地持久缓存')
  }

  const cachedSubject = await fetchClientSubject(401, {
    imageHost: 'lain.bgm.tv',
    customFetch: failFetch,
  })
  assert.equal(cachedSubject.id, 401)
  assert.equal(cachedSubject.nameCn, '单个动画')

  const cachedEpisodes = await fetchClientEpisodes(500, {
    imageHost: 'lain.bgm.tv',
    customFetch: failFetch,
  })
  assert.equal(cachedEpisodes.length, 2)
  assert.equal(cachedEpisodes[0].id, 501)
})
