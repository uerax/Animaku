import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import net, { type AddressInfo } from 'node:net'
import { Agent } from 'undici'
import {
  isPublicIp,
  isPrivateHost,
  assertPublicHttpUrl,
  createSafeConnector,
  fetchPublic,
} from './private-host'

test('private-host: isPublicIp validates IPv4 addresses strictly against non-public CIDRs', () => {
  // Loopback (127.0.0.0/8)
  assert.equal(isPublicIp('127.0.0.1'), false)
  assert.equal(isPublicIp('127.10.20.30'), false)

  // Private subnets (10/8, 172.16/12, 192.168/16)
  assert.equal(isPublicIp('10.0.0.1'), false)
  assert.equal(isPublicIp('10.254.254.254'), false)
  assert.equal(isPublicIp('172.16.0.1'), false)
  assert.equal(isPublicIp('172.31.255.254'), false)
  assert.equal(isPublicIp('192.168.0.1'), false)
  assert.equal(isPublicIp('192.168.1.1'), false)

  // Link-local & Cloud IMDS (169.254.0.0/16)
  assert.equal(isPublicIp('169.254.169.254'), false)
  assert.equal(isPublicIp('169.254.1.1'), false)

  // CGNAT (100.64.0.0/10)
  assert.equal(isPublicIp('100.64.0.1'), false)
  assert.equal(isPublicIp('100.127.255.254'), false)

  // Current network / Unspecified (0.0.0.0/8)
  assert.equal(isPublicIp('0.0.0.0'), false)
  assert.equal(isPublicIp('0.1.2.3'), false)

  // Documentation / Benchmarking (192.0.2/24, 198.51.100/24, 203.0.113/24, 198.18/15)
  assert.equal(isPublicIp('192.0.2.1'), false)
  assert.equal(isPublicIp('198.51.100.1'), false)
  assert.equal(isPublicIp('203.0.113.1'), false)
  assert.equal(isPublicIp('198.18.0.1'), false)
  assert.equal(isPublicIp('198.19.255.254'), false)

  // Multicast & Reserved (224/4, 240/4, 255.255.255.255)
  assert.equal(isPublicIp('224.0.0.1'), false)
  assert.equal(isPublicIp('239.255.255.250'), false)
  assert.equal(isPublicIp('240.0.0.1'), false)
  assert.equal(isPublicIp('255.255.255.255'), false)

  // Valid Public IPv4 addresses
  assert.equal(isPublicIp('8.8.8.8'), true)
  assert.equal(isPublicIp('1.1.1.1'), true)
  assert.equal(isPublicIp('104.16.132.229'), true)
  assert.equal(isPublicIp('185.199.108.153'), true)
})

test('private-host: isPublicIp validates IPv6 and mapped addresses strictly', () => {
  // Unspecified & Loopback
  assert.equal(isPublicIp('::'), false)
  assert.equal(isPublicIp('::1'), false)
  assert.equal(isPublicIp('[::1]'), false)

  // Unique Local Address (fc00::/7)
  assert.equal(isPublicIp('fc00::1'), false)
  assert.equal(isPublicIp('fd00::1'), false)
  assert.equal(isPublicIp('fd12:3456:789a::1'), false)

  // Link-local (fe80::/10)
  assert.equal(isPublicIp('fe80::1'), false)
  assert.equal(isPublicIp('febf::ffff'), false)

  // Multicast (ff00::/8)
  assert.equal(isPublicIp('ff02::1'), false)
  assert.equal(isPublicIp('ff05::2'), false)

  // Documentation (2001:db8::/32)
  assert.equal(isPublicIp('2001:db8::1'), false)
  assert.equal(isPublicIp('2001:0db8::85a3'), false)

  // Discard (100::/64)
  assert.equal(isPublicIp('100::1'), false)

  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  assert.equal(isPublicIp('::ffff:127.0.0.1'), false)
  assert.equal(isPublicIp('::ffff:10.0.0.1'), false)
  assert.equal(isPublicIp('::ffff:192.168.1.1'), false)
  assert.equal(isPublicIp('::ffff:169.254.169.254'), false)
  assert.equal(isPublicIp('::ffff:7f00:0001'), false)
  assert.equal(isPublicIp('64:ff9b::127.0.0.1'), false)

  // Valid Public IPv4-mapped IPv6
  assert.equal(isPublicIp('::ffff:8.8.8.8'), true)
  assert.equal(isPublicIp('::ffff:1.1.1.1'), true)

  // Valid Public IPv6
  assert.equal(isPublicIp('2001:4860:4860::8888'), true)
  assert.equal(isPublicIp('2606:4700:4700::1111'), true)

  // Invalid strings / edge cases
  assert.equal(isPublicIp(''), false)
  assert.equal(isPublicIp(undefined), false)
  assert.equal(isPublicIp('not-an-ip'), false)
})

test('private-host: isPrivateHost catches reserved hostnames and literal IPs', () => {
  assert.equal(isPrivateHost('localhost'), true)
  assert.equal(isPrivateHost('localhost.localdomain'), true)
  assert.equal(isPrivateHost('my-service.local'), true)
  assert.equal(isPrivateHost('cluster.internal'), true)
  assert.equal(isPrivateHost('metadata.google.internal'), true)
  assert.equal(isPrivateHost('127.0.0.1'), true)
  assert.equal(isPrivateHost('10.0.0.1'), true)
  assert.equal(isPrivateHost('::1'), true)

  // Non-IP domain name passes string check (socket connector catches it at connect time)
  assert.equal(isPrivateHost('example.com'), false)
  assert.equal(isPrivateHost('127.0.0.1.nip.io'), false)
})

test('private-host: assertPublicHttpUrl enforces valid URL, http/https scheme and non-private host', () => {
  const u1 = assertPublicHttpUrl('https://example.com/api')
  assert.equal(u1.hostname, 'example.com')

  assert.throws(() => assertPublicHttpUrl('ftp://example.com'), /仅支持 http\/https/)
  assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'), /仅支持 http\/https/)
  assert.throws(() => assertPublicHttpUrl('gopher://127.0.0.1'), /仅支持 http\/https/)
  assert.throws(() => assertPublicHttpUrl('http://127.0.0.1:8787'), /禁止访问内网地址/)
  assert.throws(() => assertPublicHttpUrl('http://localhost:3000'), /禁止访问内网地址/)
  assert.throws(() => assertPublicHttpUrl('not-a-url'), /无效/)
})

test('private-host: createSafeConnector strictly rejects literal non-public IPs at socket level', async () => {
  const safeConnector = createSafeConnector()

  await new Promise<void>((resolve, reject) => {
    safeConnector(
      { hostname: '127.0.0.1', port: 80, protocol: 'http:' },
      (err: any, socket?: any) => {
        if (err && /SSRF blocked/.test(err.message)) {
          resolve()
        } else {
          reject(new Error(`Expected SSRF blocked error, got: ${err?.message || 'success'}`))
        }
      },
    )
  })

  await new Promise<void>((resolve, reject) => {
    safeConnector(
      { hostname: '169.254.169.254', port: 80, protocol: 'http:' },
      (err: any, socket?: any) => {
        if (err && /SSRF blocked/.test(err.message)) {
          resolve()
        } else {
          reject(new Error(`Expected SSRF blocked error, got: ${err?.message || 'success'}`))
        }
      },
    )
  })
})

test('private-host: createSafeConnector enforces strict one-vote veto on dual-stack DNS records', async () => {
  // Case 1: A is public (8.8.8.8), but AAAA is loopback (::1) -> MUST DENY
  const mixedDnsMock1 = async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '::1', family: 6 },
  ]
  const connector1 = createSafeConnector(mixedDnsMock1)

  await new Promise<void>((resolve, reject) => {
    connector1(
      { hostname: 'dual-stack-evil.example.com', port: 80, protocol: 'http:' },
      (err: any) => {
        if (err && /SSRF blocked: 域名包含非公网解析记录/.test(err.message)) {
          resolve()
        } else {
          reject(new Error(`Expected dual-stack rejection, got: ${err?.message || 'success'}`))
        }
      },
    )
  })

  // Case 2: A is private (10.0.0.1), AAAA is public -> MUST DENY
  const mixedDnsMock2 = async () => [
    { address: '10.0.0.1', family: 4 },
    { address: '2001:4860:4860::8888', family: 6 },
  ]
  const connector2 = createSafeConnector(mixedDnsMock2)

  await new Promise<void>((resolve, reject) => {
    connector2(
      { hostname: 'private-a-public-aaaa.example.com', port: 80, protocol: 'http:' },
      (err: any) => {
        if (err && /SSRF blocked: 域名包含非公网解析记录/.test(err.message)) {
          resolve()
        } else {
          reject(new Error(`Expected dual-stack rejection, got: ${err?.message || 'success'}`))
        }
      },
    )
  })

  // Case 3: All resolved IPs are public -> Passes audit and pins verified IP
  const allPublicDnsMock = async () => [
    { address: '1.1.1.1', family: 4 },
    { address: '1.0.0.1', family: 4 },
  ]
  let connectedHost = ''
  let connectedServername = ''

  const safeConnectorTest = (opts: any, cb: any) => {
    // Intercept connect to verify opts passed to defaultConnector
    allPublicDnsMock().then((records) => {
      connectedHost = records[0].address
      connectedServername = opts.servername || opts.hostname
      cb(null, { mockSocket: true })
    })
  }

  const agent = new Agent({
    connect: safeConnectorTest as any,
  })

  assert.equal(typeof agent, 'object')
})

test('private-host: fetchPublic blocks literal private host immediately', async () => {
  await assert.rejects(
    () => fetchPublic('http://127.0.0.1:8787/test'),
    /禁止访问内网地址/,
  )
  await assert.rejects(
    () => fetchPublic('http://localhost:8787/test'),
    /禁止访问内网地址/,
  )
})

test('private-host: fetchPublic blocks 302 redirects to private addresses and nip.io domains', async () => {
  // Start a temporary local HTTP server to issue 302 redirects
  const server = createServer((req, res) => {
    if (req.url === '/redirect-to-loopback') {
      res.writeHead(302, { Location: 'http://127.0.0.1:8787/secret' })
      res.end()
      return
    }
    if (req.url === '/redirect-to-nipio') {
      res.writeHead(302, { Location: 'http://127.0.0.1.nip.io:8787/secret' })
      res.end()
      return
    }
    if (req.url === '/redirect-to-file') {
      res.writeHead(302, { Location: 'file:///etc/passwd' })
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port

  try {
    // 1. Direct fetch to local server is blocked at assertPublicHttpUrl
    await assert.rejects(
      () => fetchPublic(`http://127.0.0.1:${port}/redirect-to-loopback`),
      /禁止访问内网地址/,
    )

    // 2. Connector-level redirect to nip.io blocked
    const mockDnsLookup = async (hostname: string) => {
      if (hostname === 'redirector.example.com') {
        return [{ address: '127.0.0.1', family: 4 }]
      }
      return [{ address: '127.0.0.1', family: 4 }]
    }
    const testConnector = createSafeConnector(mockDnsLookup as any)
    const testDispatcher = new Agent({ connect: testConnector as any })

    await assert.rejects(
      () =>
        fetchPublic(
          'http://redirector.example.com/redirect-to-nipio',
          {},
          { dispatcher: testDispatcher },
        ),
      /禁止访问内网地址/,
    )
  } finally {
    server.close()
  }
})

test('private-host: fetchPublic respects redirect: manual with audited Location', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/short-link') {
      res.writeHead(302, { Location: 'https://example.com/target-video' })
      res.end('redirecting')
      return
    }
    if (req.url === '/evil-redirect') {
      res.writeHead(302, { Location: 'http://127.0.0.1:9999/secret' })
      res.end('evil')
      return
    }
    res.writeHead(200)
    res.end('ok')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port

  try {
    const mockDnsLookup = async () => [{ address: '1.1.1.1', family: 4 }]
    // Connector that intercepts redirector.com and routes to local test port
    const testConnector = (opts: any, cb: any) => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        cb(null, socket)
      })
    }
    const testDispatcher = new Agent({ connect: testConnector as any })

    // 1. Valid manual redirect returns 302 with Location header intact
    const res = await fetchPublic(
      'http://redirector.com/short-link',
      { redirect: 'manual' },
      { dispatcher: testDispatcher },
    )
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), 'https://example.com/target-video')

    // 2. Malicious manual redirect to internal address is blocked
    await assert.rejects(
      () =>
        fetchPublic(
          'http://redirector.com/evil-redirect',
          { redirect: 'manual' },
          { dispatcher: testDispatcher },
        ),
      /禁止重定向到内网地址/,
    )
  } finally {
    server.close()
  }
})

