import assert from 'node:assert/strict'
import { parseBilibiliInput } from '../packages/shared/src/danmaku'
import { bilibiliDanmakuRoutes } from '../apps/server/src/routes/bilibili-danmaku'

async function runTests() {
  console.log('🧪 开始测试 B 站多格式弹幕导入解析器与路由...')

  // 1. 测试 parseBilibiliInput 各种输入格式解析
  console.log('\n--- 1. 测试 parseBilibiliInput 格式解析 ---')

  const testCases = [
    {
      input: 'https://www.bilibili.com/bangumi/play/ep86012',
      expected: { type: 'ep', epId: 86012 },
    },
    {
      input: 'https://www.bilibili.com/bangumi/play/ep86012?from_spmid=666.25',
      expected: { type: 'ep', epId: 86012 },
    },
    {
      input: 'ep86012',
      expected: { type: 'ep', epId: 86012 },
    },
    {
      input: 'https://www.bilibili.com/bangumi/play/ss28277',
      expected: { type: 'ss', seasonId: 28277 },
    },
    {
      input: 'ss28277',
      expected: { type: 'ss', seasonId: 28277 },
    },
    {
      input: 'https://www.bilibili.com/video/BV1TT4y1g77n',
      expected: { type: 'bv', bvid: 'BV1TT4y1g77n' },
    },
    {
      input: 'BV1TT4y1g77n',
      expected: { type: 'bv', bvid: 'BV1TT4y1g77n' },
    },
    {
      input: 'https://www.bilibili.com/video/BV1TT4y1g77n?p=3',
      expected: { type: 'bv', bvid: 'BV1TT4y1g77n', page: 3 },
    },
    {
      input: 'https://www.bilibili.com/video/av925796497',
      expected: { type: 'av', aid: 925796497 },
    },
    {
      input: 'av925796497',
      expected: { type: 'av', aid: 925796497 },
    },
    {
      input: 'https://b23.tv/ep86012',
      expected: { type: 'ep', epId: 86012 },
    },
    {
      input: 'https://b23.tv/BV1TT4y1g77n',
      expected: { type: 'bv', bvid: 'BV1TT4y1g77n' },
    },
    {
      input: 'https://b23.tv/AbCdEf',
      expected: { type: 'b23', url: 'https://b23.tv/AbCdEf' },
    },
  ]

  for (const tc of testCases) {
    const res = parseBilibiliInput(tc.input)
    assert.ok(res, `输入 "${tc.input}" 应该能被成功解析`)
    assert.equal(res.type, tc.expected.type, `类型应匹配: ${tc.expected.type}`)
    if ('epId' in tc.expected) {
      assert.equal((res as { epId: number }).epId, tc.expected.epId)
    }
    if ('seasonId' in tc.expected) {
      assert.equal((res as { seasonId: number }).seasonId, tc.expected.seasonId)
    }
    if ('bvid' in tc.expected) {
      assert.equal((res as { bvid: string }).bvid, tc.expected.bvid)
    }
    if ('aid' in tc.expected) {
      assert.equal((res as { aid: number }).aid, tc.expected.aid)
    }
    if ('page' in tc.expected) {
      assert.equal(res.page, tc.expected.page)
    }
    console.log(`  ✓ 成功解析: ${tc.input} -> ${res.type}`)
  }

  // 2. 测试服务端真实接口调用
  console.log('\n--- 2. 测试服务端路由对真实 B 站资源的拉取 ---')

  // 测试 2.1: 番剧 ep 链接
  console.log('测试 2.1: 请求 ep86012 (浪客剑心 追忆篇)')
  const epRes = await bilibiliDanmakuRoutes.request(
    'http://localhost/bilibili?input=' +
      encodeURIComponent('https://www.bilibili.com/bangumi/play/ep86012'),
  )
  assert.equal(epRes.status, 200, `ep 响应状态应为 200 (实际 ${epRes.status})`)
  const epJson = (await epRes.json()) as {
    data: unknown[]
    count: number
    meta: { title: string; part: string; cid: number; epid?: number }
  }
  assert.ok(epJson.data.length > 0, '应该成功拉取到弹幕')
  assert.ok(epJson.meta.title.includes('浪客剑心'), '标题应包含浪客剑心')
  assert.equal(epJson.meta.epid, 86012, 'meta.epid 应为 86012')
  console.log(
    `  ✓ ep86012 拉取成功: ${epJson.meta.title} · ${epJson.meta.part} · 共 ${epJson.count} 条弹幕`,
  )

  // 测试 2.2: 番剧 ss 链接
  console.log('测试 2.2: 请求 ss28277 (守护解放西)')
  const ssRes = await bilibiliDanmakuRoutes.request(
    'http://localhost/bilibili?input=' +
      encodeURIComponent('https://www.bilibili.com/bangumi/play/ss28277') +
      '&p=1',
  )
  assert.equal(ssRes.status, 200, `ss 响应状态应为 200 (实际 ${ssRes.status})`)
  const ssJson = (await ssRes.json()) as {
    data: unknown[]
    count: number
    meta: { title: string; part: string; cid: number; seasonId?: number }
  }
  assert.ok(ssJson.data.length > 0, '应该成功拉取到弹幕')
  assert.ok(ssJson.meta.title.includes('守护解放西'), '标题应包含守护解放西')
  assert.equal(ssJson.meta.seasonId, 28277, 'meta.seasonId 应为 28277')
  console.log(
    `  ✓ ss28277 拉取成功: ${ssJson.meta.title} · ${ssJson.meta.part} · 共 ${ssJson.count} 条弹幕`,
  )

  // 测试 2.3: 普通视频 BV 链接
  console.log('测试 2.3: 请求 BV1TT4y1g77n (浪客剑心 第1话)')
  const bvRes = await bilibiliDanmakuRoutes.request(
    'http://localhost/bilibili?input=BV1TT4y1g77n',
  )
  assert.equal(bvRes.status, 200, `BV 响应状态应为 200 (实际 ${bvRes.status})`)
  const bvJson = (await bvRes.json()) as {
    data: unknown[]
    count: number
    meta: { title: string; bvid?: string }
  }
  assert.ok(bvJson.data.length > 0, '应该成功拉取到弹幕')
  assert.equal(bvJson.meta.bvid, 'BV1TT4y1g77n')
  console.log(
    `  ✓ BV1TT4y1g77n 拉取成功: ${bvJson.meta.title} · 共 ${bvJson.count} 条弹幕`,
  )

  // 测试 2.4: 普通视频 av 链接
  console.log('测试 2.4: 请求 av925796497')
  const avRes = await bilibiliDanmakuRoutes.request(
    'http://localhost/bilibili?input=av925796497',
  )
  assert.equal(avRes.status, 200, `av 响应状态应为 200 (实际 ${avRes.status})`)
  const avJson = (await avRes.json()) as {
    data: unknown[]
    count: number
    meta: { title: string }
  }
  assert.ok(avJson.data.length > 0, '应该成功拉取到弹幕')
  console.log(
    `  ✓ av925796497 拉取成功: ${avJson.meta.title} · 共 ${avJson.count} 条弹幕`,
  )

  // 测试 2.5: 短链接 b23.tv
  console.log('测试 2.5: 请求 b23 短链 https://b23.tv/ep86012')
  const b23Res = await bilibiliDanmakuRoutes.request(
    'http://localhost/bilibili?input=' +
      encodeURIComponent('https://b23.tv/ep86012'),
  )
  assert.equal(b23Res.status, 200, `b23 响应状态应为 200 (实际 ${b23Res.status})`)
  const b23Json = (await b23Res.json()) as {
    data: unknown[]
    count: number
    meta: { title: string }
  }
  assert.ok(b23Json.data.length > 0, '应该成功拉取到弹幕')
  console.log(
    `  ✓ b23 短链拉取成功: ${b23Json.meta.title} · 共 ${b23Json.count} 条弹幕`,
  )

  console.log('\n🎉 B 站多格式弹幕导入所有测试项全部通过！')
}

runTests().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
