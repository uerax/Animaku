import { describe, it, beforeEach, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici'
import { ipAccessAndRateLimit } from '../ip-rate-limit'
import { pluginRoutes } from '../../routes/plugin'
import { sourceRoutes } from '../../routes/source'
import { clearSourceRateLimits } from '../source-rate-limit'
import { clearChaptersCooldown } from './guarded-ops'
import { cacheDelete } from '../ttl-cache'
import { sourceRegistry } from './source-registry'

describe('视频源防滥用方案 v2 端到端集成验收测试 (E2E)', () => {
  let app: Hono
  let mockAgent: MockAgent
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>

  before(() => {
    originalDispatcher = getGlobalDispatcher()
    mockAgent = new MockAgent()
    mockAgent.disableNetConnect()
    setGlobalDispatcher(mockAgent)

    // Mock cycani search API
    const cycaniPool = mockAgent.get('https://www.cycani.org')
    cycaniPool
      .intercept({ path: /^\/api\/videos\/search/, method: 'GET' })
      .reply(200, {
        data: [{ id: 101, title: 'EVA新世纪福音战士', name: 'EVA', slug: 'eva' }],
      })
      .persist()

    // Mock cycani detail/chapters
    cycaniPool
      .intercept({ path: /^\/api\/videos\/detail/, method: 'GET' })
      .reply(200, {
        data: {
          id: 101,
          name: 'EVA',
          playlists: [{ name: '默认线路', urls: ['第1集$https://play.com/1'] }],
        },
      })
      .persist()
  })

  after(() => {
    setGlobalDispatcher(originalDispatcher)
  })

  beforeEach(() => {
    clearSourceRateLimits()
    clearChaptersCooldown()

    // 在限次专项测试中，调大中间件 1s 门禁，专注测试业务层 1 分钟滑动窗口
    app = new Hono()
    app.use('*', ipAccessAndRateLimit({ apiLimitPerSec: 200, sourceLimitPerSec: 100, heavyLimitPerSec: 100 }))
    app.route('/api/plugin', pluginRoutes)
    app.route('/api/source', sourceRoutes)
  })

  // 1. 限次验收（方案第 8 节第 1 条）
  it('验收 1 [限次]: 同一 IP 连续请求不同关键词，第 16 次返回真实 HTTP 429 与 Retry-After', async () => {
    const testIp = '203.0.113.101'

    // 连续发送 15 次不同关键词搜索（模拟真实未命中缓存请求）
    for (let i = 1; i <= 15; i++) {
      const res = await app.request('/api/source/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({ source: 'cycani', keyword: `keyword_${i}` }),
      })
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('X-Cache'), 'MISS')
    }

    // 第 16 次不同关键词：必须触发每用户每源限次 (默认 15/min)
    const res16 = await app.request('/api/source/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ source: 'cycani', keyword: 'keyword_16' }),
    })

    assert.equal(res16.status, 429)
    assert.ok(Number(res16.headers.get('Retry-After')) > 0)
    const json = (await res16.json()) as { error: string; message: string; retryAfterSec: number }
    assert.equal(json.error, 'source_rate_limited')
    assert.match(json.message, /该视频源请求过于频繁/)
    assert.ok(json.retryAfterSec > 0)
  })

  // 2. 搜索忽略 refresh（方案第 8 节第 2 条）
  it('验收 2 [搜索忽略 refresh]: 同一关键词带 ?refresh=1 连发两次，第二次响应头必须为 X-Cache: HIT', async () => {
    const testIp = '203.0.113.102'

    // 第一次请求 (MISS)
    const res1 = await app.request('/api/source/search?refresh=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ source: 'cycani', keyword: '千与千寻' }),
    })
    assert.equal(res1.status, 200)
    assert.equal(res1.headers.get('X-Cache'), 'MISS')

    // 第二次请求（即便客户端显式带 refresh=1，服务端统一防护层也强制忽略并命中缓存）
    const res2 = await app.request('/api/source/search?refresh=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ source: 'cycani', keyword: '千与千寻' }),
    })
    assert.equal(res2.status, 200)
    assert.equal(res2.headers.get('X-Cache'), 'HIT')
  })

  // 3. 跨路径跨端共享缓存（方案第 8 节第 3 条）
  it('验收 3 [跨端共享缓存]: 先打 Web 路由，再打 App 路由，第二次必须命中了缓存且 pluginName 各自独立', async () => {
    const kw = 'EVA共享缓存测试'

    // 1. Web 客户端通过 /api/plugin/search 发起请求（携带前端的 rule.name）
    const webRes = await app.request('/api/plugin/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.103',
      },
      body: JSON.stringify({
        rule: { name: 'Web前端插件名字', version: '1.0.0', baseURL: 'https://cycani.org', searchURL: 'https://cycani.org' },
        keyword: kw,
      }),
    })
    assert.equal(webRes.status, 200)
    assert.equal(webRes.headers.get('X-Cache'), 'MISS')
    const webJson = (await webRes.json()) as { data: { pluginName: string } }
    assert.equal(webJson.data.pluginName, 'Web前端插件名字')

    // 2. 官方 App 客户端通过 /api/source/search 请求同一个源和关键词
    const appRes = await app.request('/api/source/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.104',
      },
      body: JSON.stringify({
        source: 'cycani',
        keyword: kw,
      }),
    })
    assert.equal(appRes.status, 200)
    // 核心验证：跨端命中同一份服务端共享缓存！
    assert.equal(appRes.headers.get('X-Cache'), 'HIT')
    const appJson = (await appRes.json()) as { data: { pluginName: string } }
    // 并且 App 路由返回的 pluginName 规范化为适配器名
    assert.equal(appJson.data.pluginName, '次元城动画')
  })

  // 4. 命中缓存不占额度（方案第 8 节第 4 条）
  it('验收 4 [命中缓存不占额度]: 先请求 1 次入缓存，随后连发 30 次必须全部 200 且不触发 429', async () => {
    const testIp = '203.0.113.105'

    // 第 1 次：MISS，进入缓存
    const r1 = await app.request('/api/source/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ source: 'cycani', keyword: '进击的巨人命中缓存测试' }),
    })
    assert.equal(r1.status, 200)
    assert.equal(r1.headers.get('X-Cache'), 'MISS')

    // 连续发 30 次相同的请求（远超 15 次/分上限）
    for (let i = 0; i < 30; i++) {
      const res = await app.request('/api/source/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ source: 'cycani', keyword: '进击的巨人命中缓存测试' }),
      })
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('X-Cache'), 'HIT')
    }
  })

  // 5. 选集 30 秒 refresh 冷却
  it('验收 5 [选集30秒刷新冷却]: 同一部番 30 秒内再次带 refresh 强制走缓存，换番剧不受影响', async () => {
    const testIp = '203.0.113.106'
    let chaptersCallCount = 0

    const origChapters = sourceRegistry.chapters
    sourceRegistry.chapters = async (src, url) => {
      chaptersCallCount++
      return {
        pluginName: src,
        roads: [{ name: '线路1', identifier: ['1'], data: ['/p/1'] }],
      }
    }

    try {
      const detailA = 'https://example.com/anime/detail-101'
      const detailB = 'https://example.com/anime/detail-202'

      // 1. 初次加载番剧 A 选集
      const r1 = await app.request('/api/source/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ source: 'cycani', url: detailA }),
      })
      assert.equal(r1.status, 200)
      assert.equal(r1.headers.get('X-Cache'), 'MISS')
      assert.equal(chaptersCallCount, 1)

      // 2. 点击“刷新选集”（30 秒内首次刷新，允许 bypass 穿透）
      const r2 = await app.request('/api/source/chapters?refresh=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ source: 'cycani', url: detailA }),
      })
      assert.equal(r2.status, 200)
      assert.equal(r2.headers.get('X-Cache'), 'MISS')
      assert.equal(chaptersCallCount, 2)

      // 3. 30 秒内再次狂按“刷新选集”（冷却生效，强制返回刚更新的缓存）
      const r3 = await app.request('/api/source/chapters?refresh=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ source: 'cycani', url: detailA }),
      })
      assert.equal(r3.status, 200)
      assert.equal(r3.headers.get('X-Cache'), 'HIT')
      assert.equal(chaptersCallCount, 2) // 没有请求源站

      // 4. 换一部新番剧 B 刷新选集（另一个 key，不受番剧 A 冷却影响）
      const r4 = await app.request('/api/source/chapters?refresh=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ source: 'cycani', url: detailB }),
      })
      assert.equal(r4.status, 200)
      assert.equal(r4.headers.get('X-Cache'), 'MISS')
      assert.equal(chaptersCallCount, 3)
    } finally {
      sourceRegistry.chapters = origChapters
    }
  })

  // 6. 篡改 rule.name 无法逃逸
  it('验收 6 [防改名逃逸]: 客户端即使每次篡改 rule.name 也共享同一个频控额度', async () => {
    const testIp = '203.0.113.107'

    // 连续发 15 次，即便客户端每次提交不同的 rule.name（如 fake_1, fake_2）
    for (let i = 1; i <= 15; i++) {
      const res = await app.request('/api/plugin/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({
          rule: { name: `fake_name_${i}`, version: '1.0.0', baseURL: 'https://cycani.org', searchURL: 'https://cycani.org' },
          keyword: `kw_${i}`,
        }),
      })
      assert.equal(res.status, 200)
    }

    // 第 16 次：即使用新的假名字 fake_name_16，服务端判定 upstreamKey 仍为 cycani，直接 429 拦截！
    const res16 = await app.request('/api/plugin/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({
        rule: { name: 'fake_name_16', version: '1.0.0', baseURL: 'https://cycani.org', searchURL: 'https://cycani.org' },
        keyword: 'kw_16',
      }),
    })
    assert.equal(res16.status, 429)
    const json = (await res16.json()) as { error: string }
    assert.equal(json.error, 'source_rate_limited')
  })

  // 7. /api/source 默认 10次/秒 QPS 门禁测试
  it('验收 7 [/api/source 独立 QPS 桶]: 1 秒内突发超过 10 次请求时触发入口 429 保护', async () => {
    // 实例化一个使用默认 10次/秒限频的 app
    const defaultRateApp = new Hono()
    defaultRateApp.use('*', ipAccessAndRateLimit()) // 默认 sourceLimitPerSec: 10
    defaultRateApp.route('/api/source', sourceRoutes)

    const testIp = '203.0.113.108'
    let allowedCount = 0
    let blockedCount = 0

    // 1 秒内突发发送 15 次请求
    for (let i = 1; i <= 15; i++) {
      const res = await defaultRateApp.request('/api/source/list', {
        method: 'GET',
        headers: { 'x-forwarded-for': testIp },
      })
      if (res.status === 200) {
        allowedCount++
      } else if (res.status === 429) {
        blockedCount++
      }
    }

    assert.equal(allowedCount, 10)
    assert.equal(blockedCount, 5)
  })

  // 8. 修复验证：伪造回环头 X-Forwarded-For: ::1 无法绕过限频
  it('验收 8 [防回环头伪造]: 客户端请求头伪造 X-Forwarded-For: ::1，第 16 次依然被 429 拦截', async () => {
    for (let i = 1; i <= 15; i++) {
      const res = await app.request('/api/source/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '::1' },
        body: JSON.stringify({ source: 'cycani', keyword: `spoof_kw_${i}` }),
      })
      assert.equal(res.status, 200)
    }

    // 第 16 次：由于回环豁免已彻底从视频源限流器移除，伪造 ::1 同样被拦截！
    const res16 = await app.request('/api/source/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '::1' },
      body: JSON.stringify({ source: 'cycani', keyword: 'spoof_kw_16' }),
    })
    assert.equal(res16.status, 429)
    const json = (await res16.json()) as { error: string }
    assert.equal(json.error, 'source_rate_limited')
  })

  // 9. 修复验证：429 攻击者发 refresh 无法驱逐已有缓存，且不消耗 30 秒冷却
  it('验收 9 [防缓存驱逐 DoS]: 被限流为 429 的请求带 refresh=1 时，旧缓存完好保留且不消耗冷却', async () => {
    const attackerIp = '203.0.113.199'
    const normalUserIp = '203.0.113.200'
    const detailUrl = 'https://example.com/anime/detail-anti-eviction'

    // 1. 正常用户预热选集，写入缓存
    const r1 = await app.request('/api/source/chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': normalUserIp },
      body: JSON.stringify({ source: 'cycani', url: detailUrl }),
    })
    assert.equal(r1.status, 200)
    assert.equal(r1.headers.get('X-Cache'), 'MISS')

    // 2. 攻击者消耗完自己的 15 次选集限额
    for (let i = 1; i <= 15; i++) {
      await app.request('/api/source/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': attackerIp },
        body: JSON.stringify({ source: 'cycani', url: `https://example.com/anime/fake-${i}` }),
      })
    }

    // 3. 攻击者发起恶意攻击：带 refresh=1 试图驱逐 detailUrl 的已有缓存
    const attackRes = await app.request('/api/source/chapters?refresh=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': attackerIp },
      body: JSON.stringify({ source: 'cycani', url: detailUrl }),
    })
    assert.equal(attackRes.status, 429) // 攻击者被 429 拦截

    // 4. 关键验证：正常用户再次访问 detailUrl，旧缓存完好无损，依然命中 HIT！
    const normalRes = await app.request('/api/source/chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': normalUserIp },
      body: JSON.stringify({ source: 'cycani', url: detailUrl }),
    })
    assert.equal(normalRes.status, 200)
    assert.equal(normalRes.headers.get('X-Cache'), 'HIT')

    // 5. 关键验证：未超限的正常用户带 refresh=1 依然可以成功穿透刷新，未被攻击者占用冷却
    const normalRefreshRes = await app.request('/api/source/chapters?refresh=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': normalUserIp },
      body: JSON.stringify({ source: 'cycani', url: detailUrl }),
    })
    assert.equal(normalRefreshRes.status, 200)
    assert.equal(normalRefreshRes.headers.get('X-Cache'), 'MISS')
  })
})
