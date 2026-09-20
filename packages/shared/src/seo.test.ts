import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatSubjectTitle,
  formatSubjectDescription,
  generateSubjectKeywords,
} from './seo'

test('formatSubjectTitle: formats title covering A在线, A 在线, A动漫', () => {
  // Case 1: with alternate name
  const title1 = formatSubjectTitle('葬送的芙莉莲', '葬送のフリーレン')
  assert.equal(
    title1,
    '《葬送的芙莉莲》（葬送のフリーレン）动漫在线观看 · Animaku',
  )
  assert.ok(title1.includes('葬送的芙莉莲'))
  assert.ok(title1.includes('动漫在线观看'))
  assert.ok(!/(1080P|高清|全集|无广告)/.test(title1))

  // Case 2: without alternate name
  const title2 = formatSubjectTitle('鬼灭之刃')
  assert.equal(
    title2,
    '《鬼灭之刃》动漫在线观看 · Animaku',
  )
  assert.ok(!/(1080P|高清|全集|无广告)/.test(title2))

  // Case 3: custom site name
  const title3 = formatSubjectTitle('进击的巨人', undefined, 'MySite')
  assert.equal(
    title3,
    '《进击的巨人》动漫在线观看 · MySite',
  )
  assert.ok(!/(1080P|高清|全集|无广告)/.test(title3))

  // Case 4: identical name and alternate name deduplication
  const title4 = formatSubjectTitle('BLEACH', 'BLEACH')
  assert.equal(
    title4,
    '《BLEACH》动漫在线观看 · Animaku',
  )
  assert.ok(!/(1080P|高清|全集|无广告)/.test(title4))
})

test('formatSubjectDescription: leads with intent keywords and truncates summary cleanly', () => {
  // Case 1: empty summary
  const desc1 = formatSubjectDescription('葬送的芙莉莲')
  assert.equal(
    desc1,
    '《葬送的芙莉莲》动漫在线观看。Animaku 聚合多个视频源，支持弹幕与选集播放。',
  )
  assert.ok(!/(1080P|高清|全集|无广告)/.test(desc1))

  // Case 2: normal summary
  const rawSummary = '千年前，精灵魔法使芙莉莲结束了长达十年的讨伐魔王之旅。在和平的世界中，她独自踏上了探寻人类情感的新旅程。'
  const desc2 = formatSubjectDescription('葬送的芙莉莲', rawSummary, 160)
  assert.ok(desc2.startsWith('《葬送的芙莉莲》动漫在线观看。'))
  assert.ok(desc2.includes('剧情简介：千年前，精灵魔法使芙莉莲'))
  assert.ok(desc2.length <= 160)
  assert.ok(!/(1080P|高清|全集|无广告)/.test(desc2))

  // Case 3: very long summary should truncate with ellipsis
  const longSummary = 'A'.repeat(500)
  const desc3 = formatSubjectDescription('测试番剧', longSummary, 150)
  assert.ok(desc3.endsWith('…'))
  assert.ok(desc3.length <= 150)
  assert.ok(!/(1080P|高清|全集|无广告)/.test(desc3))
})

test('generateSubjectKeywords: generates comprehensive exact & proximity keywords', () => {
  const keywords = generateSubjectKeywords('葬送的芙莉莲', '葬送のフリーレン', ['奇幻', '冒险', '治愈'])

  assert.ok(keywords.includes('葬送的芙莉莲'))
  assert.ok(keywords.includes('葬送的芙莉莲在线'))
  assert.ok(keywords.includes('葬送的芙莉莲 在线'))
  assert.ok(keywords.includes('葬送的芙莉莲动漫'))
  assert.ok(keywords.includes('葬送的芙莉莲 在线观看'))
  assert.ok(!keywords.includes('葬送的芙莉莲全集'))
  assert.ok(!keywords.includes('1080P高清播放'))
  assert.ok(!keywords.includes('无广告动漫'))
  assert.ok(keywords.includes('葬送のフリーレン在线'))
  assert.ok(keywords.includes('葬送のフリーレン 在线'))
  assert.ok(keywords.includes('番剧在线'))
  assert.ok(keywords.includes('在线观看'))
  assert.ok(keywords.includes('奇幻'))
  assert.ok(keywords.includes('冒险'))
})
