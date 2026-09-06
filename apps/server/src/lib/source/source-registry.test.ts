import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { SourceRegistry } from './source-registry'
import { PlaybackRegistry } from '../media/playback-registry'
import { kvCache } from '../../db/repositories/kv-cache'
import type { SourceAdapter } from './source-types'
import { sourceRoutes } from '../../routes/source'

test('source-registry: lists built-in 6 tier adapters and handles alias normalization', () => {
  const registry = new SourceRegistry()
  const list = registry.listSources()

  assert.equal(list.length >= 6, true)
  const ids = list.map((s) => s.id)
  assert.ok(ids.includes('xifan-next'))
  assert.ok(ids.includes('xifan'))
  assert.ok(ids.includes('cycani'))
  assert.ok(ids.includes('moonci'))
  assert.ok(ids.includes('tvtfun'))
  assert.ok(ids.includes('anime1'))

  // 独立源独立存在
  const xifanNext = registry.getAdapter('xifan-next')
  assert.equal(xifanNext?.id, 'xifan-next')
  assert.equal(xifanNext?.name, '稀饭Next')

  const xifan = registry.getAdapter('xifan')
  assert.equal(xifan?.id, 'xifan')
  assert.equal(xifan?.name, '稀饭动漫')

  // 别名归一化查找
  assert.equal(registry.getAdapter('稀饭Next')?.id, 'xifan-next')
  assert.equal(registry.getAdapter('xifan_next')?.id, 'xifan-next')
  assert.equal(registry.getAdapter('稀饭动漫')?.id, 'xifan')
  assert.equal(registry.getAdapter('次元城')?.id, 'cycani')
  assert.equal(registry.getAdapter('月之祠')?.id, 'moonci')
  assert.equal(registry.getAdapter('anime1.me')?.id, 'anime1')
})

test('source-registry: validateEgress enforces protocol, standard web ports, and public host boundary', () => {
  const registry = new SourceRegistry()

  // 1. 公网合法地址与标准端口正常通过
  const okResult = registry.validateEgress(
    'https://next.xifanacg.com/anime/123',
    'xifan-next',
  )
  assert.equal(okResult.valid, true)

  // 2. 动态轮换 CDN (如 apn.moedot.net) 正常通过，不再受静态域名白名单误杀
  const cdnOk = registry.validateEgress(
    'https://apn.moedot.net/d/wo/2607/video.mp4',
    'xifan-next',
  )
  assert.equal(cdnOk.valid, true)

  // 3. 通用规则源 (如 omofun, libvio, custom) 同样受到公网 Web 出站安全审计
  const customOk = registry.validateEgress(
    'https://cdn.libvio.link/play.m3u8',
    'libvio',
  )
  assert.equal(customOk.valid, true)

  // 4. 非法协议拦截 (ftp:, file:, gopher:)
  const badScheme = registry.validateEgress(
    'ftp://next.xifanacg.com/file',
    'xifan',
  )
  assert.equal(badScheme.valid, false)
  assert.match(badScheme.reason || '', /disallowed protocol/i)

  // 5. 非法端口拦截 (6379, 22, 3306)
  const badPort = registry.validateEgress(
    'https://next.xifanacg.com:6379/data',
    'xifan',
  )
  assert.equal(badPort.valid, false)
  assert.match(badPort.reason || '', /port 6379 not permitted/i)

  // 6. 私有 IP / 回环 SSRF 物理层严格拦截
  const loopback = registry.validateEgress(
    'http://127.0.0.1:8787/admin',
    'xifan',
  )
  assert.equal(loopback.valid, false)

  const internalIp = registry.validateEgress(
    'http://192.168.1.1/router',
    'cycani',
  )
  assert.equal(internalIp.valid, false)
})

test('source-registry: resolveAndRegister registers PlaybackAsset and returns correct streamUrl', async () => {
  const key = randomBytes(32)
  const playback = new PlaybackRegistry({ key, kv: kvCache })

  // Mock a safe adapter for HLS
  const mockHlsAdapter: SourceAdapter = {
    id: 'mock_hls',
    name: 'Mock HLS Source',
    tier: 'tier_a',
    capabilities: {
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

  // Mock an MP4 adapter
  const mockMp4Adapter: SourceAdapter = {
    id: 'mock_mp4',
    name: 'Mock MP4 Source',
    tier: 'tier_a',
    capabilities: {
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
        mediaUrl: 'https://cdn.safe-video.com/mp4/ep1.mp4',
        publicHeaders: { Referer: 'https://safe-video.com/' },
        credentials: '',
        format: 'mp4',
      }
    },
  }

  const registry = new SourceRegistry({
    playback,
    adapters: [mockHlsAdapter, mockMp4Adapter],
  })

  // 1. HLS 应返回 /api/media/stream?t=...
  const hlsOutput = await registry.resolveAndRegister(
    'mock_hls',
    'https://safe-video.com/play/1',
  )
  assert.equal(hlsOutput.source, 'mock_hls')
  assert.equal(hlsOutput.format, 'hls')
  assert.ok(hlsOutput.ticket.startsWith('v1.'))
  assert.ok(hlsOutput.streamUrl.startsWith('/api/media/stream?t=v1.'))

  // 2. MP4 应返回 /api/media/segment?t=...
  const mp4Output = await registry.resolveAndRegister(
    'mock_mp4',
    'https://safe-video.com/play/2',
  )
  assert.equal(mp4Output.source, 'mock_mp4')
  assert.equal(mp4Output.format, 'mp4')
  assert.ok(mp4Output.ticket.startsWith('v1.'))
  assert.ok(mp4Output.streamUrl.startsWith('/api/media/segment?t=v1.'))
})
