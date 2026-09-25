import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type net from 'node:net'
import { ProxyAgent } from 'undici'
import { parseProxyPool, parseSourceProxyMap } from '../config'
import { getDispatcherForSource, clearProxyAgentCache } from './outbound-proxy'
import { fetchPublic } from './private-host'

test('parseProxyPool: correctly extracts and normalizes proxy pool from env', () => {
  const env: NodeJS.ProcessEnv = {
    PROXY_1: 'http://127.0.0.1:7890',
    PROXY_2: 'socks5://127.0.0.1:1080',
    PROXY_CN: 'http://192.168.1.50:8080',
    UNRELATED_ENV: 'foobar',
  }

  const pool = parseProxyPool(env)

  // PROXY_1 -> proxy1 and proxy_1
  assert.equal(pool['proxy1'], 'http://127.0.0.1:7890')
  assert.equal(pool['proxy_1'], 'http://127.0.0.1:7890')

  // PROXY_2 -> proxy2 and proxy_2 (socks5)
  assert.equal(pool['proxy2'], 'socks5://127.0.0.1:1080')
  assert.equal(pool['proxy_2'], 'socks5://127.0.0.1:1080')

  // PROXY_CN -> proxy_cn and proxycn
  assert.equal(pool['proxy_cn'], 'http://192.168.1.50:8080')
  assert.equal(pool['proxycn'], 'http://192.168.1.50:8080')

  // Unrelated variables should not be included
  assert.equal(pool['unrelated_env'], undefined)
})

test('parseSourceProxyMap: parses comma-delimited strings, JSON and overrides', () => {
  // 1. Comma-separated
  const env1: NodeJS.ProcessEnv = {
    SOURCE_PROXY_MAP: 'cycani:proxy1, Anime1:proxy2 ,mxdm:proxy_cn',
  }
  const map1 = parseSourceProxyMap(env1)
  assert.equal(map1['cycani'], 'proxy1')
  assert.equal(map1['anime1'], 'proxy2')
  assert.equal(map1['mxdm'], 'proxy_cn')

  // 2. JSON format
  const env2: NodeJS.ProcessEnv = {
    SOURCE_PROXY_MAP: JSON.stringify({
      CYCANI: 'proxy1',
      anime1: 'proxy2',
    }),
  }
  const map2 = parseSourceProxyMap(env2)
  assert.equal(map2['cycani'], 'proxy1')
  assert.equal(map2['anime1'], 'proxy2')

  // 3. Dedicated environment variable overrides
  const env3: NodeJS.ProcessEnv = {
    SOURCE_PROXY_MAP: 'cycani:proxy1',
    SOURCE_PROXY_CYCANI: 'proxy_override',
    SOURCE_PROXY_GIRIGIRI: 'proxy_special',
  }
  const map3 = parseSourceProxyMap(env3)
  assert.equal(map3['cycani'], 'proxy_override')
  assert.equal(map3['girigiri'], 'proxy_special')
})

test('getDispatcherForSource: routes sources to corresponding HTTP and SOCKS5 ProxyAgents', () => {
  clearProxyAgentCache()

  const mockPool = {
    proxy1: 'http://127.0.0.1:7890',
    proxy2: 'socks5://127.0.0.1:1080',
    proxy_auth: 'socks5://user:pass@127.0.0.1:1081',
  }
  const mockMap = {
    cycani: 'proxy1',
    anime1: 'proxy2',
    auth_src: 'proxy_auth',
    bad_src: 'proxy_nonexistent',
  }

  // 1. Unmapped source -> returns null (direct connection)
  const unmapped = getDispatcherForSource('girigiri', mockPool, mockMap)
  assert.equal(unmapped, null)

  // 2. HTTP proxy mapping (cycani -> proxy1)
  const agent1 = getDispatcherForSource('cycani', mockPool, mockMap)
  assert.ok(agent1 instanceof ProxyAgent)

  // Cache reuse check
  const agent1Again = getDispatcherForSource('cycani', mockPool, mockMap)
  assert.equal(agent1, agent1Again)

  // 3. SOCKS5 proxy mapping (anime1 -> proxy2)
  const agentSocks5 = getDispatcherForSource('anime1', mockPool, mockMap)
  assert.ok(agentSocks5 instanceof ProxyAgent)

  // 4. Authenticated SOCKS5 proxy mapping
  const agentAuthSocks5 = getDispatcherForSource('auth_src', mockPool, mockMap)
  assert.ok(agentAuthSocks5 instanceof ProxyAgent)

  // 5. Source mapped to non-existent proxy -> warns and returns null (graceful direct fallback)
  const badAgent = getDispatcherForSource('bad_src', mockPool, mockMap)
  assert.equal(badAgent, null)
})

test('fetchPublic: respects source-aware dispatcher without breaking public host verification', async () => {
  // Test that fetchPublic accepts opts.source without throwing type or runtime issues
  // Literal private addresses should still be blocked before dispatcher resolution
  await assert.rejects(
    async () => {
      await fetchPublic('http://127.0.0.1:1234/test', {}, { source: 'cycani' })
    },
    /禁止访问内网地址/,
  )
})

test('end-to-end: fetchPublic forwards request through mapped outbound proxy and receives response', async () => {
  let proxyHitCount = 0
  const mockProxy = http.createServer((req, res) => {
    proxyHitCount++
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Proxied-By': 'MockProxy',
    })
    res.end(JSON.stringify({ ok: true, proxied: true }))
  })

  await new Promise<void>((resolve) => mockProxy.listen(0, '127.0.0.1', () => resolve()))
  const address = mockProxy.address() as net.AddressInfo
  const proxyPort = address.port

  try {
    const customPool = {
      proxy1: `http://127.0.0.1:${proxyPort}`,
    }
    const customMap = {
      cycani: 'proxy1',
    }

    // 1. 获取分配给 cycani 的 ProxyAgent
    const agent = getDispatcherForSource('cycani', customPool, customMap)
    assert.ok(agent instanceof ProxyAgent)

    // 2. 发起公网地址请求，通过 dispatcher 走 mock 代理
    const res = await fetchPublic('http://example.com/api/test', {}, { dispatcher: agent })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-proxied-by'), 'MockProxy')
    const json = (await res.json()) as { ok: boolean; proxied: boolean }
    assert.equal(json.proxied, true)
    assert.equal(proxyHitCount, 1)
  } finally {
    mockProxy.close()
  }
})
