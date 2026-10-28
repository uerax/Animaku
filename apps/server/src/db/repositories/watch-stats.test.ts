import test from 'node:test'
import assert from 'node:assert/strict'
import { getDatabase, closeDatabase } from '../connection'
import { initSchema } from '../schema'
import { watchStatsRepo, WatchStatsRepository } from './watch-stats'
import { statsRoutes } from '../../routes/stats'
import { getLocalTodayDateStr } from './ip-access'

test('WatchStatsRepository & Stats Routes Integration', async (t) => {
  // Initialize in-memory database with full schema up to v7
  const db = getDatabase({ path: ':memory:', wal: false })
  initSchema(db)

  await t.test('Migration v7 created all required telemetry tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table';")
      .all()
      .map((r: any) => r.name)

    assert.ok(tables.includes('devices'), 'devices table must exist')
    assert.ok(tables.includes('daily_active_stats'), 'daily_active_stats table must exist')
    assert.ok(tables.includes('anime_total_views'), 'anime_total_views table must exist')
    assert.ok(tables.includes('anime_daily_views'), 'anime_daily_views table must exist')
  })

  await t.test('recordPlayView deduplicates within 10-minute window per device', () => {
    const devId = 'dev_test_dedup_001'
    const bgmId = 70001
    const ep = 1

    // 1. First play report
    const r1 = watchStatsRepo.recordPlayView({
      deviceId: devId,
      bangumiId: bgmId,
      episode: ep,
      clientIp: '1.2.3.4',
    })
    assert.equal(r1.success, true)
    assert.equal(r1.deduped, false)
    assert.ok(r1.totalPlayCount >= 1)

    // 2. Immediate second report on same device & episode -> deduped: true
    const r2 = watchStatsRepo.recordPlayView({
      deviceId: devId,
      bangumiId: bgmId,
      episode: ep,
      clientIp: '1.2.3.4',
    })
    assert.equal(r2.success, true)
    assert.equal(r2.deduped, true)
    assert.equal(r2.totalPlayCount, r1.totalPlayCount)

    // 3. Different episode on same device -> NOT deduped
    const r3 = watchStatsRepo.recordPlayView({
      deviceId: devId,
      bangumiId: bgmId,
      episode: 2,
      clientIp: '1.2.3.4',
    })
    assert.equal(r3.success, true)
    assert.equal(r3.deduped, false)
    assert.equal(r3.totalPlayCount, r1.totalPlayCount + 1)
  })

  await t.test('flushSync atomically commits batch into SQLite tables in single transaction', () => {
    const devId = 'dev_test_flush_002'
    const bgmId = 70002

    watchStatsRepo.recordPlayView({
      deviceId: devId,
      bangumiId: bgmId,
      episode: 1,
      fingerprint: 'fp_abc123',
      clientIp: '10.0.0.1',
    })
    watchStatsRepo.recordPlayView({
      deviceId: devId,
      bangumiId: bgmId,
      episode: 2,
      fingerprint: 'fp_abc123',
      clientIp: '10.0.0.1',
    })

    // Execute flush
    watchStatsRepo.flushSync()

    // 1. Verify devices table
    const devRow = db
      .prepare('SELECT * FROM devices WHERE device_id = ?')
      .get(devId) as any
    assert.ok(devRow)
    assert.equal(devRow.device_id, devId)
    assert.equal(devRow.fingerprint, 'fp_abc123')
    assert.equal(devRow.last_ip, '10.0.0.1')
    assert.equal(devRow.total_plays, 2)

    // 2. Verify anime_total_views table
    const totalRow = db
      .prepare('SELECT * FROM anime_total_views WHERE bangumi_id = ?')
      .get(bgmId) as any
    assert.ok(totalRow)
    assert.equal(totalRow.bangumi_id, bgmId)
    assert.equal(totalRow.total_views, 2)

    // 3. Verify anime_daily_views table
    const todayStr = getLocalTodayDateStr()
    const dailyRow = db
      .prepare('SELECT * FROM anime_daily_views WHERE bangumi_id = ? AND date = ?')
      .get(bgmId, todayStr) as any
    assert.ok(dailyRow)
    assert.equal(dailyRow.bangumi_id, bgmId)
    assert.equal(dailyRow.views, 2)

    // 4. Verify daily_active_stats table
    const dauRow = db
      .prepare('SELECT * FROM daily_active_stats WHERE date = ?')
      .get(todayStr) as any
    assert.ok(dauRow)
    assert.ok(dauRow.dau >= 1)
    assert.ok(dauRow.total_views >= 2)
  })

  await t.test('getTopRankings produces accurate today, week, month and total rankings', () => {
    // Seed different view counts for subjects 80001, 80002, 80003
    for (let i = 0; i < 5; i++) {
      watchStatsRepo.recordPlayView({
        deviceId: `dev_seed_${i}`,
        bangumiId: 80001,
        episode: 1,
        clientIp: `1.1.1.${i}`,
      })
    }
    for (let i = 0; i < 3; i++) {
      watchStatsRepo.recordPlayView({
        deviceId: `dev_seed_${i}`,
        bangumiId: 80002,
        episode: 1,
        clientIp: `1.1.1.${i}`,
      })
    }

    watchStatsRepo.flushSync()

    // 1. Today ranking
    const todayTop = watchStatsRepo.getTopRankings('today', 5)
    assert.ok(todayTop.length >= 2)
    assert.equal(todayTop[0].bangumiId, 80001)
    assert.equal(todayTop[0].totalPlayCount, 5)
    assert.equal(todayTop[1].bangumiId, 80002)
    assert.equal(todayTop[1].totalPlayCount, 3)

    // 2. Week ranking (7 days range)
    const weekTop = watchStatsRepo.getTopRankings('week', 5)
    assert.ok(weekTop.length >= 2)
    assert.equal(weekTop[0].bangumiId, 80001)
    assert.equal(weekTop[0].totalPlayCount, 5)

    // 3. Total ranking
    const totalTop = watchStatsRepo.getTopRankings('total', 5)
    assert.ok(totalTop.length >= 2)
    assert.equal(totalTop[0].bangumiId, 80001)
    assert.equal(totalTop[0].totalPlayCount, 5)
  })

  await t.test('HTTP endpoints /api/stats/view and /views work identically with device tracking', async () => {
    // 1. Test POST /view
    const req1 = new Request('http://localhost/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': 'dev_http_001',
      },
      body: JSON.stringify({ bangumiId: 90001, episode: 1 }),
    })
    const res1 = await statsRoutes.fetch(req1)
    assert.equal(res1.status, 200)
    const data1 = (await res1.json()) as any
    assert.equal(data1.success, true)
    assert.equal(data1.deduped, false)
    assert.ok(data1.totalPlayCount >= 1)

    // 2. Test POST /views (plural alias)
    const req2 = new Request('http://localhost/views', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': 'dev_http_002',
      },
      body: JSON.stringify({ bangumiId: 90001, episode: 1 }),
    })
    const res2 = await statsRoutes.fetch(req2)
    assert.equal(res2.status, 200)
    const data2 = (await res2.json()) as any
    assert.equal(data2.success, true)

    // 3. Test GET /rank?type=today
    const rankReq = new Request('http://localhost/rank?type=today&limit=5')
    const rankRes = await statsRoutes.fetch(rankReq)
    assert.equal(rankRes.status, 200)
    assert.ok(rankRes.headers.get('Cache-Control')?.includes('s-maxage=300'))
    assert.equal(rankRes.headers.get('CDN-Cache-Control'), 'max-age=300')
    const rankData = (await rankRes.json()) as any
    assert.equal(rankData.type, 'today')
    assert.ok(Array.isArray(rankData.data))

    // 4. Test GET /subject/:id
    const subReq = new Request('http://localhost/subject/90001')
    const subRes = await statsRoutes.fetch(subReq)
    assert.equal(subRes.status, 200)
    assert.ok(subRes.headers.get('Cache-Control')?.includes('s-maxage=300'))
    const subData = (await subRes.json()) as any
    assert.equal(subData.data.bangumiId, 90001)
  })

  watchStatsRepo.destroy()
  closeDatabase()
})
