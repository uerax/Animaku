import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { initSchema } from '../apps/server/src/db/schema'
import { getDatabase } from '../apps/server/src/db/connection'
import { ipAccessAndRateLimit } from '../apps/server/src/lib/ip-rate-limit'

async function runTests() {
  console.log('🧪 开始测试全局 Rate Limit 频控滑动窗口中间件...')

  const db = getDatabase({ path: ':memory:' })
  initSchema(db)

  const app = new Hono()
  // Configure tight limits for testing: API limit = 3 req/s, heavy limit = 2 req/s
  app.use('*', ipAccessAndRateLimit({ apiLimitPerSec: 3, heavyLimitPerSec: 2 }))

  app.get('/api/test', (c) => c.json({ ok: true }))
  app.get('/api/plugin/search', (c) => c.json({ ok: true }))

  const mockIp = '203.0.113.50'
  const reqHeaders = {
    'X-Forwarded-For': mockIp,
  }

  // 1. Standard API tests (limit = 3)
  console.log('1. 测试普通 API (/api/test) 频控')
  const r1 = await app.request('/api/test', { headers: reqHeaders })
  assert.equal(r1.status, 200)

  const r2 = await app.request('/api/test', { headers: reqHeaders })
  assert.equal(r2.status, 200)

  const r3 = await app.request('/api/test', { headers: reqHeaders })
  assert.equal(r3.status, 200)

  // 4th request within 1s should be 429
  const r4 = await app.request('/api/test', { headers: reqHeaders })
  assert.equal(r4.status, 429, '超过 3 次应返回 429 Too Many Requests')
  assert.equal(r4.headers.get('Retry-After'), '1')

  // 2. Heavy API tests (limit = 2)
  console.log('2. 测试高负载接口 (/api/plugin/search) 独立频控')
  const heavyIp = '203.0.113.60'
  const heavyHeaders = { 'X-Forwarded-For': heavyIp }

  const h1 = await app.request('/api/plugin/search', { headers: heavyHeaders })
  assert.equal(h1.status, 200)

  const h2 = await app.request('/api/plugin/search', { headers: heavyHeaders })
  assert.equal(h2.status, 200)

  // 3rd request to heavy endpoint should be 429
  const h3 = await app.request('/api/plugin/search', { headers: heavyHeaders })
  assert.equal(h3.status, 429, '超过 2 次应返回 429')

  console.log('✅ Rate Limit 频控中间件测试全量通过！')
}

runTests().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
