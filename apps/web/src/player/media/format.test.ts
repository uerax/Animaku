import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inferMediaType,
  isM3u8,
  inferMediaMimeType,
} from './format.ts'

test('inferMediaType: formatHint priority', () => {
  assert.equal(inferMediaType('https://example.com/test.mp4', 'hls'), 'hls')
  assert.equal(inferMediaType('https://example.com/test.m3u8', 'mp4'), 'progressive')
})

test('inferMediaType: controlled ticket pathname contract', () => {
  assert.equal(inferMediaType('/api/media/stream?t=ticket123'), 'hls')
  assert.equal(inferMediaType('/api/media/segment?t=ticket456'), 'progressive')
  assert.equal(inferMediaType('http://localhost:3000/api/media/stream?t=ticket123'), 'hls')
  assert.equal(inferMediaType('http://localhost:3000/api/media/segment?t=ticket456'), 'progressive')
})

test('inferMediaType: standard CDN pathname extensions', () => {
  assert.equal(inferMediaType('https://cdn.test/video.m3u8?token=abc'), 'hls')
  assert.equal(inferMediaType('https://cdn.test/video.m3u'), 'hls')
  assert.equal(inferMediaType('https://cdn.test/video.mp4?query=1'), 'progressive')
  assert.equal(inferMediaType('https://cdn.test/video.m4v'), 'progressive')
  assert.equal(inferMediaType('https://cdn.test/video.ts'), 'progressive')
  assert.equal(inferMediaType('https://cdn.test/video.webm'), 'progressive')
})

test('inferMediaType: fallback progressive on unknown or invalid url', () => {
  assert.equal(inferMediaType(''), 'progressive')
  assert.equal(inferMediaType('not-a-url'), 'progressive')
  assert.equal(inferMediaType('https://cdn.test/unknown-stream'), 'progressive')
})

test('isM3u8: delegates to inferMediaType', () => {
  assert.equal(isM3u8('/api/media/stream?t=xxx'), true)
  assert.equal(isM3u8('/api/media/segment?t=xxx'), false)
  assert.equal(isM3u8('https://cdn.test/video.m3u8'), true)
  assert.equal(isM3u8('https://cdn.test/video.mp4'), false)
})

test('inferMediaMimeType: mime inference', () => {
  assert.equal(inferMediaMimeType('/api/media/stream?t=xxx'), 'application/vnd.apple.mpegurl')
  assert.equal(inferMediaMimeType('https://cdn.test/video.m3u8'), 'application/vnd.apple.mpegurl')
  assert.equal(inferMediaMimeType('/api/media/segment?t=xxx'), 'video/mp4')
  assert.equal(inferMediaMimeType('https://cdn.test/video.mp4'), 'video/mp4')
  assert.equal(inferMediaMimeType('https://cdn.test/video.webm'), 'video/webm')
})
