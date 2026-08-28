import assert from 'node:assert/strict'
import {
  parseBilibiliInput,
  deduplicateDanmakuIncremental,
  type DanmakuComment,
} from '../packages/shared/src/danmaku'
import { initDatabase } from '../apps/server/src/db'
import {
  initBangumiDataMapping,
  getAnimeSitesByBangumiId,
  getBilibiliTargetByBangumiId,
} from '../apps/server/src/lib/bangumi-data'
import { bilibiliDanmakuRoutes } from '../apps/server/src/routes/bilibili-danmaku'
import { dandanGet } from '../apps/server/src/lib/dandan'

async function runAutoSyncTests() {
  console.log('🧪 开始测试 B 站弹幕自动映射与智能去重合并体系...')

  // 1. 初始化数据库与 bangumi-data 跨平台映射
  console.log('\n--- 1. 测试数据库与 bangumi-data 映射初始化 ---')
  initDatabase()
  initBangumiDataMapping()

  // 验证 1728 (浪客剑心 追忆篇)
  const kenshin = getAnimeSitesByBangumiId(1728)
  assert.ok(kenshin, '应该成功在映射库中查到 bangumiId=1728 (浪客剑心)')
  assert.ok(kenshin.sites.bilibili, '浪客剑心应包含 bilibili 站点 ID')
  console.log(`  ✓ 查到 1728: ${kenshin.title} | 站点数: ${Object.keys(kenshin.sites).length}`)
  console.log('    支持站点样本:', Object.keys(kenshin.sites))

  const target = getBilibiliTargetByBangumiId(1728)
  assert.ok(target, '应该拿到 B 站目标')
  assert.equal(target.targetId, '28229015', '目标 ID 应为 28229015')
  console.log(`  ✓ 成功解析 B 站目标: ID=${target.targetId}, isHkMoTw=${target.isHkMoTw}`)

  // 2. 测试服务端 /bilibili?bgm=1728&p=1 端到端拉取
  console.log('\n--- 2. 测试服务端通过 bgm ID 自动映射拉取 B 站弹幕 ---')
  const res = await bilibiliDanmakuRoutes.request(
    'http://localhost/bilibili?bgm=1728&p=1'
  )
  assert.equal(res.status, 200, `响应状态应为 200 (实际 ${res.status})`)
  const json: any = await res.json()
  assert.ok(json.data && json.data.length > 0, '应该成功拉取到弹幕')
  assert.equal(json.meta.epid, 86012, 'meta.epid 应自动解析为 86012')
  assert.equal(json.meta.seasonId, 3578, 'meta.seasonId 应自动解析为 3578')
  assert.equal(json.meta.cid, 195737743, 'meta.cid 应为 195737743')
  assert.ok(json.meta.title.includes('浪客剑心'), '标题应包含浪客剑心')
  console.log(
    `  ✓ 通过 bgm=1728 成功自动拉取到: ${json.meta.title} · ${json.meta.part} · 共 ${json.count} 条弹幕`
  )

  // 3. 测试弹弹play 与 B 站弹幕的 O(1) 智能去重合并
  console.log('\n--- 3. 测试弹弹play 与 B 站弹幕智能去重合并算法 ---')
  const dandanRes: any = await dandanGet('/api/v2/comment/730001', {
    withRelated: 'true',
    chConvert: '1',
  })
  const dandanList: DanmakuComment[] = (dandanRes?.comments || []).map((c: any) => {
    const parts = (c.p || '').split(',')
    return {
      mode: 'rtl',
      text: c.m,
      time: parseFloat(parts[0]) || 0,
      senderHash: parts[3] || undefined,
      source: 'dandan',
    }
  })

  const biliList: DanmakuComment[] = json.data
  console.log(`  弹弹原始数量: ${dandanList.length} 条`)
  console.log(`  B 站原始数量: ${biliList.length} 条`)

  const { incremental, duplicatesCount } = deduplicateDanmakuIncremental(
    dandanList,
    biliList
  )
  assert.ok(duplicatesCount > 0, '应该成功识别出重复弹幕')
  assert.ok(incremental.length > 3000, '应该保留绝大部分 B 站独有弹幕')
  console.log(
    `  ✓ 去重成功: 识别并过滤重复弹幕 ${duplicatesCount} 条，提取 B 站纯增量 ${incremental.length} 条`
  )
  console.log(
    `  ✓ 最终去重合并总弹幕量: ${dandanList.length + incremental.length} 条（无重影）`
  )

  // 4. 测试 parseBilibiliInput 对 md 和 bgm 格式的支持
  console.log('\n--- 4. 测试 parseBilibiliInput 对新格式的支持 ---')
  const mdParsed = parseBilibiliInput('https://www.bilibili.com/bangumi/media/md28229015')
  assert.equal(mdParsed?.type, 'md')
  assert.equal((mdParsed as any)?.mediaId, 28229015)

  const bgmParsed = parseBilibiliInput('bgm1728')
  assert.equal(bgmParsed?.type, 'bgm')
  assert.equal((bgmParsed as any)?.bangumiId, 1728)
  console.log('  ✓ md28229015 与 bgm1728 输入格式均成功被识别')

  console.log('\n🎉 所有 B 站弹幕自动映射与智能去重测试项全部通过！')
}

runAutoSyncTests().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
