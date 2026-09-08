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
