import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractSegmentSequence,
  filterAds,
  filterM3u8AdsIfApplicable,
  M3u8Segment,
} from './m3u8-ad-filter'

test('extractSegmentSequence: handles various segment URI formats', () => {
  assert.equal(extractSegmentSequence('https://example.com/seg_001.ts'), 1)
  assert.equal(extractSegmentSequence('https://example.com/chunk-1024.ts'), 1024)
  assert.equal(extractSegmentSequence('b2dd7ad0c56000073.ts'), 56000073)
  assert.equal(extractSegmentSequence('b2dd7ad0c560369357.ts'), 560369357)
  assert.equal(
    extractSegmentSequence('https://cdn.com/path/video001227.ts?token=abc'),
    1227,
  )
  assert.equal(extractSegmentSequence('index.m3u8'), null)
  assert.equal(extractSegmentSequence('audio.aac'), null)
})

test('filterAds: detects bypass continuity ad insertion (lzizy pattern)', () => {
  const segments: M3u8Segment[] = []

  // Group 0 (Main content: 0..72)
  for (let i = 0; i <= 72; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.lz-cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 0,
    })
  }

  // Group 1 (Inserted Ad: 7 segments of 26s, sequence jumps to 439362..439368)
  for (let i = 439362; i <= 439368; i++) {
    segments.push({
      duration: 3.714,
      uri: `https://vip.lz-cdn.com/hls/hash0${i}.ts`,
      discontinuityGroup: 1,
    })
  }

  // Group 2 (Main content continues: 73..150)
  for (let i = 73; i <= 150; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.lz-cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 2,
    })
  }

  const filtered = filterAds(segments)

  // 广告组（Group 1）共 7 个切片应被完全移除，正片（Group 0 和 Group 2 共 151 个切片）应 100% 保留
  assert.equal(filtered.length, 151)
  assert.ok(filtered.every((s) => s.discontinuityGroup !== 1))
  assert.equal(filtered[0]?.uri, 'https://vip.lz-cdn.com/hls/hash000000.ts')
  assert.equal(filtered[72]?.uri, 'https://vip.lz-cdn.com/hls/hash000072.ts')
  assert.equal(filtered[73]?.uri, 'https://vip.lz-cdn.com/hls/hash000073.ts')
})

test('filterAds: protects normal short groups with continuous sequence from false positive', () => {
  const segments: M3u8Segment[] = []

  // Group 0: 5 segments (seq 0..4)
  for (let i = 0; i <= 4; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.lz-cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 0,
    })
  }

  // Group 1: 5 segments (seq 5..9)
  for (let i = 5; i <= 9; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.lz-cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 1,
    })
  }

  // Group 2: 10 segments (seq 10..19)
  for (let i = 10; i <= 19; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.lz-cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 2,
    })
  }

  // 全部序号严格连续，不应误删任何正片切片
  const filtered = filterAds(segments)
  assert.equal(filtered.length, 20)
})

test('filterM3u8AdsIfApplicable: cleans m3u8 playlist end-to-end within safeguard ratio', () => {
  // 构建一个总长约 400s 的流，中插 1 段 26s 的断层广告（占比 ~6.5% < 8%）
  const lines: string[] = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-TARGETDURATION:5',
  ]

  // Group 0 (正片前段: seq 0..50, 51*4 = 204s)
  for (let i = 0; i <= 50; i++) {
    lines.push('#EXTINF:4.000,')
    lines.push(`seg_${String(i).padStart(4, '0')}.ts`)
  }

  // Group 1 (广告插入: seq 999901..999905, 5*4 = 20s)
  lines.push('#EXT-X-DISCONTINUITY')
  for (let i = 999901; i <= 999905; i++) {
    lines.push('#EXTINF:4.000,')
    lines.push(`seg_${i}.ts`)
  }

  // Group 2 (正片后段: seq 51..100, 50*4 = 200s)
  lines.push('#EXT-X-DISCONTINUITY')
  for (let i = 51; i <= 100; i++) {
    lines.push('#EXTINF:4.000,')
    lines.push(`seg_${String(i).padStart(4, '0')}.ts`)
  }
  lines.push('#EXT-X-ENDLIST')

  const m3u8 = lines.join('\n')
  const res = filterM3u8AdsIfApplicable(
    m3u8,
    'https://vip.lz-cdn.com/hls/index.m3u8',
  )
  assert.equal(res.filtered, true)
  assert.equal(res.removed, 5)
  assert.ok(!res.content.includes('999901'))
  assert.ok(!res.content.includes('999905'))
  assert.ok(res.content.includes('seg_0050.ts'))
  assert.ok(res.content.includes('seg_0051.ts'))
})

test('filterAds: detects multi-group consecutive ad insertion', () => {
  const segments: M3u8Segment[] = []

  // Group 0: 正片前段 (seq 0..72, 73*4 = 292s)
  for (let i = 0; i <= 72; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 0,
    })
  }

  // Group 1: 广告第一截 (seq 439360..439362, 3*3.5 = 10.5s)
  for (let i = 439360; i <= 439362; i++) {
    segments.push({
      duration: 3.5,
      uri: `https://vip.cdn.com/hls/hash0${i}.ts`,
      discontinuityGroup: 1,
    })
  }

  // Group 2: 广告第二截 (seq 439363..439365, 3*3.5 = 10.5s)
  for (let i = 439363; i <= 439365; i++) {
    segments.push({
      duration: 3.5,
      uri: `https://vip.cdn.com/hls/hash0${i}.ts`,
      discontinuityGroup: 2,
    })
  }

  // Group 3: 正片后段 (seq 73..150, 78*4 = 312s)
  for (let i = 73; i <= 150; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 3,
    })
  }

  const filtered = filterAds(segments)
  // 连续两组广告（Group 1 和 Group 2）应全被移除
  assert.equal(filtered.length, 151)
  assert.ok(filtered.every((s) => s.discontinuityGroup !== 1 && s.discontinuityGroup !== 2))
})

test('filterAds: detects head preroll ad when main content resets to 0', () => {
  const segments: M3u8Segment[] = []

  // Group 0: 片头插播广告 (seq 888001..888004, 4*3 = 12s)
  for (let i = 888001; i <= 888004; i++) {
    segments.push({
      duration: 3,
      uri: `https://vip.cdn.com/hls/hash0${i}.ts`,
      discontinuityGroup: 0,
    })
  }

  // Group 1: 正片开始 (seq 0..100, 101*4 = 404s)
  for (let i = 0; i <= 100; i++) {
    segments.push({
      duration: 4,
      uri: `https://vip.cdn.com/hls/hash${String(i).padStart(6, '0')}.ts`,
      discontinuityGroup: 1,
    })
  }

  const filtered = filterAds(segments)
  // 片头广告 Group 0 应被精准移除
  assert.equal(filtered.length, 101)
  assert.ok(filtered.every((s) => s.discontinuityGroup !== 0))
  assert.equal(filtered[0]?.uri, 'https://vip.cdn.com/hls/hash000000.ts')
})
