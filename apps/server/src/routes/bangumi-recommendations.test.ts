import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { bangumiRoutes, buildAdaptiveSamplePlan } from './bangumi'
import {
  RECOMMENDATIONS_CDN_S_MAXAGE_SEC,
  setRecommendationsCdnHeaders,
} from '../lib/cdn-cache-headers'
import { cacheSet, BANGUMI_CACHE_TTL } from '../lib/ttl-cache'
import { config } from '../config'

test('setRecommendationsCdnHeaders: emits 24h edge TTL and zero browser TTL', () => {
  const headers: Record<string, string> = {}
  const mockContext = {
    header: (name: string, value: string) => {
      headers[name] = value
    },
  }

  setRecommendationsCdnHeaders(mockContext, false)

  assert.equal(RECOMMENDATIONS_CDN_S_MAXAGE_SEC, 86400)
  assert.equal(headers['Cache-Control'], 'public, max-age=0, s-maxage=86400')
  assert.equal(headers['CDN-Cache-Control'], 'max-age=86400')
  assert.equal(headers['Cloudflare-CDN-Cache-Control'], 'max-age=86400')
})

test('setRecommendationsCdnHeaders: emits no-store when bypass is true', () => {
  const headers: Record<string, string> = {}
  const mockContext = {
    header: (name: string, value: string) => {
      headers[name] = value
    },
  }

  setRecommendationsCdnHeaders(mockContext, true)

  assert.equal(headers['Cache-Control'], 'private, no-store')
  assert.equal(headers['CDN-Cache-Control'], 'no-store')
  assert.equal(headers['Cloudflare-CDN-Cache-Control'], 'no-store')
})

test('buildAdaptiveSamplePlan: handles small and large pools correctly', () => {
  assert.deepEqual(buildAdaptiveSamplePlan(0), [])
  assert.deepEqual(buildAdaptiveSamplePlan(20), [{ offset: 0, limit: 20 }])

  const plans = buildAdaptiveSamplePlan(500)
  assert.equal(plans.length, 4)
  for (const p of plans) {
    assert.ok(p.offset >= 0 && p.offset < 500)
    assert.ok(p.limit <= 15)
  }
})

test('GET /subjects/:id/recommendations: returns cached recommendations with CDN headers', async () => {
  const app = new Hono()
  app.route('/api/bangumi', bangumiRoutes)

  const subjectId = 999999
  const key = `bangumi:${config.bangumiApiHost}:rec:${subjectId}`
  const mockPayload = {
    items: [
      {
        id: 10001,
        name: '测试推荐动画',
        nameCn: '测试推荐动画',
        cover: 'https://lain.bgm.tv/pic/cover/l/test.jpg',
        score: 8.5,
        year: '2024',
        epsLabel: '全12话',
      },
    ],
    matchedTags: ['日本', '奇幻', '冒险'],
  }

  cacheSet(key, mockPayload, BANGUMI_CACHE_TTL.recommendations)

  const res = await app.request(`/api/bangumi/subjects/${subjectId}/recommendations`)
  assert.equal(res.status, 200)

  // Verify CDN headers are present on GET
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=86400')
  assert.equal(res.headers.get('CDN-Cache-Control'), 'max-age=86400')
  assert.equal(res.headers.get('Cloudflare-CDN-Cache-Control'), 'max-age=86400')
  assert.equal(res.headers.get('X-Cache'), 'HIT')

  const json = (await res.json()) as { data: typeof mockPayload }
  assert.equal(json.data.items[0].id, 10001)
  assert.equal(json.data.items[0].name, '测试推荐动画')
})

test('GET /recommendations?subjectId=...: alias endpoint works with CDN headers', async () => {
  const app = new Hono()
  app.route('/api/bangumi', bangumiRoutes)

  const subjectId = 999998
  const key = `bangumi:${config.bangumiApiHost}:rec:${subjectId}`
  const mockPayload = {
    items: [],
    matchedTags: ['日本'],
  }

  cacheSet(key, mockPayload, BANGUMI_CACHE_TTL.recommendations)

  const res = await app.request(`/api/bangumi/recommendations?subjectId=${subjectId}`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('CDN-Cache-Control'), 'max-age=86400')
  assert.equal(res.headers.get('X-Cache'), 'HIT')
})

test('POST /recommendations: maintains backward compatibility', async () => {
  const app = new Hono()
  app.route('/api/bangumi', bangumiRoutes)

  const subjectId = 999997
  const key = `bangumi:${config.bangumiApiHost}:rec:${subjectId}`
  const mockPayload = {
    items: [],
    matchedTags: ['日本'],
  }

  cacheSet(key, mockPayload, BANGUMI_CACHE_TTL.recommendations)

  const res = await app.request('/api/bangumi/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectId }),
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('X-Cache'), 'HIT')
  // POST should NOT emit edge cache headers
  assert.equal(res.headers.get('CDN-Cache-Control'), null)
})
