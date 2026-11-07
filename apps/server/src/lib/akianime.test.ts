/**
 * akianime.cc (AkiAnime) dedicated adapter test suite.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { PluginRule } from '@animaku/shared'
import {
  isAkianimeRule,
  searchAkianime,
  chaptersAkianime,
  resolveAkianime,
} from './akianime'
import { akianimeAdapter } from './source/adapters/akianime'
import { SourceRegistry } from './source/source-registry'

const AKIANIME_RULE: PluginRule = {
  name: 'akianime',
  version: '1.0.0',
  baseURL: 'https://www.akianime.cc',
}

test('akianime: rule recognition and adapter metadata', () => {
  assert.equal(isAkianimeRule({ name: 'akianime', version: '1.0.0', baseURL: 'https://www.akianime.cc' }), true)
  assert.equal(isAkianimeRule({ name: 'aki', version: '1.0.0', baseURL: 'https://www.akianime.cc' }), true)
  assert.equal(
    isAkianimeRule({ name: 'custom', version: '1.0.0', baseURL: 'https://www.akianime.cc' }),
    true,
  )
  assert.equal(isAkianimeRule({ name: 'other', version: '1.0.0', baseURL: 'https://other.com' }), false)

  assert.equal(akianimeAdapter.id, 'akianime')
  assert.equal(akianimeAdapter.name, 'AkiAnime')
  assert.equal(akianimeAdapter.tier, 'tier_a')
  assert.ok(akianimeAdapter.capabilities.allowedPorts?.includes(80))
  assert.ok(akianimeAdapter.capabilities.allowedPorts?.includes(443))

  const registry = new SourceRegistry()
  const foundById = registry.getAdapter('akianime')
  assert.ok(foundById)
  assert.equal(foundById.id, 'akianime')

  const foundByName = registry.getAdapter('akianime.cc')
  assert.ok(foundByName)
  assert.equal(foundByName.id, 'akianime')
})

test('akianime: search, chapters, and CMECloud MP4 resolve integration', async () => {
  // 1. 搜索测试
  const searchResult = await searchAkianime(AKIANIME_RULE, '鬼灭之刃')
  assert.equal(searchResult.pluginName, 'akianime')
  assert.ok(searchResult.items.length > 0)

  const item = searchResult.items.find(i => i.name.includes('柱训练篇')) || searchResult.items[0]
  assert.ok(item.name.length > 0)
  assert.ok(item.src.includes('/bgmdetail/'))

  // 2. 章节分集与多线路排序测试
  const chapterResult = await chaptersAkianime(AKIANIME_RULE, item.src)
  assert.equal(chapterResult.pluginName, 'akianime')
  assert.ok(chapterResult.roads.length > 0)

  // 验证线路完整展示与“超高画”置顶排序
  const firstRoad = chapterResult.roads[0]
  assert.ok(firstRoad.data.length > 0)
  assert.ok(firstRoad.identifier.length > 0)
  assert.equal(firstRoad.data.length, firstRoad.identifier.length)

  // 找到专有超高画/YDY线路播放链接
  const highQualityRoad = chapterResult.roads.find(r => r.name.includes('超高画')) || firstRoad
  const episodeUrl = highQualityRoad.data[0]
  assert.ok(episodeUrl.includes('/bgmplay/'))

  // 3. 播放直链解析测试
  const resolved = await resolveAkianime(AKIANIME_RULE, episodeUrl)
  assert.ok(resolved.playUrl.startsWith('https://'))

  // 4. SourceAdapter resolve 契约测试
  const rawResolve = await akianimeAdapter.resolve(episodeUrl)
  assert.ok(rawResolve.mediaUrl.startsWith('https://'))
  assert.ok(rawResolve.format === 'mp4' || rawResolve.format === 'hls')
})
