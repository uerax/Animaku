import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PluginMeta } from '@animaku/shared'
import { mergeOrderWithNewPlugins, seedFromDefaults } from './plugins'

function makeMockPlugin(name: string, weight: number): PluginMeta {
  return {
    id: `${name}-builtin`,
    name,
    weight,
    enabled: true,
    baseURL: `https://${name}.com`,
    version: '1.0',
    importedAt: Date.now(),
    source: 'builtin',
  }
}

test('mergeOrderWithNewPlugins: returns empty array when input order is empty', () => {
  const plugins = [makeMockPlugin('bimi', 61), makeMockPlugin('omofun', 50)]
  assert.deepEqual(mergeOrderWithNewPlugins([], plugins), [])
})

test('mergeOrderWithNewPlugins: leaves order unchanged when all plugins already present', () => {
  const plugins = [makeMockPlugin('xifan-next', 61), makeMockPlugin('cycani', 59)]
  const order = ['cycani', 'xifan-next']
  assert.deepEqual(mergeOrderWithNewPlugins(order, plugins), ['cycani', 'xifan-next'])
})

test('mergeOrderWithNewPlugins: inserts new high-weight plugin before lower-weight plugins', () => {
  const plugins = [
    makeMockPlugin('xifan-next', 61),
    makeMockPlugin('bimi', 61),
    makeMockPlugin('cycani', 59),
    makeMockPlugin('omofun', 50),
  ]
  // Old order missing 'bimi'
  const oldOrder = ['xifan-next', 'cycani', 'omofun']
  const merged = mergeOrderWithNewPlugins(oldOrder, plugins)

  // 'bimi' (weight 61) vs 'xifan-next' (weight 61): 'bimi' < 'xifan-next' alphabetically, so bimi is inserted at index 0
  assert.deepEqual(merged, ['bimi', 'xifan-next', 'cycani', 'omofun'])
})

test('mergeOrderWithNewPlugins: inserts middle-weight plugin at appropriate weight slot', () => {
  const plugins = [
    makeMockPlugin('xifan-next', 61),
    makeMockPlugin('cycani', 59),
    makeMockPlugin('animoe', 57),
    makeMockPlugin('omofun', 50),
  ]
  // Old order missing 'animoe' (weight 57)
  const oldOrder = ['xifan-next', 'cycani', 'omofun']
  const merged = mergeOrderWithNewPlugins(oldOrder, plugins)

  // 'animoe' (57) should be after 'cycani' (59) and before 'omofun' (50)
  assert.deepEqual(merged, ['xifan-next', 'cycani', 'animoe', 'omofun'])
})

test('seedFromDefaults: marks tvtfun as disabled by default and other builtins enabled', () => {
  const defaults = seedFromDefaults()
  const tvtfun = defaults.find((p) => p.name.toLowerCase() === 'tvtfun')
  assert.ok(tvtfun, 'tvtfun should be present in default plugins')
  assert.equal(tvtfun.enabled, false, 'tvtfun must be disabled by default')

  const cycani = defaults.find((p) => p.name.toLowerCase() === 'cycani')
  assert.ok(cycani, 'cycani should be present in default plugins')
  assert.equal(cycani.enabled, true, 'cycani should be enabled by default')
})

