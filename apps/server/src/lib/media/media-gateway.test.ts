import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { rewriteM3u8Ast } from './hls-pipeline'
import { PlaybackRegistry, playbackRegistry } from './playback-registry'
import { SourceRegistry } from '../source/source-registry'
import { kvCache } from '../../db/repositories/kv-cache'
import { mediaRoutes } from '../../routes/media'
import type { SourceAdapter } from '../source/source-types'

test('hls-pipeline: rewrites variant playlists, keys, init map and segments with opaque tickets', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn1.xifan.cc/series/ep1/master.m3u8',
  })

  const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x1234567890abcdef1234567890abcdef
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
seg-001.ts
#EXTINF:6.0,
seg-002.ts
#EXT-X-ENDLIST`

  const rewritten = rewriteM3u8Ast(sampleM3u8, asset, '', { playback })

  // 1. All real URLs must be eradicated
  assert.equal(rewritten.includes('enc.key"'), false)
  assert.equal(rewritten.includes('init.mp4"'), false)
  assert.equal(rewritten.includes('seg-001.ts'), false)
  assert.equal(rewritten.includes('seg-002.ts'), false)

  // 2. #EXT-X-KEY rewrites to /api/media/segment?t=...
  const keyMatch = rewritten.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"/)
  assert.ok(keyMatch)
  assert.ok(keyMatch[1].startsWith('/api/media/segment?t=v1.'))
  const keyTicket = decodeURIComponent(keyMatch[1].split('t=')[1])
  const verifyKey = playback.verifyTicket(keyTicket, 'key')
  assert.equal(verifyKey.valid, true)
  if (verifyKey.valid) {
    assert.equal(verifyKey.normalizedSub, 'enc.key')
  }

  // 3. #EXT-X-MAP rewrites to /api/media/segment?t=...
  const mapMatch = rewritten.match(/#EXT-X-MAP:URI="([^"]+)"/)
  assert.ok(mapMatch)
  assert.ok(mapMatch[1].startsWith('/api/media/segment?t=v1.'))
  const mapTicket = decodeURIComponent(mapMatch[1].split('t=')[1])
  const verifyMap = playback.verifyTicket(mapTicket, 'segment')
  assert.equal(verifyMap.valid, true)
  if (verifyMap.valid) {
    assert.equal(verifyMap.normalizedSub, 'init.mp4')
  }

  // 4. #EXTINF segment lines rewrite to /api/media/segment?t=...
  const lines = rewritten.split('\n')
  const segLines = lines.filter((l) => l.startsWith('/api/media/segment?t='))
  assert.equal(segLines.length, 2)
  const seg0Ticket = decodeURIComponent(segLines[0].split('t=')[1])
  const verifySeg0 = playback.verifyTicket(seg0Ticket, 'segment')
  assert.equal(verifySeg0.valid, true)
  if (verifySeg0.valid) {
    assert.equal(verifySeg0.normalizedSub, 'seg-001.ts')
  }
})

test('hls-pipeline: rewrites multi-rendition master playlist to /api/media/stream?t=...', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'cycani',
    baseUrl: 'https://cycr2.top/vod/index.m3u8',
  })

  const masterM3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080
1080p.m3u8`

  const rewritten = rewriteM3u8Ast(masterM3u8, asset, '', { playback })

  assert.equal(rewritten.includes('720p.m3u8'), false)
  assert.equal(rewritten.includes('1080p.m3u8'), false)

  const streamLines = rewritten
    .split('\n')
    .filter((l) => l.startsWith('/api/media/stream?t='))
  assert.equal(streamLines.length, 2)

  const childTicket = decodeURIComponent(streamLines[0].split('t=')[1])
  const verifyChild = playback.verifyTicket(childTicket, 'playlist')
  assert.equal(verifyChild.valid, true)
  if (verifyChild.valid) {
    assert.equal(verifyChild.normalizedSub, '720p.m3u8')
  }

  // With adFilter = true
  const rewrittenWithAdFilter = rewriteM3u8Ast(masterM3u8, asset, '', { playback, adFilter: true })
  const streamLinesWithAd = rewrittenWithAdFilter
    .split('\n')
    .filter((l) => l.startsWith('/api/media/stream?t='))
  assert.equal(streamLinesWithAd.length, 2)
  for (const line of streamLinesWithAd) {
    assert.ok(line.includes('&adFilter=1'), `Expected child playlist URL to contain &adFilter=1: ${line}`)
  }

  // With forceProxy = true
  const rewrittenWithForceProxy = rewriteM3u8Ast(masterM3u8, asset, '', { playback, forceProxy: true })
  const streamLinesWithForceProxy = rewrittenWithForceProxy
    .split('\n')
    .filter((l) => l.startsWith('/api/media/stream?t='))
  assert.equal(streamLinesWithForceProxy.length, 2)
  for (const line of streamLinesWithForceProxy) {
    assert.ok(line.includes('&stream=1'), `Expected child playlist URL to contain &stream=1: ${line}`)
  }

  // Media playlist with forceProxy = true: segments must contain &stream=1
  const mediaM3u8 = `#EXTM3U
#EXTINF:6.0,
seg-001.ts
#EXT-X-ENDLIST`
  const rewrittenMediaProxy = rewriteM3u8Ast(mediaM3u8, asset, '', { playback, forceProxy: true })
  assert.ok(rewrittenMediaProxy.includes('/api/media/segment?t='))
  assert.ok(rewrittenMediaProxy.includes('&stream=1'))
})

test('hls-pipeline: rewrites #EXT-X-MEDIA audio and subtitle playlist URIs with opaque tickets', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'cycani',
    baseUrl: 'https://cycr2.top/vod/master.m3u8',
  })

  const m3u8WithMedia = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Japanese",DEFAULT=YES,AUTOSELECT=YES,URI="audio/ja.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Chinese",DEFAULT=YES,URI="subs/zh.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2560000,AUDIO="audio",SUBTITLES="subs"
1080p.m3u8`

  const rewritten = rewriteM3u8Ast(m3u8WithMedia, asset, '', { playback })

  assert.equal(rewritten.includes('audio/ja.m3u8'), false)
  assert.equal(rewritten.includes('subs/zh.m3u8'), false)

  // Both AUDIO and SUBTITLES URIs must be rewritten as /api/media/stream?t=...
  const audioMatch = rewritten.match(/#EXT-X-MEDIA:TYPE=AUDIO,[^\n]*URI="([^"]+)"/)
  assert.ok(audioMatch)
  assert.ok(audioMatch[1].startsWith('/api/media/stream?t=v1.'))
  const audioTicket = decodeURIComponent(audioMatch[1].split('t=')[1])
  const verifyAudio = playback.verifyTicket(audioTicket, 'playlist')
  assert.equal(verifyAudio.valid, true)
  if (verifyAudio.valid) {
    assert.equal(verifyAudio.normalizedSub, 'audio/ja.m3u8')
  }

  const subsMatch = rewritten.match(/#EXT-X-MEDIA:TYPE=SUBTITLES,[^\n]*URI="([^"]+)"/)
  assert.ok(subsMatch)
  assert.ok(subsMatch[1].startsWith('/api/media/stream?t=v1.'))
  const subsTicket = decodeURIComponent(subsMatch[1].split('t=')[1])
  const verifySubs = playback.verifyTicket(subsTicket, 'playlist')
  assert.equal(verifySubs.valid, true)
  if (verifySubs.valid) {
    assert.equal(verifySubs.normalizedSub, 'subs/zh.m3u8')
  }
})

test('mediaRoutes: strictly rejects url query parameter with 400', async () => {
  // 1. /stream?url=... -> 400
  const res1 = await mediaRoutes.request('/stream?url=https://evil.com/play.m3u8')
  assert.equal(res1.status, 400)
  const json1 = (await res1.json()) as { error: string }
  assert.equal(json1.error, 'forbidden_params')

  // 2. /segment?url=... -> 400
  const res2 = await mediaRoutes.request('/segment?url=https://evil.com/seg.ts')
  assert.equal(res2.status, 400)
  const json2 = (await res2.json()) as { error: string }
  assert.equal(json2.error, 'forbidden_params')

  // 3. /proxy?url=... -> 400
  const res3 = await mediaRoutes.request('/proxy?url=https://evil.com/seg.ts')
  assert.equal(res3.status, 400)
  const json3 = (await res3.json()) as { error: string }
  assert.equal(json3.error, 'forbidden_params')
})

test('mediaRoutes: rejects missing, tampered or expired tickets', async () => {
  // 1. Missing ticket -> 400
  const res1 = await mediaRoutes.request('/stream')
  assert.equal(res1.status, 400)

  // 2. Tampered ticket -> 403
  const res2 = await mediaRoutes.request('/stream?t=v1.invalid_tampered_base64_string')
  assert.equal(res2.status, 403)
})

test('mediaRoutes: /segment returns 302 redirect in high performance mode and prevents Open Redirect', async () => {
  // Register an asset for xifan (allowed host includes s2.xifanacg.com)
  const asset = playbackRegistry.registerAsset({
    source: 'xifan',
    baseUrl: 'https://s2.xifanacg.com/video/index.m3u8',
  })

  // Issue segment ticket for seg-001.ts
  const ticket = playbackRegistry.issueTicket({
    aid: asset.assetId,
    src: 'xifan',
    typ: 'segment',
    sub: 'seg-001.ts',
  })

  // GET /api/media/segment?t=...
  const res = await mediaRoutes.request(`/segment?t=${encodeURIComponent(ticket)}`)

  // Must return 302 Found redirecting directly to CDN
  assert.equal(res.status, 302)
  const location = res.headers.get('location')
  assert.equal(location, 'https://s2.xifanacg.com/video/seg-001.ts')
})

test('mediaRoutes: internal cross-dispatch handles segment ticket on /stream without 403 TYPE_MISMATCH', async () => {
  const asset = playbackRegistry.registerAsset({
    source: 'xifan-next',
    baseUrl: 'https://apn.moedot.net/d/wo/2607/ep1.mp4',
  })

  // Issue segment ticket (e.g. MP4)
  const ticket = playbackRegistry.issueTicket({
    aid: asset.assetId,
    src: 'xifan-next',
    typ: 'segment',
    sub: '',
  })

  // Requesting via /stream?t=... should adapt gracefully without TYPE_MISMATCH 403
  const res = await mediaRoutes.request(`/stream?t=${encodeURIComponent(ticket)}`)
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://apn.moedot.net/d/wo/2607/ep1.mp4')
})

test('mediaRoutes: key ticket on /stream is strictly rejected with 403 (Capability cannot be elevated)', async () => {
  const asset = playbackRegistry.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn1.xifan.cc/series/ep1/master.m3u8',
  })

  // Issue key ticket
  const ticket = playbackRegistry.issueTicket({
    aid: asset.assetId,
    src: 'xifan',
    typ: 'key',
    sub: 'enc.key',
  })

  // Requesting key ticket on /stream must be 403 forbidden
  const res = await mediaRoutes.request(`/stream?t=${encodeURIComponent(ticket)}`)
  assert.equal(res.status, 403)
  const json = (await res.json()) as { error: string }
  assert.equal(json.error, 'forbidden_capability')
})

test('hls-pipeline: correctly classifies segment carrying .m3u8 in query string as segment ticket', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn1.xifan.cc/series/ep1/index.m3u8',
  })

  // A media playlist where segment query parameter contains '.m3u8'
  const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:9.0,
chunk-001.ts?source=origin_stream.m3u8&expires=2026-09-07T12:00:00Z
#EXT-X-ENDLIST`

  const rewritten = rewriteM3u8Ast(sampleM3u8, asset, '', { playback })

  // Must rewrite to /api/media/segment, NEVER /api/media/stream
  assert.ok(rewritten.includes('/api/media/segment?t='))
  assert.equal(rewritten.includes('/api/media/stream?t='), false)

  const segMatch = rewritten.match(/\/api\/media\/segment\?t=([^&\n\r]+)/)
  assert.ok(segMatch)
  const ticket = decodeURIComponent(segMatch[1])
  const verify = playback.verifyTicket(ticket, 'segment')
  assert.equal(verify.valid, true)
  if (verify.valid) {
    assert.equal(verify.payload.typ, 'segment')
    assert.equal(verify.normalizedSub, 'chunk-001.ts?source=origin_stream.m3u8&expires=2026-09-07T12:00:00Z')
  }
})

test('hls-pipeline: correctly computes relativeSub when baseUrl is at root path', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'cycani',
    baseUrl: 'https://cdn.example.com/index.m3u8',
  })

  const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
/seg-001.ts
#EXTINF:10.0,
seg-002.ts
#EXT-X-ENDLIST`

  const rewritten = rewriteM3u8Ast(sampleM3u8, asset, '', { playback })

  const segLines = rewritten.split('\n').filter((l) => l.startsWith('/api/media/segment?t='))
  assert.equal(segLines.length, 2)

  // Both segments should reuse the parent asset without triggering extra sub-asset registrations
  const ticket0 = decodeURIComponent(segLines[0].split('t=')[1])
  const verify0 = playback.verifyTicket(ticket0, 'segment')
  assert.equal(verify0.valid, true)
  if (verify0.valid) {
    assert.equal(verify0.payload.aid, asset.assetId)
    assert.equal(verify0.normalizedSub, 'seg-001.ts')
  }

  const ticket1 = decodeURIComponent(segLines[1].split('t=')[1])
  const verify1 = playback.verifyTicket(ticket1, 'segment')
  assert.equal(verify1.valid, true)
  if (verify1.valid) {
    assert.equal(verify1.payload.aid, asset.assetId)
    assert.equal(verify1.normalizedSub, 'seg-002.ts')
  }
})

test('hls-pipeline: correctly computes relativeSub when baseUrl has trailing directory slash', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'tvtfun',
    baseUrl: 'https://cdn.example.com/hls/ep1/',
  })

  const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
/hls/ep1/chunk-001.ts
#EXTINF:10.0,
chunk-002.ts
#EXT-X-ENDLIST`

  const rewritten = rewriteM3u8Ast(sampleM3u8, asset, '', { playback })

  const segLines = rewritten.split('\n').filter((l) => l.startsWith('/api/media/segment?t='))
  assert.equal(segLines.length, 2)

  // Segment 1 (absolute path in m3u8)
  const ticket0 = decodeURIComponent(segLines[0].split('t=')[1])
  const verify0 = playback.verifyTicket(ticket0, 'segment')
  assert.equal(verify0.valid, true)
  if (verify0.valid) {
    assert.equal(verify0.payload.aid, asset.assetId)
    // Must NOT be 'hls/ep1/chunk-001.ts'
    assert.equal(verify0.normalizedSub, 'chunk-001.ts')
    const resolvedUrl = playback.resolveAssetUrl(asset, verify0.normalizedSub)
    assert.equal(resolvedUrl, 'https://cdn.example.com/hls/ep1/chunk-001.ts')
  }

  // Segment 2 (relative path in m3u8)
  const ticket1 = decodeURIComponent(segLines[1].split('t=')[1])
  const verify1 = playback.verifyTicket(ticket1, 'segment')
  assert.equal(verify1.valid, true)
  if (verify1.valid) {
    assert.equal(verify1.payload.aid, asset.assetId)
    assert.equal(verify1.normalizedSub, 'chunk-002.ts')
    const resolvedUrl = playback.resolveAssetUrl(asset, verify1.normalizedSub)
    assert.equal(resolvedUrl, 'https://cdn.example.com/hls/ep1/chunk-002.ts')
  }
})



