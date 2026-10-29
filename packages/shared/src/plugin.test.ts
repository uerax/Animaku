import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseChineseNumber,
  extractSeason,
  extractBaseTitle,
  resolvePluginDefaultKeyword,
  buildSearchKeywords,
  titleSimilarity,
  bestTitleSimilarity,
  rankSearchItems,
  parsePluginRule,
  findDefaultSourcePlugin,
  resolveTargetSourcePlugin,
  resolveBoostedPluginNames,
  getPluginEffectiveWeight,
  type PluginMeta,
} from './plugin.ts'

test('parseChineseNumber: parses 1-99 Chinese numerals correctly', () => {
  assert.equal(parseChineseNumber('一'), 1)
  assert.equal(parseChineseNumber('二'), 2)
  assert.equal(parseChineseNumber('两'), 2)
  assert.equal(parseChineseNumber('三'), 3)
  assert.equal(parseChineseNumber('四'), 4)
  assert.equal(parseChineseNumber('十'), 10)
  assert.equal(parseChineseNumber('十一'), 11)
  assert.equal(parseChineseNumber('十二'), 12)
  assert.equal(parseChineseNumber('二十'), 20)
  assert.equal(parseChineseNumber('二十三'), 23)
  assert.equal(parseChineseNumber('4'), 4)
  assert.equal(parseChineseNumber(''), null)
})

test('extractSeason: extracts Chinese and Arabic seasons correctly', () => {
  assert.equal(extractSeason('碧蓝之海 第二季'), 2)
  assert.equal(extractSeason('碧蓝之海第二季'), 2)
  assert.equal(extractSeason('Re：从零开始的异世界生活 第四季 夺还篇'), 4)
  assert.equal(extractSeason('Re：从零开始的异世界生活第四季'), 4)
  assert.equal(extractSeason('关于我转生变成史莱姆这档事 第三期'), 3)
  assert.equal(extractSeason('进击的巨人 Season 3'), 3)
  assert.equal(extractSeason('Overlord S4'), 4)
  assert.equal(extractSeason('刀剑神域 Part 2'), 2)
  assert.equal(extractSeason('无职转生Ⅱ'), 2)
  assert.equal(extractSeason('无职转生Ⅲ到了异世界就拿出真本事'), 3)
  assert.equal(extractSeason('刀剑神域 II'), 2)
  assert.equal(extractSeason('灵能百分百 Ⅲ'), 3)
  assert.equal(extractSeason('孤独摇滚！'), null)
  assert.equal(extractSeason(''), null)
  assert.equal(extractSeason(undefined), null)
})

test('extractBaseTitle: recursively strips arc, chapter and season suffixes', () => {
  const full = 'Re：从零开始的异世界生活 第四季 夺还篇'
  const step1 = extractBaseTitle(full)
  assert.equal(step1, 'Re：从零开始的异世界生活 第四季')
  const step2 = extractBaseTitle(step1)
  assert.equal(step2, 'Re：从零开始的异世界生活')

  assert.equal(extractBaseTitle('鬼灭之刃 柱训练篇'), '鬼灭之刃')
  assert.equal(extractBaseTitle('无职转生 第二季'), '无职转生')
  assert.equal(extractBaseTitle('孤独摇滚！'), '孤独摇滚！')
})

test('resolvePluginDefaultKeyword: routes by titlePreference correctly', () => {
  const item = {
    name: 'ぐらんぶる Season 2',
    nameCn: '碧蓝之海 第二季',
  }

  // 1. original (Japanese preferred)
  assert.equal(
    resolvePluginDefaultKeyword({ titlePreference: 'original' }, item),
    'ぐらんぶる Season 2',
  )

  // 2. chinese (Standard with space)
  assert.equal(
    resolvePluginDefaultKeyword({ titlePreference: 'chinese' }, item),
    '碧蓝之海 第二季',
  )

  // 3. chinese_compact (Collapsed without space before season)
  assert.equal(
    resolvePluginDefaultKeyword({ titlePreference: 'chinese_compact' }, item),
    '碧蓝之海第二季',
  )

  // 4. Default fallback when no preference given
  assert.equal(
    resolvePluginDefaultKeyword(null, item),
    '碧蓝之海 第二季',
  )
})

test('buildSearchKeywords: generates tiered keywords and blocks short junk prefix', () => {
  const keywords = buildSearchKeywords(
    'Re：从零开始的异世界生活 第四季 夺还篇',
    'Re:ゼロから始める異世界生活 4th season 奪還編',
  )

  // Must NOT include the junk 2-char token 'Re'
  assert.equal(keywords.includes('Re'), false)
  assert.equal(keywords.includes('re'), false)

  // Must include full title
  assert.ok(keywords.includes('Re：从零开始的异世界生活 第四季 夺还篇'))
  // Must include stripped arc with space
  assert.ok(keywords.includes('Re：从零开始的异世界生活 第四季'))
  // Must include compact without space (for MiFun)
  assert.ok(keywords.includes('Re：从零开始的异世界生活第四季'))
  // Must include pure base title
  assert.ok(keywords.includes('Re：从零开始的异世界生活'))

  // Test Grand Blue Season 2
  const gbKeywords = buildSearchKeywords('碧蓝之海 第二季', 'ぐらんぶる Season 2')
  assert.ok(gbKeywords.includes('碧蓝之海 第二季'))
  assert.ok(gbKeywords.includes('碧蓝之海第二季'))
  assert.ok(gbKeywords.includes('碧蓝之海'))
})

test('titleSimilarity with Season Guard: prevents cross-season auto-picking', () => {
  // 1. Exact match
  assert.equal(titleSimilarity('碧蓝之海 第二季', '碧蓝之海 第二季'), 1.0)
  assert.equal(titleSimilarity('碧蓝之海 第二季', '碧蓝之海第二季'), 1.0)

  // 2. Hard season conflict: Season 4 vs Season 2 -> hard penalized to 0.15
  const conflictScore = titleSimilarity(
    'Re：从零开始的异世界生活 第四季 夺还篇',
    'Re：从零开始的异世界生活 第二季',
  )
  assert.equal(conflictScore, 0.15)
  assert.ok(conflictScore < 0.55) // Strict auto-pick line

  // 3. Modifier mismatch: Season 4 vs Season 1 (unlabeled base title)
  // Must NOT receive 0.918 substring bonus; must be clamped <= 0.45
  const s4VsS1 = titleSimilarity(
    'Re：从零开始的异世界生活 第四季 夺还篇',
    'Re：从零开始的异世界生活',
  )
  assert.ok(s4VsS1 <= 0.45)
  assert.ok(s4VsS1 < 0.55) // Successfully blocked from auto-picking

  // 4. Grand Blue Season 2 vs Season 1
  const gbS2VsS1 = titleSimilarity('碧蓝之海 第二季', '碧蓝之海')
  assert.ok(gbS2VsS1 <= 0.45)
  assert.ok(gbS2VsS1 < 0.55) // Successfully blocked

  // 5. Single-season anime: Bocchi the Rock! (neutral, zero penalty)
  const bocchiScore = titleSimilarity('孤独摇滚！', '孤独摇滚！')
  assert.equal(bocchiScore, 1.0)
})

test('parsePluginRule: parses titlePreference correctly', () => {
  const rule1 = parsePluginRule({
    name: 'test-mifun',
    baseURL: 'https://mifun.org',
    searchURL: 'https://mifun.org/search',
    titlePreference: 'chinese_compact',
  })
  assert.equal(rule1.titlePreference, 'chinese_compact')

  const rule2 = parsePluginRule({
    name: 'test-xifan',
    baseURL: 'https://xifan.org',
    searchURL: 'https://xifan.org/search',
    titlePreference: 'original',
  })
  assert.equal(rule2.titlePreference, 'original')

  const ruleDefault = parsePluginRule({
    name: 'test-cycani',
    baseURL: 'https://cycani.org',
    searchURL: 'https://cycani.org/search',
  })
  assert.equal(ruleDefault.titlePreference, 'chinese')
})

test('findDefaultSourcePlugin: 遵循用户自定义顺序', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 70, enabled: true },
    { name: 'cycani', version: '1.0.0', weight: 65, enabled: true },
    { name: 'anime1', version: '1.0.0', weight: 60, oldAnimePriority: true, enabled: true },
    { name: 'tvtfun', version: '1.0.0', weight: 50, enabled: true },
  ]
  // 用户明确将 cycani 放在第 1 位
  const target = findDefaultSourcePlugin(mockPlugins, ['cycani', 'xifan-next'])
  assert.equal(target?.name, 'cycani')
})

test('findDefaultSourcePlugin: 用户无排序时按权重降序排列', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'cycani', version: '1.0.0', weight: 65, enabled: true },
    { name: 'xifan-next', version: '1.0.0', weight: 70, enabled: true },
  ]
  const target = findDefaultSourcePlugin(mockPlugins, [])
  assert.equal(target?.name, 'xifan-next')
})

test('findDefaultSourcePlugin: 老番场景赋予 oldAnimePriority 插件加权', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 70, enabled: true },
    { name: 'anime1', version: '1.0.0', weight: 60, oldAnimePriority: true, enabled: true },
  ]
  // anime1 原权重 60 + 12 = 72，超过 xifan-next 的 70
  const target = findDefaultSourcePlugin(mockPlugins, [], true)
  assert.equal(target?.name, 'anime1')
})

test('resolveBoostedPluginNames: 正确解析命中当前番剧 ID 的加权源集合', () => {
  const sourceBangumiIds = {
    cycani: [253, 312345],
    Anime1: [1024],
    tvtfun: [999],
  }
  const hit253 = resolveBoostedPluginNames(253, sourceBangumiIds)
  assert.strictEqual(hit253.has('cycani'), true)
  assert.strictEqual(hit253.has('anime1'), false)

  const hit1024 = resolveBoostedPluginNames(1024, sourceBangumiIds)
  assert.strictEqual(hit1024.has('anime1'), true)
  assert.strictEqual(hit1024.has('cycani'), false)

  const hitNone = resolveBoostedPluginNames(88888, sourceBangumiIds)
  assert.strictEqual(hitNone.size, 0)
})

test('getPluginEffectiveWeight: 命中番剧加权时获得 +20 权重', () => {
  const cycani: PluginMeta = { name: 'cycani', version: '1.0.0', weight: 59, enabled: true }
  const normalWeight = getPluginEffectiveWeight(cycani, false)
  assert.strictEqual(normalWeight, 59)

  const boostedWeight = getPluginEffectiveWeight(cycani, false, new Set(['cycani']))
  assert.strictEqual(boostedWeight, 79)
})

test('findDefaultSourcePlugin: 用户无自定义顺序时，命中番剧专属加权的源提升 20 权重优先当选', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 61, enabled: true },
    { name: 'cycani', version: '1.0.0', weight: 59, enabled: true },
  ]
  // cycani 原本 59 < xifan-next 61，未加权时默认选 xifan-next
  const targetNormal = findDefaultSourcePlugin(mockPlugins, [])
  assert.strictEqual(targetNormal?.name, 'xifan-next')

  // 给 cycani 加权 20，提升至 79，超过 xifan-next 61，成为首选
  const boosted = new Set(['cycani'])
  const targetBoosted = findDefaultSourcePlugin(mockPlugins, [], false, boosted)
  assert.strictEqual(targetBoosted?.name, 'cycani')
})

test('findDefaultSourcePlugin: 命中番剧专属加权时，用户自定义源顺序依然拥有最高优先级', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 61, enabled: true },
    { name: 'cycani', version: '1.0.0', weight: 59, enabled: true },
  ]
  // 用户明确在本地把 xifan-next 排在第一位
  const userOrder = ['xifan-next', 'cycani']
  const boosted = new Set(['cycani'])
  // 即使 cycani 有专属加权，但权重依然低于用户明确指定的自定义顺序
  const target = findDefaultSourcePlugin(mockPlugins, userOrder, false, boosted)
  assert.strictEqual(target?.name, 'xifan-next')
})

test('resolveTargetSourcePlugin: 普通入口（无 qPlugin）严格返回全局默认源，绝不受历史记录影响', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 70, enabled: true },
    { name: 'cycani', version: '1.0.0', weight: 65, enabled: true },
    { name: 'tvtfun', version: '1.0.0', weight: 50, enabled: true },
  ]
  // 场景：即便用户之前在 tvtfun（B源）看了该番，进入普通入口（qPlugin 为空或未传）时，
  // 必须返回全局默认源 xifan-next，杜绝越界篡改默认源
  assert.equal(resolveTargetSourcePlugin('', mockPlugins, [])?.name, 'xifan-next')
  assert.equal(resolveTargetSourcePlugin(undefined, mockPlugins, [])?.name, 'xifan-next')
  assert.equal(resolveTargetSourcePlugin(null, mockPlugins, [])?.name, 'xifan-next')
})

test('resolveTargetSourcePlugin: 历史播放深链（有 qPlugin）准确定位历史播放源', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 70, enabled: true },
    { name: 'tvtfun', version: '1.0.0', weight: 50, enabled: true },
  ]
  // 场景：从历史播放卡片点击进入时（携带 ?plugin=tvtfun&ep=12），
  // 必须准确定位到用户历史播放的 tvtfun 源
  const target = resolveTargetSourcePlugin('tvtfun', mockPlugins, [])
  assert.equal(target?.name, 'tvtfun')
})

test('resolveTargetSourcePlugin: 历史播放深链大小写不敏感匹配', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 70, enabled: true },
    { name: 'cycani', version: '1.0.0', weight: 65, enabled: true },
  ]
  const target = resolveTargetSourcePlugin('CYCANI', mockPlugins, [])
  assert.equal(target?.name, 'cycani')
})

test('resolveTargetSourcePlugin: 历史播放深链指定的源不存在时安全回退至全局默认源', () => {
  const mockPlugins: PluginMeta[] = [
    { name: 'xifan-next', version: '1.0.0', weight: 70, enabled: true },
  ]
  const target = resolveTargetSourcePlugin('non_existent_plugin', mockPlugins, [])
  assert.equal(target?.name, 'xifan-next')
})

test('parsePluginRule: platforms 字段正确解析与非法值过滤', () => {
  const ruleAppOnly = parsePluginRule({
    name: 'test-app',
    baseURL: 'https://example.com',
    searchURL: 'https://example.com/s',
    platforms: ['app', 'invalid_platform'],
  })
  assert.deepEqual(ruleAppOnly.platforms, ['app'])

  const ruleDefault = parsePluginRule({
    name: 'test-web',
    baseURL: 'https://example.com',
    searchURL: 'https://example.com/s',
  })
  assert.equal(ruleDefault.platforms, undefined)
})

