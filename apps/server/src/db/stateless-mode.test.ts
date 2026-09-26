import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDatabaseActive,
  pluginSearchCache,
  pluginChaptersCache,
  kvCache,
  playStatsRepo,
  ipAccessRepo,
  bangumiDataRepo,
} from './index'

test('Stateless in-memory fallback mode (when DB is inactive)', async (t) => {
  await t.test('isDatabaseActive returns boolean reflecting database state', () => {
    // Under default test environment without explicit DB_ENABLED=true or active DB instance
    assert.equal(typeof isDatabaseActive(), 'boolean')
  })

  await t.test('pluginSearchCache returns null / no-op in stateless mode', () => {
    // In stateless mode without DB, search cache methods safely no-op
    pluginSearchCache.set('test:key', 'plugin', 'kw', 'hash', { pluginName: 'plugin', items: [] }, 60_000)
    assert.equal(pluginSearchCache.deleteByPlugin('plugin'), 0)
    assert.equal(pluginSearchCache.clearExpired(), 0)
    const stats = pluginSearchCache.getStats()
    assert.equal(typeof stats.totalEntries, 'number')
  })

  await t.test('pluginChaptersCache returns null / no-op in stateless mode', () => {
    pluginChaptersCache.set('test:chap', 'plugin', 'http://src', 'hash', { pluginName: 'plugin', roads: [] }, 60_000)
    assert.equal(pluginChaptersCache.deleteByPlugin('plugin'), 0)
    assert.equal(pluginChaptersCache.clearExpired(), 0)
    const stats = pluginChaptersCache.getStats()
    assert.equal(typeof stats.totalEntries, 'number')
  })

  await t.test('kvCache memory store works transparently', () => {
    // Set and get
    kvCache.set('system', 'test_key', 'hello_world')
    assert.equal(kvCache.get('system', 'test_key'), 'hello_world')

    // Key listing
    const keys = kvCache.keys('system')
    assert.ok(keys.includes('test_key'))

    // Expiration
    kvCache.set('system', 'expired_key', 'val', -1000)
    assert.equal(kvCache.get('system', 'expired_key'), null)

    // Delete
    assert.equal(kvCache.delete('system', 'test_key'), true)
    assert.equal(kvCache.get('system', 'test_key'), null)

    // Namespace deletion
    kvCache.set('temp_ns', 'k1', 1)
    kvCache.set('temp_ns', 'k2', 2)
    assert.equal(kvCache.deleteNamespace('temp_ns') >= 2, true)
    assert.equal(kvCache.keys('temp_ns').length, 0)
  })

  await t.test('playStatsRepo memory fallback records and retrieves counts', () => {
    const r1 = playStatsRepo.recordPlay(99001, 1)
    assert.ok(r1.totalPlayCount >= 1)

    const r2 = playStatsRepo.recordPlay(99001, 2)
    assert.ok(r2.totalPlayCount >= 2)

    const stats = playStatsRepo.getPlayStats(99001)
    assert.equal(stats.bangumiId, 99001)
    assert.ok(stats.totalPlayCount >= 2)

    const top = playStatsRepo.getTopPlayed(10)
    assert.ok(Array.isArray(top))
    const found = top.find((item) => item.bangumiId === 99001)
    assert.ok(found)
  })

  await t.test('ipAccessRepo safe no-op in stateless mode', () => {
    // Should not throw or crash
    ipAccessRepo.recordHit('192.168.1.100')
    ipAccessRepo.recordHitBatchSync('192.168.1.100', 5)
    const traffic = ipAccessRepo.getGlobalTraffic()
    assert.equal(typeof traffic.totalHits, 'number')
  })

  await t.test('bangumiDataRepo safe fallbacks in stateless mode', () => {
    assert.equal(typeof bangumiDataRepo.count(), 'number')
    // Batch upsert does not throw
    bangumiDataRepo.batchUpsert([])
  })
})

test('Stateful persistence mode (when database instance is active)', async (t) => {
  const { getDatabase, initSchema, closeDatabase } = await import('./index')
  const db = getDatabase({ path: ':memory:', wal: false })
  initSchema(db)

  await t.test('isDatabaseActive reports true with active db', () => {
    assert.equal(isDatabaseActive(), true)
  })

  await t.test('pluginSearchCache persists into sqlite', () => {
    pluginSearchCache.set('p:search:1', 'p1', 'anime', 'h1', { pluginName: 'p1', items: [{ name: 'A', src: '/a' }] }, 60_000)
    const hit = pluginSearchCache.get('p:search:1')
    assert.ok(hit)
    assert.equal(hit.pluginName, 'p1')
    assert.equal(hit.items.length, 1)

    // Direct SQLite table check
    const row = db.prepare('SELECT key FROM plugin_search_cache WHERE key = ?').get('p:search:1')
    assert.ok(row)

    pluginSearchCache.delete('p:search:1')
    assert.equal(pluginSearchCache.get('p:search:1'), null)
  })

  await t.test('kvCache persists into sqlite', () => {
    kvCache.set('ns_db', 'k_db', { hello: 'world' }, 60_000)
    const val = kvCache.get<{ hello: string }>('ns_db', 'k_db')
    assert.deepEqual(val, { hello: 'world' })

    const row = db.prepare('SELECT value FROM kv_cache WHERE namespace = ? AND key = ?').get('ns_db', 'k_db') as { value: string }
    assert.ok(row)
    assert.ok(row.value.includes('hello'))

    kvCache.delete('ns_db', 'k_db')
    assert.equal(kvCache.get('ns_db', 'k_db'), null)
  })

  closeDatabase()
})

