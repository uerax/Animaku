/**
 * neosek.ai (neosek) dedicated adapter test suite.
 *
 * 注意 / 特殊限制说明：
 * 该站部署了地区封锁策略，明确禁用了日本地区 IP (Ban Japan IP)，
 * 请求与测试时请确保出站节点非日本 IP。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { PluginRule } from '@animaku/shared'
import {
  isNeosekRule,
  searchNeosek,
  chaptersNeosek,
  resolveNeosek,
} from './neosek'
import { neosekAdapter } from './source/adapters/neosek'
import { SourceRegistry } from './source/source-registry'

const NEOSEK_RULE: PluginRule = {
  name: 'neosek',
  version: '1.0.0',
  baseURL: 'https://neosek.ai',
}

test('neosek: rule recognition and adapter metadata', () => {
  assert.equal(isNeosekRule({ name: 'neosek', version: '1.0.0', baseURL: 'https://neosek.ai' }), true)
  assert.equal(isNeosekRule({ name: 'neosekai', version: '1.0.0', baseURL: 'https://neosek.ai' }), true)
  assert.equal(
    isNeosekRule({ name: 'custom', version: '1.0.0', baseURL: 'https://neosek.ai' }),
    true,
  )
  assert.equal(isNeosekRule({ name: 'other', version: '1.0.0', baseURL: 'https://other.com' }), false)

  assert.equal(neosekAdapter.id, 'neosekai')
  assert.equal(neosekAdapter.name, 'neosek')
  assert.equal(neosekAdapter.tier, 'tier_a')
  assert.ok(neosekAdapter.capabilities.allowedPorts?.includes(2096))
  assert.ok(neosekAdapter.capabilities.allowedPorts?.includes(8443))

  const registry = new SourceRegistry()
  const foundById = registry.getAdapter('neosekai')
  assert.ok(foundById)
  assert.equal(foundById.id, 'neosekai')

  const foundByName = registry.getAdapter('neosek')
  assert.ok(foundByName)
  assert.equal(foundByName.id, 'neosekai')
})

test('neosek: search, chapters, and HLS resolve integration', async () => {
  // 1. 搜索测试
  const searchResult = await searchNeosek(NEOSEK_RULE, '芙莉莲')
  assert.equal(searchResult.pluginName, 'neosek')
  assert.ok(searchResult.items.length > 0)

  const firstItem = searchResult.items[0]
  assert.ok(firstItem.name.length > 0)
  assert.ok(firstItem.src.includes('neosek.ai/anime/'))

  // 2. 章节分集测试
  const chapterResult = await chaptersNeosek(NEOSEK_RULE, firstItem.src)
  assert.equal(chapterResult.pluginName, 'neosek')
  assert.ok(chapterResult.roads.length > 0)

  const defaultRoad = chapterResult.roads[0]
  assert.equal(defaultRoad.name, 'Neosek')
  assert.ok(defaultRoad.data.length > 0)
  assert.ok(defaultRoad.identifier && defaultRoad.identifier.length > 0)

  const firstEpUrl = defaultRoad.data[0]
  assert.ok(firstEpUrl.includes('/anime/'))

  // 3. 播放直链解析测试
  const resolved = await resolveNeosek(NEOSEK_RULE, firstEpUrl)
  assert.equal(resolved.format, 'hls')
  assert.ok(resolved.playUrl.startsWith('https://'))
  assert.ok(resolved.playUrl.includes('.m3u8'))
  assert.equal(resolved.headers?.Referer, 'https://neosek.ai/')

  // 4. SourceAdapter resolve 契约测试
  const rawResolve = await neosekAdapter.resolve(firstEpUrl)
  assert.equal(rawResolve.format, 'hls')
  assert.ok(rawResolve.mediaUrl.startsWith('https://'))
  assert.ok(rawResolve.mediaUrl.includes('.m3u8'))
})

test('neosek: subtitle resolution with ASS/VTT prioritization and Chinese label fallback', async () => {
  // 1. 测试 39228/94412：Netflix 原生流带有 [NF]，优先交付原生 VTT 避免 Web 端缺字，ASS 作为备用
  const resolvedAss = await resolveNeosek(NEOSEK_RULE, 'https://neosek.ai/anime/39228/94412')
  assert.ok(resolvedAss.playUrl.startsWith('https://'))
  assert.ok(resolvedAss.subtitles && resolvedAss.subtitles.length >= 4)
  assert.ok(resolvedAss.fonts && resolvedAss.fonts.length >= 4)
  assert.ok(resolvedAss.subtitle?.subtitles && resolvedAss.subtitle.subtitles.length >= 4)

  const hasAss = resolvedAss.subtitles!.some((s) => s.format === 'ass')
  const hasVtt = resolvedAss.subtitles!.some((s) => s.format === 'vtt')
  assert.equal(hasAss, true)
  assert.equal(hasVtt, true)

  // 针对 [NF] 官方流，首选默认轨必须为 VTT，防止 Web 端 Trebuchet 缺字形炸成豆腐块
  const defaultSub = resolvedAss.subtitles!.find((s) => s.default)
  assert.ok(defaultSub)
  assert.equal(defaultSub.format, 'vtt')
  assert.ok(defaultSub.label.includes('Chinese(Simplified)'))

  // 2. 测试 17024/44611：纯 VTT 字幕、原站标为“中文”，无 ASS
  const resolvedVtt = await resolveNeosek(NEOSEK_RULE, 'https://neosek.ai/anime/17024/44611')
  assert.ok(resolvedVtt.playUrl.startsWith('https://'))
  assert.ok(resolvedVtt.subtitles && resolvedVtt.subtitles.length >= 2)
  assert.equal(resolvedVtt.subtitles!.every((s) => s.format === 'vtt'), true)
  assert.equal(resolvedVtt.subtitles![0].label, '中文')
  assert.equal(resolvedVtt.subtitles![0].default, true)
})
