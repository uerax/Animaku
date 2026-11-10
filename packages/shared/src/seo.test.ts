import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatHomeTitle,
  formatAnimeListTitle,
  formatTimelineTitle,
  formatSubjectTitle,
  formatDefaultDescription,
  formatAnimeListDescription,
  formatTimelineDescription,
  formatSubjectDescription,
  generateSubjectKeywords,
} from './seo'

test('formatHomeTitle & static titles: dynamic siteName with keyword rich patterns', () => {
  // Default siteName
  assert.equal(
    formatHomeTitle(),
    'Animaku 动漫 - 高清动漫在线观看与弹幕聚合平台',
  )
  assert.equal(
    formatAnimeListTitle(),
    '番剧列表 - 高清动漫在线 - Animaku 动漫',
  )
  assert.equal(
    formatTimelineTitle(),
    '新番放送时间表 - 每日连载更新 - Animaku 动漫',
  )

  // Custom siteName without tagline
  assert.equal(
    formatHomeTitle('次元宇宙'),
    '次元宇宙 - 高清动漫在线观看与弹幕聚合平台',
  )
  // Custom siteName with tagline
  assert.equal(
    formatHomeTitle('扎口动漫', '弹幕播放与多源聚合平台'),
    '扎口动漫 - 弹幕播放与多源聚合平台',
  )
  assert.equal(
    formatAnimeListTitle('次元宇宙'),
    '番剧列表 - 高清动漫在线 - 次元宇宙',
  )
  assert.equal(
    formatTimelineTitle('次元宇宙'),
    '新番放送时间表 - 每日连载更新 - 次元宇宙',
  )
})

test('formatSubjectTitle: formats title with intent keywords, Japanese alt name, and length guard', () => {
  // Case 1: with alternate name (within safe length)
  const title1 = formatSubjectTitle('秒速5厘米', '秒速5センチメートル', '扎口动漫')
  assert.equal(
    title1,
    '《秒速5厘米》（秒速5センチメートル）在线观看 - 扎口动漫',
  )
  assert.ok(title1.length <= 32, `title1 length ${title1.length} exceeds 32`)

  // Case 2: without alternate name
  const title2 = formatSubjectTitle('鬼灭之刃')
  assert.equal(
    title2,
    '《鬼灭之刃》在线观看 - Animaku 动漫',
  )
  assert.ok(title2.length <= 25)

  // Case 3: custom site name
  const title3 = formatSubjectTitle('进击的巨人', undefined, 'MyAnime')
  assert.equal(
    title3,
    '《进击的巨人》在线观看 - MyAnime',
  )

  // Case 4: identical name and alternate name deduplication
  const title4 = formatSubjectTitle('BLEACH', 'BLEACH')
  assert.equal(
    title4,
    '《BLEACH》在线观看 - Animaku 动漫',
  )

  // Case 5: very long Japanese alternate name gets smoothly truncated under 32 chars
  const longAlt = '転生したらスライムだった件について語る長い名前の作品'
  const title5 = formatSubjectTitle('关于我转生变成史莱姆这档事', longAlt, '扎口动漫')
  assert.ok(title5.length <= 32, `title5 length ${title5.length} exceeds 32`)
  assert.ok(title5.startsWith('《关于我转生变成史莱姆这档事》'))
  assert.ok(title5.endsWith('在线观看 - 扎口动漫'))
})

test('formatDefaultDescription & list descriptions: length strictly targets 150-160 characters', () => {
  // Default home description
  const dHome = formatDefaultDescription()
  assert.ok(dHome.length >= 150 && dHome.length <= 160, `dHome length ${dHome.length} not in [150, 160]`)
  assert.ok(dHome.includes('Animaku 动漫'))

  // Custom site name and tagline
  const dHomeCustom = formatDefaultDescription('次元宇宙', '超清弹幕站')
  assert.ok(dHomeCustom.length >= 150 && dHomeCustom.length <= 160, `dHomeCustom length ${dHomeCustom.length} not in [150, 160]`)
  assert.ok(dHomeCustom.includes('次元宇宙'))

  // Anime list description
  const dAnime = formatAnimeListDescription()
  assert.ok(dAnime.length >= 150 && dAnime.length <= 160, `dAnime length ${dAnime.length} not in [150, 160]`)

  // Timeline description
  const dTimeline = formatTimelineDescription()
  assert.ok(dTimeline.length >= 150 && dTimeline.length <= 160, `dTimeline length ${dTimeline.length} not in [150, 160]`)
})

test('formatSubjectDescription: guarantees 150-160 length with padding engine across all summaries', () => {
  // Case 1: empty summary with padding filler
  const desc1 = formatSubjectDescription('葬送的芙莉莲')
  assert.ok(desc1.length >= 150 && desc1.length <= 160, `desc1 length ${desc1.length} not in [150, 160]`)
  assert.ok(desc1.startsWith('《葬送的芙莉莲》全集高清正片在线观看。'))
  assert.ok(desc1.includes('平台收录全网官方多线路高清视频源'))

  // Case 2: short summary with metadata
  const shortSummary = '芙莉莲踏上了探寻人类情感的新旅程。'
  const desc2 = formatSubjectDescription('葬送的芙莉莲', {
    rawSummary: shortSummary,
    tags: ['奇幻', '冒险', '治愈'],
    airDate: '2023-09-29',
  })
  assert.ok(desc2.length >= 150 && desc2.length <= 160, `desc2 length ${desc2.length} not in [150, 160]`)
  assert.ok(desc2.includes('【首播：2023-09】'))
  assert.ok(desc2.includes('【类型：奇幻/冒险/治愈】'))

  // Case 3: long summary properly truncated
  const longSummary = '千年前，精灵魔法使芙莉莲结束了长达十年的讨伐魔王之旅。'.repeat(10)
  const desc3 = formatSubjectDescription('葬送的芙莉莲', { rawSummary: longSummary })
  assert.ok(desc3.length <= 160)
  assert.ok(desc3.endsWith('…'))
})

test('generateSubjectKeywords: generates comprehensive exact & proximity keywords', () => {
  const keywords = generateSubjectKeywords('葬送的芙莉莲', '葬送のフリーレン', ['奇幻', '冒险'])

  assert.ok(keywords.includes('葬送的芙莉莲'))
  assert.ok(keywords.includes('葬送的芙莉莲全集高清'))
  assert.ok(keywords.includes('葬送的芙莉莲 在线观看'))
  assert.ok(keywords.includes('葬送のフリーレン'))
})
