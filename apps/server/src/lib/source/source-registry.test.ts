import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { SourceRegistry } from './source-registry'
import { PlaybackRegistry } from '../media/playback-registry'
import { kvCache } from '../../db/repositories/kv-cache'
import type { SourceAdapter } from './source-types'
import { sourceRoutes } from '../../routes/source'

test('source-registry: lists built-in 5 tier adapters', () => {
  const registry = new SourceRegistry()
  const list = registry.listSources()

  assert.equal(list.length >= 5, true)
  const ids = list.map((s) => s.id)
  assert.ok(ids.includes('xifan'))
  assert.ok(ids.includes('cycani'))
  assert.ok(ids.includes('moonci'))
  assert.ok(ids.includes('tvtfun'))
  assert.ok(ids.includes('anime1'))

  const xifan = registry.getAdapter('xifan')
  assert.equal(xifan?.tier, 'tier_a')
  const anime1 = registry.getAdapter('anime1')
  assert.equal(anime1?.tier, 'tier_b')
})

test('source-registry: validateEgress enforces exact host and port whitelist', () => {
  const registry = new SourceRegistry()

  // 1. Allowed exact host and standard port
  const okResult = registry.validateEgress(
    'https://next.xifanacg.com/anime/123',
    'xifan',
  )
  assert.equal(okResult.valid, true)

  const cdnOk = registry.validateEgress(
    'https://s2.xifanacg.com/video/ep1.m3u8',
    'xifan',
  )
  assert.equal(cdnOk.valid, true)

  // 2. Disallowed host (subdomain hijacking / unauthorized host)
  const badHost = registry.validateEgress(
    'https://attacker.xifanacg.com/video/ep1.m3u8',
    'xifan',
  )
  assert.equal(badHost.valid, false)
  assert.match(badHost.reason || '', /not declared in allowedHosts/i)

  // 3. Disallowed scheme (e.g. file:, ftp:)
  const badScheme = registry.validateEgress(
    'ftp://next.xifanacg.com/file',
    'xifan',
  )
  assert.equal(badScheme.valid, false)
  assert.match(badScheme.reason || '', /disallowed protocol/i)

  // 4. Disallowed non-web port (e.g. 22, 6379)
  const badPort = registry.validateEgress(
    'https://next.xifanacg.com:6379/data',
    'xifan',
  )
  assert.equal(badPort.valid, false)
  assert.match(badPort.reason || '', /port 6379 not permitted/i)

  // 5. Cross-source boundary enforcement (cycani host requested under moonci source)
  const crossSource = registry.validateEgress(
    'https://cycr2.top/video.mp4',
    'moonci',
  )
  assert.equal(crossSource.valid, false)
  assert.match(crossSource.reason || '', /not declared in allowedHosts/i)
})

test('source-registry: resolveAndRegister registers PlaybackAsset and returns opaque streamUrl', async () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  // Mock a safe adapter
  const mockAdapter: SourceAdapter = {
    id: 'mock_src',
    name: 'Mock Source',
    tier: 'tier_a',
    capabilities: {
      allowedHosts: ['cdn.safe-video.com'],
      allowedPorts: [80, 443],
    },
    async search() {
      return { pluginName: 'mock', items: [] }
    },
    async chapters() {
      return { pluginName: 'mock', roads: [] }
    },
    async resolve() {
      return {
        mediaUrl: 'https://cdn.safe-video.com/hls/ep1/master.m3u8',
        publicHeaders: { Referer: 'https://safe-video.com/' },
        credentials: 'session_cookie=123',
        format: 'hls',
      }
    },
  }

  const registry = new SourceRegistry({
    playback,
    adapters: [mockAdapter],
  })

  const output = await registry.resolveAndRegister(
    'mock_src',
    'https://safe-video.com/play/1',
  )

  // 1. Output must NOT leak the real upstream CDN URL
  assert.equal(output.source, 'mock_src')
  assert.equal(output.format, 'hls')
  assert.ok(output.ticket.startsWith('v1.'))
  assert.ok(output.streamUrl.startsWith('/api/media/stream?t=v1.'))
  assert.equal(output.streamUrl.includes('safe-video.com'), false)

  // 2. Playback registry must have the asset registered with encrypted credentials
  const verifyTicket = playback.verifyTicket(output.ticket, 'playlist')
  assert.equal(verifyTicket.valid, true)
  if (verifyTicket.valid) {
    assert.equal(
      verifyTicket.asset.baseUrl,
      'https://cdn.safe-video.com/hls/ep1/master.m3u8',
    )
    assert.deepEqual(verifyTicket.asset.publicHeaders, {
      Referer: 'https://safe-video.com/',
    })
    const creds = playback.getDecryptedCredentials(verifyTicket.asset)
    assert.equal(creds, 'session_cookie=123')
  }
})

test('source-registry: resolveAndRegister blocks undeclared host in raw resolve result', async () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  const rogueAdapter: SourceAdapter = {
    id: 'rogue_src',
    name: 'Rogue Source',
    tier: 'tier_b',
    capabilities: {
      allowedHosts: ['legit-site.com'],
      allowedPorts: [443],
    },
    async search() {
      return { pluginName: 'rogue', items: [] }
    },
    async chapters() {
      return { pluginName: 'rogue', roads: [] }
    },
    async resolve() {
      return {
        // Returns an undeclared host (e.g. internal or untrusted domain)
        mediaUrl: 'https://evil-cdn.com/malicious.mp4',
      }
    },
  }

  const registry = new SourceRegistry({
    playback,
    adapters: [rogueAdapter],
  })

  await assert.rejects(async () => {
    await registry.resolveAndRegister('rogue_src', 'https://legit-site.com/play/1')
  }, /Egress policy check failed/i)
})

test('sourceRoutes: HTTP boundary blocks network parameter injection', async () => {
  // 1. Injected baseURL -> 400 forbidden_params
  const res1 = await sourceRoutes.request('/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'xifan',
      keyword: '火影',
      baseURL: 'http://169.254.169.254/',
    }),
  })
  assert.equal(res1.status, 400)
  const json1 = (await res1.json()) as { error: string; message: string }
  assert.equal(json1.error, 'forbidden_params')
  assert.match(json1.message, /baseURL/i)

  // 2. Injected headers or cookies -> 400 forbidden_params
  const res2 = await sourceRoutes.request('/chapters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'cycani',
      url: 'https://cycani.org/video/1',
      headers: { 'X-Custom-Header': 'evil' },
    }),
  })
  assert.equal(res2.status, 400)
  const json2 = (await res2.json()) as { error: string }
  assert.equal(json2.error, 'forbidden_params')

  // 3. Injected rule object -> 400 forbidden_params
  const res3 = await sourceRoutes.request('/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'tvtfun',
      pageUrl: 'https://tvtfun.net/play/1',
      rule: { name: 'injected_rule', baseURL: 'http://evil.com' },
    }),
  })
  assert.equal(res3.status, 400)
  const json3 = (await res3.json()) as { error: string }
  assert.equal(json3.error, 'forbidden_params')

  // 4. Missing required parameters -> 400 bad_request
  const res4 = await sourceRoutes.request('/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'xifan',
    }),
  })
  assert.equal(res4.status, 400)
  const json4 = (await res4.json()) as { error: string }
  assert.equal(json4.error, 'bad_request')

  // 5. GET /list returns sources metadata
  const listRes = await sourceRoutes.request('/list', {
    method: 'GET',
  })
  assert.equal(listRes.status, 200)
  const listJson = (await listRes.json()) as { data: Array<{ id: string }> }
  assert.ok(Array.isArray(listJson.data))
  assert.ok(listJson.data.some((s) => s.id === 'xifan'))
})
