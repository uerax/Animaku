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

test('Scenario 8 (Layer 2 Movie / Multi-version): preserves raw version names for pure-text resources', () => {
  // Movie with 3 source video variants (e.g. 1080P, 4K, Cantonese dub) mismatched with Bangumi
  const movieRoad = {
    data: ['play/m1', 'play/m2', 'play/m3'],
    identifier: ['正片 1080P', '正片 4K超清', '正片 粤语版'],
  }
  const slots = buildPlayableSlots(movieRoad, [{ type: 0, sort: 1 }]) // Bangumi has 1 ep, source has 3 -> Layer 2
  assert.equal(slots.length, 3)
  assert.equal(slots[0].displayTitle, '正片 1080P', 'Movie variant 1 should preserve raw version title')
  assert.equal(slots[1].displayTitle, '正片 4K超清', 'Movie variant 2 should preserve raw version title')
  assert.equal(slots[2].displayTitle, '正片 粤语版', 'Movie variant 3 should preserve raw version title')
  assert.equal(slots[0].sourceTitle, '正片 1080P')
})

test('Scenario 9 (Layer 2 TV Anime): normalizes titles with explicit episode numbers to clean episode labels', () => {
  // TV anime with extra OVA or Bangumi fetch failure, but source has explicit episode prefixes
  const tvRoad = {
    data: ['play/ep1', 'play/ep2', 'play/ep3'],
    identifier: ['第01集 觉醒的勇者', '第02集 终焉之夜', '第03集 序章'],
  }
  const slots = buildPlayableSlots(tvRoad, null) // Layer 2
  assert.equal(slots.length, 3)
  assert.equal(slots[0].displayTitle, '第01话', 'Explicit episode prefix should normalize to clean display title')
  assert.equal(slots[1].displayTitle, '第02话')
  assert.equal(slots[2].displayTitle, '第03话')
  assert.equal(slots[0].sourceTitle, '第01集 觉醒的勇者', 'Full raw title should be preserved in sourceTitle for hover tooltip')
})

test('Scenario 10 (Layer 2 Long Series / One Piece): series > 20 eps forces normalized episode numbers even with pure plot titles', () => {
  // One Piece style: 25 episodes with pure plot titles (no explicit "第X集" prefix)
  const plotTitles = [
    '我是路飞！ 将要成为海贼王的男人！',
    '大剑豪现身！海贼猎人罗罗诺亚·索隆',
    '蒙卡VS路飞！神秘的美少年是谁？',
    '路飞的过去！红发香克斯登场',
    '恐怖 神秘的力量！海贼小丑巴基船长！',
    '绝体绝命！驯兽师摩奇VS路飞！',
    '壮烈决斗！剑客索隆VS杂技卡巴吉！',
    '胜者是谁？恶魔果实能力大对决！',
    '正义的骗子？乌索普船长',
    '史上最强的怪人！催眠师赞高',
    '揭穿阴谋！海贼管家克洛船长',
    '激战！黑猫海贼团坡道大攻防！',
    '恐怖的二人组！猫人兄弟VS索隆',
    '路飞复活！可雅小姐的舍命抗争',
    '打倒克洛！男人乌索普落泪的决意！',
    '保护可雅！乌索普海贼团大显身手！',
    '彻底愤怒！克洛VS路飞最后的决战！',
    '你是珍禽异兽！卡蒙和奇妙的伙伴',
    '三刀流的过去！索隆与古伊娜的誓言！',
    '名厨登场！海上餐厅的香吉士',
    '不速之客！克利克舰队的阿金',
    '最强海贼舰队！克利克提督',
    '保卫巴拉蒂！大海贼红脚哲普',
    '鹰眼米霍克！剑豪索隆命丧大海',
    '必杀足技炸裂！香吉士VS铁壁巴鲁',
  ]
  const longRoad = {
    data: plotTitles.map((_, i) => `play/op/${i + 1}`),
    identifier: plotTitles,
  }
  const slots = buildPlayableSlots(longRoad, null) // Layer 2
  assert.equal(slots.length, 25)
  assert.equal(slots[0].canonicalEp, 1)
  assert.equal(slots[0].displayTitle, '第01话', 'Episode 1 should display normalized 第01话')
  assert.equal(slots[0].sourceTitle, '我是路飞！ 将要成为海贼王的男人！', 'Hover tooltip retains full plot title')
  assert.equal(slots[24].canonicalEp, 25)
  assert.equal(slots[24].displayTitle, '第25话', 'Episode 25 should display normalized 第25话')
  assert.equal(slots[24].sourceTitle, '必杀足技炸裂！香吉士VS铁壁巴鲁')
})

test('Scenario 11: Split-cour / Season 2 (Subject 584847: sort 14..25 with ep 1..12)', () => {
  const part2Official = [
    { type: 0, sort: 14, ep: 1, name: '君と先輩の駆け落ち', name_cn: '你与学姐的私奔' },
    { type: 0, sort: 15, ep: 2, name: 'いつか思いだす遠くの空の青い夜', name_cn: '某天忆起遥远天空下的青涩夜晚' },
    { type: 0, sort: 16, ep: 3, name: '明日の風', name_cn: '明日之风' },
  ]
  const sourceRoad = {
    data: ['url/1', 'url/2', 'url/3'],
    identifier: ['01', '02', '03'],
  }
  const slots = buildPlayableSlots(sourceRoad, part2Official)
  assert.equal(slots.length, 3)
  assert.equal(slots[0].canonicalEp, 14, 'Canonical broadcast episode is 14 for UI display')
  assert.equal(slots[0].entryEp, 1, 'Entry episode is 1 for Danmaku and AniSkip matching')
  assert.equal(slots[0].displayTitle, '第14话')
  assert.equal(slots[0].officialTitle, '你与学姐的私奔')

  assert.equal(slots[1].canonicalEp, 15)
  assert.equal(slots[1].entryEp, 2)
  assert.equal(slots[1].displayTitle, '第15话')
  assert.equal(slots[1].officialTitle, '某天忆起遥远天空下的青涩夜晚')

  assert.equal(slots[2].canonicalEp, 16)
  assert.equal(slots[2].entryEp, 3)
})

