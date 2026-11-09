/**
 * huazidm.com (花子动漫) dedicated adapter test suite.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { PluginRule } from '@animaku/shared'
import {
  isHuaziRule,
  searchHuazi,
  chaptersHuazi,
  resolveHuazi,
} from './huazi'
import { huaziAdapter } from './source/adapters/huazi'
import { SourceRegistry } from './source/source-registry'

const HUAZI_RULE: PluginRule = {
  name: 'huazi',
  version: '1.0.0',
  baseURL: 'https://www.huazidm.com',
}

test('huazi: rule recognition and adapter metadata', () => {
  assert.equal(isHuaziRule({ name: 'huazi', version: '1.0.0', baseURL: 'https://www.huazidm.com' }), true)
  assert.equal(isHuaziRule({ name: 'huazidm', version: '1.0.0', baseURL: 'https://www.huazidm.com' }), true)
  assert.equal(isHuaziRule({ name: '花子动漫', version: '1.0.0', baseURL: 'https://www.huazidm.com' }), true)
  assert.equal(
    isHuaziRule({ name: 'custom', version: '1.0.0', baseURL: 'https://www.huazidm.com' }),
    true,
  )
  assert.equal(isHuaziRule({ name: 'other', version: '1.0.0', baseURL: 'https://other.com' }), false)

  assert.equal(huaziAdapter.id, 'huazi')
  assert.equal(huaziAdapter.name, '花子动漫')
  assert.equal(huaziAdapter.tier, 'tier_a')
  assert.ok(huaziAdapter.capabilities.allowedPorts?.includes(80))
  assert.ok(huaziAdapter.capabilities.allowedPorts?.includes(443))

  const registry = new SourceRegistry()
  const list = registry.listSources()
  assert.ok(list.some(s => s.id === 'huazi' && s.name === '花子动漫'))

  const foundById = registry.getAdapter('huazi')
  assert.ok(foundById)
  assert.equal(foundById.id, 'huazi')

  const foundByName = registry.getAdapter('花子动漫')
  assert.ok(foundByName)
  assert.equal(foundByName.id, 'huazi')

  const foundByAlias = registry.getAdapter('huazidm')
  assert.ok(foundByAlias)
  assert.equal(foundByAlias.id, 'huazi')
})

test('huazi: search, chapters (data & identifier), and direct stream resolve', async () => {
  // 1. 搜索测试
  const searchResult = await searchHuazi(HUAZI_RULE, '葬送的芙莉莲')
  assert.equal(searchResult.pluginName, 'huazi')
  assert.ok(searchResult.items.length > 0)

  const item = searchResult.items[0]
  assert.ok(item.name.length > 0)
  assert.ok(item.src.includes('/anime/'))

  // 2. 章节分集测试 (严格校验 Road 契约: data 为 URL 数组, identifier 为集数名数组)
  const chapterResult = await chaptersHuazi(HUAZI_RULE, item.src)
  assert.equal(chapterResult.pluginName, 'huazi')
  assert.ok(chapterResult.roads.length > 0)

  const firstRoad = chapterResult.roads[0]
  assert.ok(Array.isArray(firstRoad.data), 'road.data 必须为 URL 数组')
  assert.ok(Array.isArray(firstRoad.identifier), 'road.identifier 必须为集数名数组')
  assert.ok(firstRoad.data.length > 0, 'road.data 不得为空')
  assert.equal(firstRoad.data.length, firstRoad.identifier.length, 'data 与 identifier 长度必须一致')
  assert.ok(firstRoad.data[0].includes('/play/'))

  // 3. 播放直链解析测试
  const episodeUrl = firstRoad.data[0]
  const resolved = await resolveHuazi(HUAZI_RULE, episodeUrl)
  assert.ok(resolved.playUrl.startsWith('https://'), '播放直链必须为 https')
  assert.ok(resolved.format === 'mp4' || resolved.format === 'hls')

  // 4. SourceAdapter 契约测试
  const rawResolve = await huaziAdapter.resolve(episodeUrl)
  assert.ok(rawResolve.mediaUrl.startsWith('https://'))
  assert.ok(rawResolve.format === 'mp4' || rawResolve.format === 'hls')
})
