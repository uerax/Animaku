import test from 'node:test'
import assert from 'node:assert/strict'
import {
  originFromReferer,
  resolveEffectiveReferer,
} from './media-fetcher'

test('media-fetcher: originFromReferer extracts protocol and host cleanly', () => {
  assert.equal(originFromReferer('https://example.com/video/123.m3u8'), 'https://example.com')
  assert.equal(originFromReferer('http://cdn.stream.com:8080/path'), 'http://cdn.stream.com:8080')
  assert.equal(originFromReferer('invalid-url'), '')
})

test('media-fetcher: resolveEffectiveReferer handles empty, local and external referers', () => {
  const target = new URL('https://source.video.cdn/media/hls/ep1.m3u8')

  // Empty referer -> fallbacks to target.origin/
  const emptyRes = resolveEffectiveReferer('', target)
  assert.equal(emptyRes.referer, 'https://source.video.cdn/')
  assert.equal(emptyRes.origin, 'https://source.video.cdn')

  // Local loopback referer (localhost:3000) -> fallbacks to target origin
  const localRes = resolveEffectiveReferer('http://localhost:3000/watch/100', target)
  assert.equal(localRes.referer, 'https://source.video.cdn/')
  assert.equal(localRes.origin, 'https://source.video.cdn')

  // 127.0.0.1 referer -> fallbacks to target origin
  const ipLocalRes = resolveEffectiveReferer('http://127.0.0.1:8787/test', target)
  assert.equal(ipLocalRes.referer, 'https://source.video.cdn/')

  // External valid referer (e.g. from plugin rule) -> preserves exactly
  const extRes = resolveEffectiveReferer('https://mxdm.tv/play/123-1-1.html', target)
  assert.equal(extRes.referer, 'https://mxdm.tv/play/123-1-1.html')
  assert.equal(extRes.origin, 'https://mxdm.tv')
})
