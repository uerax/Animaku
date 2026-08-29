import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alignSourceToOfficial,
  resolveAlignedEpisodeNumber,
  filterOutObviousNonMainContent,
  extractConservativeEpisodeNumber,
  buildPlayableSlots,
} from './episode-alignment.ts'

test('Scenario 1: Fate/stay night [UBW] (Subject 100403: 00 PROLOGUE + pure titles)', () => {
  // Official main episodes: sort 0..12 (13 episodes total)
  const ubwOfficial = Array.from({ length: 13 }, (_, i) => ({
    type: 0,
    sort: i, // 0, 1, 2 ... 12
    name: i === 0 ? 'PROLOGUE' : `Episode ${i}`,
  }))

  // Source: xifan-next (Episode 0 has '00', Episode 1 has pure title, rest have titles)
  const ubwSourceIdentifiers = [
    '00 PROLOGUE',
    '冬の日、運命の夜',
    '開幕の刻',
    '初戦',
    '他流試合',
    '死闘の報酬',
    '蜃気楼',
    '死線',
    '冬の日、心の所在',
    '二人の距離',
    '五大要素使い',
    '来訪者は軽やかに',
    '最後の選択',
  ]

  const ubwAligned = alignSourceToOfficial(ubwSourceIdentifiers, ubwOfficial)
  assert.notEqual(ubwAligned, null, 'UBW alignment should succeed')
  assert.equal(ubwAligned?.length, 13)
  assert.equal(resolveAlignedEpisodeNumber(ubwAligned, 0), 0, 'Index 0 should map to Episode 0')
  assert.equal(resolveAlignedEpisodeNumber(ubwAligned, 1), 1, 'Index 1 should map to Episode 1')
  assert.equal(resolveAlignedEpisodeNumber(ubwAligned, 12), 12, 'Index 12 should map to Episode 12')
})

test('Scenario 2: Subtitle with embedded digits ("第十天恶魔", "86", "100万")', () => {
  const trickySource = [
    '01 第十天恶魔',
    '02 86 不存在的战区',
    '03 100万的命',
  ]
  const trickyOfficial = [
    { type: 0, sort: 1 },
    { type: 0, sort: 2 },
    { type: 0, sort: 3 },
  ]
  const trickyAligned = alignSourceToOfficial(trickySource, trickyOfficial)
  assert.notEqual(trickyAligned, null)
  assert.equal(resolveAlignedEpisodeNumber(trickyAligned, 0), 1, 'Index 0 should be Episode 1 (not 10)')
  assert.equal(resolveAlignedEpisodeNumber(trickyAligned, 1), 2, 'Index 1 should be Episode 2 (not 86)')
  assert.equal(resolveAlignedEpisodeNumber(trickyAligned, 2), 3, 'Index 2 should be Episode 3 (not 100)')
})

test('Scenario 3: Obvious PV/SP prefix filtering', () => {
  const sourceWithPV = [
    'PV 预告片',
    '特别篇 特典花絮',
    '00 PROLOGUE',
    '01 冬之日',
  ]
  const filtered = filterOutObviousNonMainContent(sourceWithPV)
  assert.equal(filtered.length, 2)
  assert.equal(filtered[0].originalIndex, 2)
  assert.equal(filtered[1].originalIndex, 3)

  const pvOfficial = [
    { type: 0, sort: 0 },
    { type: 0, sort: 1 },
  ]
  const pvAligned = alignSourceToOfficial(sourceWithPV, pvOfficial)
  assert.notEqual(pvAligned, null)
  assert.equal(resolveAlignedEpisodeNumber(pvAligned, 0), null, 'PV should not have main episode alignment')
  assert.equal(resolveAlignedEpisodeNumber(pvAligned, 1), null, 'SP should not have main episode alignment')
  assert.equal(resolveAlignedEpisodeNumber(pvAligned, 2), 0, 'Source index 2 should map to Episode 0')
  assert.equal(resolveAlignedEpisodeNumber(pvAligned, 3), 1, 'Source index 3 should map to Episode 1')
})

test('Scenario 4: Pure titles with zero digits', () => {
  const pureTitles = [
    '序章',
    '冬之日',
    '开幕',
  ]
  const pureOfficial = [
    { type: 0, sort: 0 },
    { type: 0, sort: 1 },
    { type: 0, sort: 2 },
  ]
  const pureAligned = alignSourceToOfficial(pureTitles, pureOfficial)
  assert.notEqual(pureAligned, null)
  assert.equal(resolveAlignedEpisodeNumber(pureAligned, 0), 0)
  assert.equal(resolveAlignedEpisodeNumber(pureAligned, 1), 1)
  assert.equal(resolveAlignedEpisodeNumber(pureAligned, 2), 2)
})

test('Scenario 5: Safety valve on count mismatch (Source > Official)', () => {
  const overflowSource = ['01', '02', '03', '04']
  const underflowOfficial = [{ type: 0, sort: 1 }, { type: 0, sort: 2 }]
  const overflowAligned = alignSourceToOfficial(overflowSource, underflowOfficial)
  assert.equal(overflowAligned, null, 'Count overflow should trigger safety valve and return null')
})

// --- Regression tests for b9cc86f Layer 2 firstIsZero fallback-collision bug ---

test('extractConservativeEpisodeNumber: fallback sentinel is never confused with explicit 0-match', () => {
  // No digits at all -> must return the caller-supplied fallback verbatim, not 0.
  assert.equal(extractConservativeEpisodeNumber('刽子手', -1, true), -1)
  assert.equal(extractConservativeEpisodeNumber('迷途猫', -1, false), -1)
  // Explicit 0-patterns must still resolve to 0 regardless of fallback value.
  assert.equal(extractConservativeEpisodeNumber('第00话 序章', -1, true), 0)
  assert.equal(extractConservativeEpisodeNumber('EP00', -1, true), 0)
  assert.equal(extractConservativeEpisodeNumber('序章', -1, true), 0, 'isFirstItem prologue keyword should still match 0')
  assert.equal(extractConservativeEpisodeNumber('序章', -1, false), -1, 'non-first-item prologue keyword must NOT match 0')
})

test('Scenario 6 (Layer 2 regression): pure-text titles must NOT be misread as 0-based ("浪客剑心 追忆篇")', () => {
  // Bangumi offline / no usable officialMain -> forces Layer 2.
  const road = {
    data: ['play/40791', 'play/40792', 'play/40793', 'play/40794'],
    identifier: ['刽子手', '迷途猫', '宵里山', '十字伤'],
  }
  const slots = buildPlayableSlots(road, null)
  assert.equal(slots.length, 4)
  assert.equal(slots[0].canonicalEp, 1, '刽子手 should be canonical episode 1, not 0')
  assert.equal(slots[1].canonicalEp, 2, '迷途猫 should be canonical episode 2, not 1')
  assert.equal(slots[2].canonicalEp, 3, '宵里山 should be canonical episode 3, not 2')
  assert.equal(slots[3].canonicalEp, 4, '十字伤 should be canonical episode 4, not 3')

  // Deep link ep=3 must resolve to '宵里山', not '十字伤'.
  const deepLinkTarget = slots.find((s) => s.canonicalEp === 3)
  assert.equal(deepLinkTarget?.sourceTitle, '宵里山')
  assert.equal(deepLinkTarget?.pageUrl, 'play/40793')
})

test('Scenario 7 (Layer 2 regression): true 0-based anime must still preserve episode 0 ("第00话 序章")', () => {
  const road = {
    data: ['play/1', 'play/2', 'play/3'],
    identifier: ['第00话 序章', '第01话 冬之日', '第02话 开幕'],
  }
  const slots = buildPlayableSlots(road, null)
  assert.equal(slots.length, 3)
  assert.equal(slots[0].canonicalEp, 0, '第00话 should remain canonical episode 0')
  assert.equal(slots[1].canonicalEp, 1)
  assert.equal(slots[2].canonicalEp, 2)
})

