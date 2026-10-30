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

test('recommendations endpoints: decommissioned and unmapped on server to protect against crawler traversal', async () => {
  const app = new Hono()
  app.route('/api/bangumi', bangumiRoutes)

  const subjectId = 999999
  const resGetSubject = await app.request(`/api/bangumi/subjects/${subjectId}/recommendations`)
  assert.equal(resGetSubject.status, 404)

  const resGetAlias = await app.request(`/api/bangumi/recommendations?subjectId=${subjectId}`)
  assert.equal(resGetAlias.status, 404)

  const resPost = await app.request('/api/bangumi/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectId }),
  })
  assert.equal(resPost.status, 404)
})
