import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveFormatHint,
  buildPlayerKey,
  resolveSubtitleBundle,
} from './watch-stream.ts'

test('resolveFormatHint: format 优先判定', () => {
  assert.equal(resolveFormatHint({ playUrl: 'test', format: 'hls' }), 'hls')
  assert.equal(resolveFormatHint({ playUrl: 'test', format: 'm3u8' }), 'hls')
  assert.equal(resolveFormatHint({ playUrl: 'test', format: 'mp4' }), 'mp4')
  assert.equal(resolveFormatHint({ playUrl: 'test', format: 'progressive' }), 'mp4')
})

test('resolveFormatHint: contentType 回退判定', () => {
  assert.equal(
    resolveFormatHint({
      playUrl: 'test',
      contentType: 'application/vnd.apple.mpegurl',
    }),
    'hls',
  )
  assert.equal(
    resolveFormatHint({
      playUrl: 'test',
      contentType: 'video/mp4; codecs="avc1.42E01E"',
    }),
    'mp4',
  )
  assert.equal(
    resolveFormatHint({
      playUrl: 'test',
      contentType: 'application/octet-stream',
    }),
    undefined,
  )
  assert.equal(resolveFormatHint(undefined), undefined)
})

test('buildPlayerKey: 格式化组合', () => {
  const key = buildPlayerKey('https://example.com/video.mp4', 0, 'direct')
  assert.equal(key, 'https://example.com/video.mp4#0#direct')

  const remountKey = buildPlayerKey('/api/media/stream?t=123', 2, 'proxy')
  assert.equal(remountKey, '/api/media/stream?t=123#2#proxy')
})

test('resolveSubtitleBundle: 统一字幕与字体提取', () => {
  // 嵌套 bundle 结构
  const res1 = resolveSubtitleBundle({
    playUrl: 'test',
    subtitle: {
      subtitles: [{ url: 'sub.vtt', lang: 'zh-CN', label: '中文' }],
      fonts: ['font.ttf'],
    },
  })
  assert.equal(res1.subtitles?.length, 1)
  assert.equal(res1.fonts?.[0], 'font.ttf')
  assert.ok(res1.subtitle)

  // 平铺字段结构
  const res2 = resolveSubtitleBundle({
    playUrl: 'test',
    subtitles: [{ url: 'sub.vtt', lang: 'ja', label: '日文' }],
    fonts: ['font2.ttf'],
  })
  assert.equal(res2.subtitles?.length, 1)
  assert.equal(res2.fonts?.[0], 'font2.ttf')
  assert.ok(res2.subtitle)

  // 空数据
  const resEmpty = resolveSubtitleBundle(undefined)
  assert.equal(resEmpty.subtitle, undefined)
  assert.equal(resEmpty.subtitles, undefined)
  assert.equal(resEmpty.fonts, undefined)
})
