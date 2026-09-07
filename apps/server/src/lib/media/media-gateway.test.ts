import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { rewriteM3u8Ast } from './hls-pipeline'
import { PlaybackRegistry, playbackRegistry, sanitizePublicHeaders } from './playback-registry'
import { getActiveStreamsForIp, resetActiveStreams } from './stream-tracker'
import { SourceRegistry } from '../source/source-registry'
import { kvCache } from '../../db/repositories/kv-cache'
import { mediaRoutes } from '../../routes/media'
import { sourceRoutes } from '../../routes/source'
import { wrapResolveWithTicket } from '../../rule-engine'
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

  // 4. /status?url=... -> 400
  const res4 = await mediaRoutes.request('/status?url=https://evil.com/play.m3u8')
  assert.equal(res4.status, 400)
  const json4 = (await res4.json()) as { error: string }
  assert.equal(json4.error, 'forbidden_params')
})

test('mediaRoutes: /status provides zero-I/O ticket and asset health verification', async () => {
  // 1. Missing ticket -> 400
  const res1 = await mediaRoutes.request('/status')
  assert.equal(res1.status, 400)

  // 2. Tampered ticket -> 403
  const res2 = await mediaRoutes.request('/status?t=v1.invalid_tampered_base64_string')
  assert.equal(res2.status, 403)
  const json2 = (await res2.json()) as { error: string }
  assert.ok(json2.error)

  // 3. Valid ticket with existing active asset -> 204 No Content
  const asset = playbackRegistry.registerAsset({
    source: 'anime1',
    baseUrl: 'https://v.anime1.me/watch/123/stream.m3u8',
  })
  const validTicket = playbackRegistry.issueTicket({
    aid: asset.assetId,
    src: 'anime1',
    typ: 'playlist',
    sub: '',
  })
  const res3 = await mediaRoutes.request(`/status?t=${encodeURIComponent(validTicket)}`)
  assert.equal(res3.status, 204)

  // 4. Asset evicted / server restarted (assetId not found in memory) -> 403 ASSET_NOT_FOUND
  playbackRegistry.clearCaches()
  const res4 = await mediaRoutes.request(`/status?t=${encodeURIComponent(validTicket)}`)
  assert.equal(res4.status, 403)
  const json4 = (await res4.json()) as { error: string }
  assert.equal(json4.error, 'ASSET_NOT_FOUND')
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

test('mediaRoutes: handlePlaylistStream strictly releases concurrency slots on completions and errors without leaks', async () => {
  resetActiveStreams()
  const testIp = '127.0.0.1'

  // Repeatedly request invalid or nonexistent tickets on /stream
  for (let i = 0; i < 15; i++) {
    const res = await mediaRoutes.request('/stream?t=v1.invalid_ticket_string', {
      headers: { 'x-forwarded-for': testIp },
    })
    assert.equal(res.status, 403)
  }

  // Verify stream tracker has 0 active streams for the IP (never blocked with 429)
  assert.equal(getActiveStreamsForIp(testIp), 0)
})

test('hls-pipeline: strips ad segments when adFilter is true on media playlist', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn1.xifan.cc/series/ep1/index.m3u8',
  })

  // Media playlist with discontinuity groups (main video + ad inserted)
  const adM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
main-01.ts
#EXTINF:10.0,
main-02.ts
#EXTINF:10.0,
main-03.ts
#EXT-X-DISCONTINUITY
#EXTINF:5.0,
https://ad.domain.com/ad01.ts
#EXTINF:5.0,
https://ad.domain.com/ad02.ts
#EXT-X-DISCONTINUITY
#EXTINF:10.0,
main-04.ts
#EXTINF:10.0,
main-05.ts
#EXTINF:10.0,
main-06.ts
#EXTINF:10.0,
main-07.ts
#EXTINF:10.0,
main-08.ts
#EXTINF:10.0,
main-09.ts
#EXTINF:10.0,
main-10.ts
#EXTINF:10.0,
main-11.ts
#EXTINF:10.0,
main-12.ts
#EXTINF:10.0,
main-13.ts
#EXTINF:10.0,
main-14.ts
#EXTINF:10.0,
main-15.ts
#EXT-X-ENDLIST`

  const rewritten = rewriteM3u8Ast(adM3u8, asset, '', { playback, adFilter: true })

  // The ad domain segments should be stripped
  assert.equal(rewritten.includes('ad01.ts'), false)
  assert.equal(rewritten.includes('ad02.ts'), false)
  // Main segments should remain
  assert.ok(rewritten.includes('/api/media/segment?t='))
})

test('hls-pipeline: correctly resolves parent-relative ../ segment paths without duplicating subdirectory', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'cycani',
    baseUrl: 'https://cdn.example.com/hls/master.m3u8',
  })

  // Child playlist situated at currentSub = '720p/index.m3u8'
  // Real URL is https://cdn.example.com/hls/720p/index.m3u8
  // Segment points to '../segments/seg0.ts', which resolves to https://cdn.example.com/hls/segments/seg0.ts
  const childM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:6.0,
../segments/seg0.ts
#EXT-X-ENDLIST`

  const rewritten = rewriteM3u8Ast(childM3u8, asset, '720p/index.m3u8', { playback })

  const segMatch = rewritten.match(/\/api\/media\/segment\?t=([^&\n\r]+)/)
  assert.ok(segMatch)
  const ticket = decodeURIComponent(segMatch[1])
  const verify = playback.verifyTicket(ticket, 'segment')
  assert.equal(verify.valid, true)
  if (verify.valid) {
    // The sub path must be normalized to 'segments/seg0.ts' relative to baseUrl's baseDir (/hls/)
    assert.equal(verify.normalizedSub, 'segments/seg0.ts')
    const resolvedUrl = playback.resolveAssetUrl(asset, verify.normalizedSub)
    assert.equal(resolvedUrl, 'https://cdn.example.com/hls/segments/seg0.ts')
  }
})

test('playbackRegistry: sanitizePublicHeaders strips sensitive credentials from publicHeaders', () => {
  const dirty = {
    'User-Agent': 'TestAgent/1.0',
    Referer: 'https://example.com/',
    Cookie: 'session=12345; auth=token',
    cookie: 'extra=1',
    Authorization: 'Bearer secret',
    'proxy-authorization': 'Basic secret',
  }
  const cleaned = sanitizePublicHeaders(dirty)
  assert.ok(cleaned)
  assert.equal(cleaned['User-Agent'], 'TestAgent/1.0')
  assert.equal(cleaned.Referer, 'https://example.com/')
  assert.equal('Cookie' in cleaned, false)
  assert.equal('cookie' in cleaned, false)
  assert.equal('Authorization' in cleaned, false)
  assert.equal('proxy-authorization' in cleaned, false)

  // Verify asset registration auto-sanitizes publicHeaders
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })
  const asset = playback.registerAsset({
    source: 'anime1',
    baseUrl: 'https://v.anime1.me/1.mp4',
    publicHeaders: dirty,
    credentials: 'secure-credential',
  })
  assert.ok(asset.publicHeaders)
  assert.equal('Cookie' in asset.publicHeaders, false)
  assert.equal('cookie' in asset.publicHeaders, false)
  assert.equal('Authorization' in asset.publicHeaders, false)
  assert.equal(asset.publicHeaders.Referer, 'https://example.com/')
  assert.equal(playback.getDecryptedCredentials(asset), 'secure-credential')
})

test('hls-pipeline: caps sub-assets per playlist to protect against DoS asset capacity exhaustion', () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const asset = playback.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn.example.com/live/index.m3u8',
  })

  // Craft a malicious/bloated playlist with 40 distinct cross-host directories
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3']
  for (let i = 0; i < 40; i++) {
    lines.push('#EXTINF:6.0,')
    lines.push(`https://cdn${i}.domain.com/path${i}/seg.ts`)
  }
  lines.push('#EXT-X-ENDLIST')

  const rewritten = rewriteM3u8Ast(lines.join('\n'), asset, '', { playback })
  assert.ok(rewritten)
  const tickets = rewritten.match(/\/api\/media\/segment\?t=([^&\n\r]+)/g)
  assert.ok(tickets && tickets.length === 40)
})

test('mediaRoutes: supports HEAD requests and injects X-Content-Type-Options nosniff across endpoints', async () => {
  const asset = playbackRegistry.registerAsset({
    source: 'cycani',
    baseUrl: 'https://cdn.example.com/ep.mp4',
  })
  const ticket = playbackRegistry.issueTicket({
    aid: asset.assetId,
    src: 'cycani',
    typ: 'segment',
  })

  // 1. HEAD /status
  const statusRes = await mediaRoutes.request(
    `http://localhost/status?t=${encodeURIComponent(ticket)}`,
    { method: 'HEAD' },
  )
  assert.equal(statusRes.status, 204)
  assert.equal(statusRes.headers.get('X-Content-Type-Options'), 'nosniff')

  // 2. HEAD /segment (MP4 302 redirect in high performance mode)
  const segRes = await mediaRoutes.request(
    `http://localhost/segment?t=${encodeURIComponent(ticket)}`,
    { method: 'HEAD' },
  )
  assert.equal(segRes.status, 302)
  assert.equal(segRes.headers.get('Location'), 'https://cdn.example.com/ep.mp4')
})

test('sourceRoutes: strictly rejects non-object JSON payloads with 400 bad_request instead of 500', async () => {
  const nonObjectPayloads = ['[]', 'null', '123', '"plain string"']

  for (const raw of nonObjectPayloads) {
    const res = await sourceRoutes.request('http://localhost/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    })
    assert.equal(res.status, 400)
    const data = (await res.json()) as { error: string; message: string }
    assert.equal(data.error, 'bad_request')
  }
})

test('wrapResolveWithTicket: preserves adFilter=1 on proxyUrl and redacts sensitive credentials from headers', () => {
  // 1. adBlocker: true should propagate &adFilter=1 to ticket proxyUrl
  const ruleWithAdBlocker = {
    name: 'test-ad-blocker',
    adBlocker: true,
  }
  const res1 = wrapResolveWithTicket(ruleWithAdBlocker as any, {
    playUrl: 'https://cdn.example.com/stream/index.m3u8',
    proxyUrl: '/api/media/proxy?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Findex.m3u8',
    format: 'hls',
  })
  assert.ok(res1.proxyUrl)
  assert.ok(res1.proxyUrl.includes('/api/media/stream?t='))
  assert.ok(res1.proxyUrl.endsWith('&adFilter=1'))

  // 2. MP4 should not have adFilter
  const res2 = wrapResolveWithTicket(ruleWithAdBlocker as any, {
    playUrl: 'https://cdn.example.com/video.mp4',
    proxyUrl: '/api/media/proxy?url=https%3A%2F%2Fcdn.example.com%2Fvideo.mp4',
    format: 'mp4',
  })
  assert.ok(res2.proxyUrl)
  assert.ok(res2.proxyUrl.includes('/api/media/segment?t='))
  assert.equal(res2.proxyUrl.includes('adFilter=1'), false)

  // 3. Cookie redaction: headers containing Cookie should be stripped in returned result
  const ruleWithCookie = {
    name: 'anime1',
  }
  const res3 = wrapResolveWithTicket(ruleWithCookie as any, {
    playUrl: 'https://v.anime1.me/1.mp4',
    proxyUrl: '/api/media/proxy?url=https%3A%2F%2Fv.anime1.me%2F1.mp4',
    format: 'mp4',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://anime1.me/',
      Cookie: 'session=secret123',
    },
  })
  assert.equal(res3.requiresProxy, true)
  assert.ok(res3.headers)
  assert.equal(res3.headers['User-Agent'], 'Mozilla/5.0')
  assert.equal(res3.headers.Referer, 'https://anime1.me/')
  assert.equal('Cookie' in res3.headers, false)
})



