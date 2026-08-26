import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initSchema } from '../apps/server/src/db/schema'
import { ipAccessRepo, getLocalTodayDateStr } from '../apps/server/src/db/repositories/ip-access'
import { isLoopbackIp } from '../apps/server/src/lib/private-host'
import { getDatabase } from '../apps/server/src/db/connection'

async function runTests() {
  console.log('🧪 开始测试 IP 访问统计 (IP Access Repository - 微合批、本地/回环地址剔除与边界测试)...')

  const db = getDatabase({ path: ':memory:' })
  initSchema(db)

  // 1. 本地/回环 IP 判定测试 (isLoopbackIp)
  console.log('1. 测试本地回环 IP (127.0.0.1, ::1, localhost, 127.*) 识别与剔除')
  assert.equal(isLoopbackIp('127.0.0.1'), true)
  assert.equal(isLoopbackIp('127.0.0.2'), true)
  assert.equal(isLoopbackIp('127.255.255.255'), true)
  assert.equal(isLoopbackIp('::1'), true)
  assert.equal(isLoopbackIp('[::1]'), true)
  assert.equal(isLoopbackIp('localhost'), true)
  assert.equal(isLoopbackIp('0.0.0.0'), true)
  assert.equal(isLoopbackIp('::'), true)
  assert.equal(isLoopbackIp('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackIp(''), true)
  assert.equal(isLoopbackIp(undefined), true)
  assert.equal(isLoopbackIp(null), true)
  assert.equal(isLoopbackIp('203.0.113.195'), false)
  assert.equal(isLoopbackIp('198.51.100.88'), false)
  assert.equal(isLoopbackIp('1.1.1.1'), false)

  // 2. 本地时区格式测试 (YYYY-MM-DD)
  console.log('2. 测试本地时区自然日格式化')
  const dateStr = getLocalTodayDateStr()
  assert.match(dateStr, /^\d{4}-\d{2}-\d{2}$/, '应该符合 YYYY-MM-DD 格式')

  // 3. 本地回环 IP 调用 recordHit 不应写入数据库
  console.log('3. 测试 127.0.0.1 / ::1 / localhost 等调用 recordHit 不记录入库')
  ipAccessRepo.recordHit('127.0.0.1')
  ipAccessRepo.recordHit('::1')
  ipAccessRepo.recordHit('localhost')
  ipAccessRepo.recordHit('127.0.0.99')
  await new Promise((r) => setTimeout(r, 20))

  assert.equal(ipAccessRepo.getIpAccess('127.0.0.1'), null, '127.0.0.1 不应被记录')
  assert.equal(ipAccessRepo.getIpAccess('::1'), null, '::1 不应被记录')
  assert.equal(ipAccessRepo.getIpAccess('localhost'), null, 'localhost 不应被记录')
  assert.equal(ipAccessRepo.getIpAccess('127.0.0.99'), null, '127.0.0.99 不应被记录')

  // 4. 同一真实外部 IP 瞬间并发 10 次调用微合并测试
  console.log('4. 测试同一真实外部 IP 瞬间并发 10 次调用，合并为单次落盘')
  const concurrentIp = '198.51.100.88'
  for (let i = 0; i < 10; i++) {
    ipAccessRepo.recordHit(concurrentIp)
  }

  // 等待一个微任务周期 (setImmediate)
  await new Promise((r) => setTimeout(r, 20))

  const statConcurrent = ipAccessRepo.getIpAccess(concurrentIp)
  assert.ok(statConcurrent)
  assert.equal(statConcurrent?.total_hits, 10, '10 次并发请求应合并累加为 10')
  assert.equal(statConcurrent?.today_hits, 10, '今日访问应累加为 10')

  // 5. 跨天场景测试：模拟昨天有访问，今天再次访问时 today_hits 重置为 1，total_hits 累加
  console.log('5. 测试跨天时 today_hits 自动重置与 total_hits 累计')
  const crossDayIp = '198.51.100.99'
  const yesterdayStr = '2026-08-25'
  const todayStr = '2026-08-26'

  // 模拟昨天访问 5 次
  ipAccessRepo.recordHitBatchSync(crossDayIp, 5, yesterdayStr)
  const yesterdayStat = ipAccessRepo.getIpAccess(crossDayIp)
  assert.equal(yesterdayStat?.total_hits, 5)
  assert.equal(yesterdayStat?.today_hits, 5)
  assert.equal(yesterdayStat?.last_date, yesterdayStr)

  // 模拟今天新访问 2 次
  ipAccessRepo.recordHitBatchSync(crossDayIp, 2, todayStr)
  const todayStat = ipAccessRepo.getIpAccess(crossDayIp)
  assert.equal(todayStat?.total_hits, 7, '全站总访问应累计为 7 (5+2)')
  assert.equal(todayStat?.today_hits, 2, '跨天后今日访问应重置并累加为 2')
  assert.equal(todayStat?.last_date, todayStr)

  // 6. 非法入参及异常安全性测试
  console.log('6. 测试非法入参与容错性')
  // @ts-expect-error test illegal input
  ipAccessRepo.recordHit(null)
  // @ts-expect-error test illegal input
  ipAccessRepo.recordHit('')
  // @ts-expect-error test illegal input
  ipAccessRepo.recordHit('   ')

  console.log('✅ IP 访问统计全部微合批、本地回环过滤与边界测试 100% 通过！')
}

runTests().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
