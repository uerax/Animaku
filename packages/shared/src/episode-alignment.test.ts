import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alignSourceToOfficial,
  resolveAlignedEpisodeNumber,
  filterOutObviousNonMainContent,
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
