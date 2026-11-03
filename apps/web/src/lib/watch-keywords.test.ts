import test from 'node:test'
import assert from 'node:assert/strict'
import type { BangumiItem, PluginMeta } from '@animaku/shared'
import {
  deriveTitleRefs,
  deriveKeywordCandidates,
  deriveDefaultKeyword,
  resolveKeywordForPlugin,
  orderSearchRows,
} from './watch-keywords.ts'

const mockItem: BangumiItem = {
  id: 1001,
  name: '葬送のフリーレン',
  nameCn: '葬送的芙莉莲',
  alias: ['Frieren: Beyond Journey’s End', '芙莉莲'],
  airDate: '2023-09-29',
}

const mockPluginCycani: PluginMeta = {
  name: 'cycani',
  version: '1.0.0',
  titlePreference: 'chinese',
}

const mockPluginAnime1: PluginMeta = {
  name: 'anime1',
  version: '1.0.0',
  titlePreference: 'original',
}

test('deriveTitleRefs: 包含中文名、原名与别名', () => {
  const refs = deriveTitleRefs(mockItem)
  assert.deepEqual(refs, [
    '葬送的芙莉莲',
    '葬送のフリーレン',
    'Frieren: Beyond Journey’s End',
    '芙莉莲',
  ])

  assert.deepEqual(deriveTitleRefs(null), [])
})

test('deriveKeywordCandidates: 中文偏好与日文原名偏好排序', () => {
  // 默认中文偏好
  const cnList = deriveKeywordCandidates(mockItem, mockPluginCycani)
  assert.equal(cnList[0], '葬送的芙莉莲')
  assert.ok(cnList.includes('葬送のフリーレン'))

  // 日文原名偏好 (anime1)
  const jpList = deriveKeywordCandidates(mockItem, mockPluginAnime1)
  assert.equal(jpList[0], '葬送のフリーレン')
  assert.ok(jpList.includes('葬送的芙莉莲'))
})

test('deriveDefaultKeyword: 优先提取主要标题', () => {
  assert.equal(deriveDefaultKeyword(mockItem), '葬送的芙莉莲')
  assert.equal(deriveDefaultKeyword({ id: 2, name: 'Solo Leveling' }), 'Solo Leveling')
  assert.equal(deriveDefaultKeyword(null), '')
})

test('resolveKeywordForPlugin: 手动记忆词与自动推导', () => {
  // 无记忆词，自动推导
  const kwAuto = resolveKeywordForPlugin(mockPluginCycani, mockItem, '葬送的芙莉莲')
  assert.equal(kwAuto, '葬送的芙莉莲')

  // 有用户手动输入的搜索词
  const kwManual = resolveKeywordForPlugin(
    mockPluginCycani,
    mockItem,
    '葬送的芙莉莲',
    { cycani: '芙莉莲 特别篇' },
  )
  assert.equal(kwManual, '芙莉莲 特别篇')
})

test('orderSearchRows: 按照用户指定顺序或默认打分排列', () => {
  const rows = [
    { plugin: mockPluginAnime1, score: 1 },
    { plugin: mockPluginCycani, score: 2 },
  ]

  // 指定 cycani 排第一
  const ordered = orderSearchRows(rows, ['cycani', 'anime1'])
  assert.equal(ordered[0]?.plugin.name, 'cycani')
  assert.equal(ordered[1]?.plugin.name, 'anime1')

  // 指定 anime1 排第一
  const orderedReverse = orderSearchRows(rows, ['anime1', 'cycani'])
  assert.equal(orderedReverse[0]?.plugin.name, 'anime1')
  assert.equal(orderedReverse[1]?.plugin.name, 'cycani')
})
