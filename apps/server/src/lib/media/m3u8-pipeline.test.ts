import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isM3u8Path,
  isM3u8Response,
  readTextLimited,
  rewriteM3u8Uri,
  rewriteExtUriAttrs,
  processM3u8Playlist,
} from './m3u8-pipeline'

test('m3u8-pipeline: isM3u8Path & isM3u8Response identify playlist accurately', () => {
  assert.equal(isM3u8Path(new URL('https://cdn.com/stream/index.m3u8')), true)
  assert.equal(isM3u8Path(new URL('https://cdn.com/stream/index.m3u8?token=123')), true)
  assert.equal(isM3u8Path(new URL('https://cdn.com/stream/segment.ts')), false)

  const hlsHeaders = new Headers({ 'content-type': 'application/vnd.apple.mpegurl' })
  assert.equal(isM3u8Response(new Response(null, { headers: hlsHeaders }), new URL('https://a.com/play')), true)

  const octetHeaders = new Headers({ 'content-type': 'application/octet-stream' })
  assert.equal(isM3u8Response(new Response(null, { headers: octetHeaders }), new URL('https://a.com/index.m3u8')), true)
  assert.equal(isM3u8Response(new Response(null, { headers: octetHeaders }), new URL('https://a.com/video.mp4')), false)
})

test('m3u8-pipeline: readTextLimited enforces byte bounds', async () => {
  const shortText = '#EXTM3U\n#EXTINF:10,\nseg1.ts'
  const res = new Response(shortText)
  const content = await readTextLimited(res, 1000)
  assert.equal(content, shortText)

  const bigRes = new Response('X'.repeat(500))
  await assert.rejects(
    async () => {
      await readTextLimited(bigRes, 100)
    },
    /播放列表过大/,
  )
})

test('m3u8-pipeline: rewriteM3u8Uri correctly routes hybrid vs full proxy', () => {
  const base = new URL('https://origin.cdn.com/live/hls/master.m3u8')

  // Hybrid ad-filter mode: .ts segments remain direct on CDN
  const hybridTs = rewriteM3u8Uri('seg001.ts', base, {
    referer: 'https://origin.cdn.com/',
    cookie: '',
    hasMediaAuth: true,
    adFilter: true,
    fullProxy: false,
  })
  assert.equal(hybridTs, 'https://origin.cdn.com/live/hls/seg001.ts')

  // Hybrid ad-filter mode: nested .m3u8 routes through proxy with adFilter=1
  const hybridSublist = rewriteM3u8Uri('sublist_1080p.m3u8', base, {
    referer: 'https://origin.cdn.com/',
    cookie: '',
    hasMediaAuth: true,
    adFilter: true,
    fullProxy: false,
  })
  assert.match(hybridSublist, /^\/api\/media\/proxy\?/)
  assert.match(hybridSublist, /adFilter=1/)
  assert.match(hybridSublist, /sublist_1080p\.m3u8/)

  // Full proxy mode: .ts segments route through proxy
  const fullTs = rewriteM3u8Uri('seg001.ts', base, {
    referer: 'https://origin.cdn.com/',
    cookie: 'session=abc',
    token: 'admin-key',
    hasMediaAuth: true,
    adFilter: false,
    fullProxy: true,
  })
  assert.match(fullTs, /^\/api\/media\/proxy\?/)
  assert.match(fullTs, /fullProxy=1/)
  assert.match(fullTs, /token=admin-key/)
  assert.match(fullTs, /cookie=session%3Dabc/)

  // Private network host: never proxied
  const privateSeg = rewriteM3u8Uri('http://192.168.1.100/seg.ts', base, {
    referer: '',
    cookie: '',
    hasMediaAuth: true,
  })
  assert.equal(privateSeg, 'http://192.168.1.100/seg.ts')
})

test('m3u8-pipeline: rewriteExtUriAttrs rewrites KEY/MAP URI tags', () => {
  const base = new URL('https://origin.cdn.com/live/hls/index.m3u8')
  const line = '#EXT-X-KEY:METHOD=AES-128,URI="key.php?id=123",IV=0x1234'
  const rewritten = rewriteExtUriAttrs(line, base, {
    referer: 'https://origin.cdn.com/',
    cookie: '',
    token: 'my-tok',
    hasMediaAuth: true,
    fullProxy: true,
  })
  assert.match(rewritten, /#EXT-X-KEY:METHOD=AES-128,URI="\/api\/media\/proxy\?/)
  assert.match(rewritten, /key\.php%3Fid%3D123/)
})

test('m3u8-pipeline: processM3u8Playlist computes VOD vs rolling live cache control', () => {
  const base = new URL('https://origin.cdn.com/vod/video.m3u8')
  const vodPlaylist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:10',
    '#EXTINF:9.009,',
    'segment0.ts',
    '#EXT-X-ENDLIST',
  ].join('\n')

  const vodRes = processM3u8Playlist(vodPlaylist, base, {
    referer: '',
    cookie: '',
    hasMediaAuth: false,
  })
  assert.equal(vodRes.cacheControl, 'private, max-age=180')
  assert.match(vodRes.content, /segment0\.ts/)

  const livePlaylist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:10',
    '#EXTINF:9.009,',
    'live_seg_100.ts',
  ].join('\n')

  const liveRes = processM3u8Playlist(livePlaylist, base, {
    referer: '',
    cookie: '',
    hasMediaAuth: false,
  })
  assert.equal(liveRes.cacheControl, 'private, max-age=3')
})
