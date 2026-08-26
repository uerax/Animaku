import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { initSchema } from '../apps/server/src/db/schema'
import { getDatabase } from '../apps/server/src/db/connection'
import { ipAccessAndRateLimit } from '../apps/server/src/lib/ip-rate-limit'
import { ipAccessRepo } from '../apps/server/src/db'

async function runTests() {
  console.log('🧪 开始测试全局 Rate Limit 频控滑动窗口与本地回环/健康检查过滤...')

  const db = getDatabase({ path: ':memory:' })
  initSchema(db)

  const app = new Hono()
  // Configure tight limits for testing: API limit = 3 req/s, heavy limit = 2 req/s
  app.use('*', ipAccessAndRateLimit({ apiLimitPerSec: 3, heavyLimitPerSec: 2 }))

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.get('/api/test', (c) => c.json({ ok: true }))
  app.get('/api/plugin/search', (c) => c.json({ ok: true }))

  // 1. Health check & loopback bypass test
  console.log('1. 测试 /api/health 与 127.0.0.1 回环访问绕过频控且不记录 IP 访问')
  for (let i = 0; i < 10; i++) {
    const res = await app.request('/api/health', {
      headers: { 'X-Forwarded-For': '127.0.0.1' },
    })
    assert.equal(res.status, 200, '健康检查不应被 429 限流')
  }

  // 确保 127.0.0.1 没有被写入 ip_access_logs
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(ipAccessRepo.getIpAccess('127.0.0.1'), null, '127.0.0.1 健康检查不应被记录入库')

  const mockIp = '203.0.113.50'
  const reqHeaders = {
    'X-Forwarded-For': mockIp,
  }

  // 2. Standard API tests (limit = 3)
  console.log('2. 测试普通 API (/api/test) 频控')
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

  // 3. Heavy API tests (limit = 2)
  console.log('3. 测试高负载接口 (/api/plugin/search) 独立频控')
  const heavyIp = '203.0.113.60'
  const heavyHeaders = { 'X-Forwarded-For': heavyIp }

  const h1 = await app.request('/api/plugin/search', { headers: heavyHeaders })
  assert.equal(h1.status, 200)

  const h2 = await app.request('/api/plugin/search', { headers: heavyHeaders })
  assert.equal(h2.status, 200)

  // 3rd request to heavy endpoint should be 429
  const h3 = await app.request('/api/plugin/search', { headers: heavyHeaders })
  assert.equal(h3.status, 429, '超过 2 次应返回 429')

  // 验证真实外部 IP 成功记录
  await new Promise((r) => setTimeout(r, 20))
  const externalStat = ipAccessRepo.getIpAccess(mockIp)
  assert.ok(externalStat, '真实外部 IP 应被记录')
  assert.equal(externalStat?.total_hits, 4, '4 次调用应全部被统计')

  console.log('✅ Rate Limit 频控与本地回环过滤测试全量通过！')
}

runTests().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
