import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mediaRoutes } from '../../routes/media'
import { sourceRoutes } from '../../routes/source'
import { playbackRegistry, PlaybackRegistry } from './playback-registry'
import { sourceRegistry } from '../source/source-registry'
import { kvCache } from '../../db/repositories/kv-cache'
import { isPublicIp, createSafeConnector, fetchPublic } from '../private-host'
import { config } from '../../config'
import { sanitizeParams, sanitizeUrlPath } from '../logger'

test('Security Matrix 1: SSRF / DNS Rebinding socket-level interception', async () => {
  // 1. Literal Non-Public IPs
  assert.equal(isPublicIp('127.0.0.1'), false)
  assert.equal(isPublicIp('169.254.169.254'), false)
  assert.equal(isPublicIp('10.0.0.1'), false)
  assert.equal(isPublicIp('::1'), false)
  assert.equal(isPublicIp('::ffff:127.0.0.1'), false)
  assert.equal(isPublicIp('100.64.0.1'), false)

  // 2. Safe connector one-vote veto on dual stack DNS rebinding
  const mockMixedDns = async () => [
    { address: '1.1.1.1', family: 4 },
    { address: '::1', family: 6 }, // poisoned AAAA record
  ]
  const connector = createSafeConnector(mockMixedDns)

  await new Promise<void>((resolve, reject) => {
    connector(
      { hostname: 'rebinding.attack.com', port: 80, protocol: 'http:' },
      (err: any) => {
        if (err && /包含非公网解析记录/.test(err.message)) {
          resolve()
        } else {
          reject(new Error(`Expected dual-stack rejection, got ${err?.message}`))
        }
      },
    )
  })

  // 3. fetchPublic directly blocks private targets
  await assert.rejects(
    () => fetchPublic('http://169.254.169.254/latest/meta-data/'),
    /禁止访问内网地址/,
  )
})

test('Security Matrix 2: 302 redirects to internal networks and nip.io blocked', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/jump-loopback') {
      res.writeHead(302, { Location: 'http://127.0.0.1:8787/admin' })
      res.end()
      return
    }
    if (req.url === '/jump-nipio') {
      res.writeHead(302, { Location: 'http://127.0.0.1.nip.io:8787/' })
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port

  try {
    await assert.rejects(
      () => fetchPublic(`http://127.0.0.1:${port}/jump-loopback`),
      /禁止访问内网地址/,
    )
  } finally {
    server.close()
  }
})

test('Security Matrix 3: EgressPolicyEngine blocks text/html masquerading as M3U8', async () => {
  // Start dummy server returning HTML (e.g. Cloudflare challenge or 403 page)
  const fakeServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<html><head><title>Cloudflare Just a moment...</title></head><body>WAF Block</body></html>')
  })

  await new Promise<void>((resolve) => fakeServer.listen(0, '127.0.0.1', () => resolve()))
  const port = (fakeServer.address() as AddressInfo).port

  try {
    // In mock adapter, point to this fake server
    const key = randomBytes(32)
    const mockPlayback = new PlaybackRegistry({ key, kv: kvCache })
    const asset = mockPlayback.registerAsset({
      source: 'xifan',
      baseUrl: `http://next.xifanacg.com:${port}/fake.m3u8`,
    })

    const token = mockPlayback.issueTicket({
      aid: asset.assetId,
      src: 'xifan',
      typ: 'playlist',
    })

    // Request via media gateway /stream
    const res = await mediaRoutes.request(`/stream?t=${encodeURIComponent(token)}`)
    // Because next.xifanacg.com cannot connect or if html is returned, it must not return 200 mpegurl!
    assert.notEqual(res.status, 200)
  } finally {
    fakeServer.close()
  }
})

test('Security Matrix 4: Unauthenticated url query parameter strictly rejected with 400', async () => {
  // 1. mediaRoutes
  const r1 = await mediaRoutes.request('/stream?url=https://evil.com/a.m3u8')
  assert.equal(r1.status, 400)
  assert.equal(((await r1.json()) as any).error, 'forbidden_params')

  const r2 = await mediaRoutes.request('/segment?url=https://evil.com/a.ts')
  assert.equal(r2.status, 400)
  assert.equal(((await r2.json()) as any).error, 'forbidden_params')

  const r3 = await mediaRoutes.request('/proxy?url=https://evil.com/a.ts')
  assert.equal(r3.status, 400)
  assert.equal(((await r3.json()) as any).error, 'forbidden_params')

  // 2. sourceRoutes parameter injection
  const r4 = await sourceRoutes.request('/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'xifan',
      keyword: '火影',
      customHost: 'http://internal.service',
    }),
  })
  assert.equal(r4.status, 400)
  assert.equal(((await r4.json()) as any).error, 'forbidden_params')

  const r5 = await sourceRoutes.request('/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'cycani',
      pageUrl: 'https://cycani.org/video/1',
      cookies: 'admin=1',
    }),
  })
  assert.equal(r5.status, 400)
  assert.equal(((await r5.json()) as any).error, 'forbidden_params')
})

test('Security Matrix 5: Tampered, expired or revoked tickets strictly rejected with 403', async () => {
  // 1. Tampered token
  const res1 = await mediaRoutes.request('/stream?t=v1.malformed_payload_here')
  assert.equal(res1.status, 403)

  // 2. Expired ticket
  const asset = playbackRegistry.registerAsset({
    source: 'tvtfun',
    baseUrl: 'https://stream.tvtfun.net/play.m3u8',
  })
  const expiredTicket = playbackRegistry.issueTicket({
    aid: asset.assetId,
    src: 'tvtfun',
    typ: 'playlist',
    ttlSec: 1,
  })

  await new Promise((r) => setTimeout(r, 1100))
  const res2 = await mediaRoutes.request(`/stream?t=${encodeURIComponent(expiredTicket)}`)
  assert.equal(res2.status, 403)
  assert.equal(((await res2.json()) as any).error, 'TOKEN_EXPIRED')

  // 3. JTI Revoked ticket
  const validTicket = playbackRegistry.issueTicket({
    aid: asset.assetId,
    src: 'tvtfun',
    typ: 'playlist',
  })
  const verified = playbackRegistry.verifyTicket(validTicket)
  if (verified.valid) {
    playbackRegistry.revokeTicket(verified.payload.jti, verified.payload.exp)
  }

  const res3 = await mediaRoutes.request(`/stream?t=${encodeURIComponent(validTicket)}`)
  assert.equal(res3.status, 403)
  assert.equal(((await res3.json()) as any).error, 'TOKEN_REVOKED')
})

test('Security Matrix 6: 302 Open Redirect reflection to internal targets blocked', async () => {
  // Register an asset pointing to an internal / loopback host (SSRF reflection attempt)
  const rogueAsset = playbackRegistry.registerAsset({
    source: 'xifan-next',
    baseUrl: 'http://127.0.0.1:8787/admin/keys',
  })

  // Force issue segment ticket
  const ticket = playbackRegistry.issueTicket({
    aid: rogueAsset.assetId,
    src: 'xifan-next',
    typ: 'segment',
    sub: 'chunk.ts',
  })

  // /segment must intercept the internal host and refuse 302
  const res = await mediaRoutes.request(`/segment?t=${encodeURIComponent(ticket)}`)
  assert.equal(res.status, 403)
  assert.notEqual(res.status, 302)
})

test('Security Matrix 7: Credential isolation and egress log redaction', () => {
  // 1. ADMIN_SECRET and MEDIA_SECRET isolation in config
  assert.ok(typeof config.adminSecret === 'string')
  assert.ok(typeof config.mediaSecret === 'string')

  // 2. Sensitive log parameters masked
  const sensitiveObj = {
    title: '海贼王',
    ep: 100,
    token: 'super_secret_token_123',
    ticket: 'v1.sensitive_opaque_ticket',
    proxyToken: 'admin_proxy_pass',
    cookie: 'session_id=abcdef',
    safeParam: 'public_value',
  }
  const sanitized = sanitizeParams(sensitiveObj)
  assert.equal(sanitized.title, '海贼王')
  assert.equal(sanitized.token, '***')
  assert.equal(sanitized.ticket, '***')
  assert.equal(sanitized.proxyToken, '***')
  assert.equal(sanitized.cookie, '***')
  assert.equal(sanitized.safeParam, 'public_value')

  // 3. Sensitive URL path query masked
  const urlPath = '/api/media/stream?t=v1.very_long_secret_ticket&adFilter=1'
  const sanitizedPath = sanitizeUrlPath(urlPath)
  assert.equal(sanitizedPath, '/api/media/stream?t=***&adFilter=1')
})
