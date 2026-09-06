/**
 * 出站网络安全边界与物理层 SSRF 熔断防御
 * @module private-host
 */
import dns from 'node:dns'
import { fetch as undiciFetch, Agent, buildConnector } from 'undici'

function stripBrackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1)
  }
  return hostname
}

function parseIpv4(h: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((n) => n > 255)) return null
  return parts
}

/** IPv4-mapped IPv6 :ffff:a.b.c.d */
function ipv4FromMapped(h: string): number[] | null {
  const lower = h.toLowerCase()
  const m = /:ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower)
  if (m) return parseIpv4(m[1])
  // :ffff:aabb:ccdd hex form
  const hex = /:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower)
  if (!hex) return null
  const a = parseInt(hex[1], 16)
  const b = parseInt(hex[2], 16)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return [(a >> 8) & 0xff, a & 0xff, (b >> 8) & 0xff, b & 0xff]
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b, c] = parts
  // 0.0.0.0/8 (当前网络 / 保留)
  if (a === 0) return true
  // 10.0.0.0/8 (私网)
  if (a === 10) return true
  // 127.0.0.0/8 (回环)
  if (a === 127) return true
  // 169.254.0.0/16 (Link-local / 云元数据 IMDS)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 (私网)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16 (私网)
  if (a === 192 && b === 168) return true
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1), 192.88.99.0/24 (6to4 中继)
  if (a === 192 && b === 0) return true
  if (a === 192 && b === 88 && c === 99) return true
  // 198.18.0.0/15 (基准测试), 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true
  // 224.0.0.0/4 (组播) 与 240.0.0.0/4 (保留及广播 255.255.255.255)
  if (a >= 224) return true

  return false
}

function isPrivateIpv6(h: string): boolean {
  const s = h.toLowerCase().trim()
  if (s === '::' || s === '::1') return true
  // Unique Local fc00::/7 (fc/fd) 与 Link-Local fe80::/10 (fe8..feb)
  if (
    s.startsWith('fc') ||
    s.startsWith('fd') ||
    s.startsWith('fe8') ||
    s.startsWith('fe9') ||
    s.startsWith('fea') ||
    s.startsWith('feb')
  ) {
    return true
  }
  // 组播 ff00::/8
  if (s.startsWith('ff')) return true
  // 文档地址 2001:db8::/32
  if (s.startsWith('2001:db8') || s.startsWith('2001:0db8')) return true
  // 丢弃地址 100::/64
  if (s.startsWith('100::')) return true
  // ORCHIDv2 2001:10::/28 & 2001:20::/28
  if (s.startsWith('2001:1') || s.startsWith('2001:2')) return true

  // IPv4-mapped 解包
  if (s.startsWith('::ffff:') || s.includes('::ffff:')) {
    const v4 = ipv4FromMapped(s)
    if (v4) return isPrivateIpv4(v4)
  }

  // NAT64 64:ff9b::/96
  if (s.startsWith('64:ff9b::')) {
    const rest = s.slice('64:ff9b::'.length)
    const v4 = parseIpv4(rest)
    if (v4) return isPrivateIpv4(v4)
  }

  return false
}

/**
 * 校验 IP 地址是否属于安全的公网地址
 * 针对 IPv4、IPv6 及 IPv4-mapped 格式全面执行非公网反向白名单过滤
 */
export function isPublicIp(ip?: string | null): boolean {
  if (!ip) return false
  const s = stripBrackets(ip).trim().toLowerCase()
  if (!s) return false

  const v4 = parseIpv4(s)
  if (v4) {
    return !isPrivateIpv4(v4)
  }

  const mapped = ipv4FromMapped(s)
  if (mapped) {
    return !isPrivateIpv4(mapped)
  }

  if (s.includes(':')) {
    return !isPrivateIpv6(s)
  }

  return false
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default',
  'kubernetes.default.svc',
])

export function isLoopbackIp(ip: string | undefined | null): boolean {
  if (!ip) return true
  const s = stripBrackets(ip).trim().toLowerCase()
  if (!s) return true
  if (
    s === '127.0.0.1' ||
    s === '::1' ||
    s === 'localhost' ||
    s === '0.0.0.0' ||
    s === '::' ||
    s === '::ffff:127.0.0.1'
  ) {
    return true
  }
  if (s.startsWith('127.') || s.startsWith('::ffff:127.')) {
    return true
  }
  return false
}

export function isPrivateHost(hostname: string): boolean {
  const h = stripBrackets(hostname).toLowerCase().trim()
  if (!h) return true
  if (BLOCKED_HOSTNAMES.has(h)) return true
  if (
    h.endsWith('.local') ||
    h.endsWith('.localhost') ||
    h.endsWith('.internal')
  ) {
    return true
  }

  const v4 = parseIpv4(h)
  if (v4) return isPrivateIpv4(v4)

  const mapped = ipv4FromMapped(h)
  if (mapped) return isPrivateIpv4(mapped)

  if (h.includes(':')) return isPrivateIpv6(h)

  return false
}

export function assertPublicHttpUrl(raw: string, label = 'url'): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error(`${label} 无效`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${label} 仅支持 http/https`)
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error(`${label} 禁止访问内网地址`)
  }
  return u
}

export type DnsLookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>

/**
 * 构建底层安全 Undici Connector
 * 在 TCP Socket 连接握手前强制进行 IP 审计与双栈一票否决
 */
export function createSafeConnector(customLookup?: DnsLookupFn) {
  const defaultConnector = buildConnector({})

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (opts: any, cb: (err: Error | null, socket: any) => void) => {
    const hostname = stripBrackets(opts.hostname || '').toLowerCase().trim()

    // 1. IP 字面量审计
    const v4 = parseIpv4(hostname)
    if (v4) {
      if (isPrivateIpv4(v4)) {
        return cb(new Error(`SSRF blocked: 非公网 IPv4 地址 ${hostname}`), null)
      }
      return defaultConnector(opts, cb)
    }

    if (hostname.includes(':')) {
      if (isPrivateIpv6(hostname)) {
        return cb(new Error(`SSRF blocked: 非公网 IPv6 地址 ${hostname}`), null)
      }
      return defaultConnector(opts, cb)
    }

    // 2. 内网主机名拦截
    if (isPrivateHost(hostname)) {
      return cb(new Error(`SSRF blocked: 保留/内网主机名 ${hostname}`), null)
    }

    // 3. DNS 审计与双栈一票否决
    const doLookup: DnsLookupFn =
      customLookup ||
      (async (h: string) => {
        const records = await dns.promises.lookup(h, { all: true })
        return records
      })

    doLookup(hostname)
      .then((records) => {
        if (!records || records.length === 0) {
          return cb(new Error(`SSRF blocked: 域名解析为空 ${hostname}`), null)
        }

        // 双栈混合一票否决：只要有一个地址非公网，全域名拦截
        for (const r of records) {
          if (!isPublicIp(r.address)) {
            return cb(
              new Error(`SSRF blocked: 域名包含非公网解析记录 (${r.address})`),
              null,
            )
          }
        }

        // 锁定已审计通过的首个 IP 直连，保留 servername 支持 TLS SNI
        const pinnedOpts = {
          ...opts,
          hostname: records[0].address,
          servername: opts.servername || hostname,
        }
        defaultConnector(pinnedOpts, cb)
      })
      .catch((err) => cb(err, null))
  }
}

/** 默认安全全局代理实例 */
export const safeDispatcher = new Agent({
  connect: createSafeConnector(),
})

/**
 * Fetch with redirect: manual — re-check every Location against isPrivateHost.
 * Max 5 hops. Throws Error on private target / too many redirects.
 */
export async function fetchPublic(
  input: string | URL,
  init: RequestInit = {},
  opts: {
    timeoutMs?: number
    maxRedirects?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatcher?: any
  } = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const maxRedirects = opts.maxRedirects ?? 5
  let current =
    typeof input === 'string'
      ? assertPublicHttpUrl(input)
      : new URL(input.toString())
  if (isPrivateHost(current.hostname)) {
    throw new Error('禁止访问内网地址')
  }

  const baseHeaders = new Headers(init.headers || {})
  const method = (init.method || 'GET').toUpperCase()
  const body = init.body
  const dispatcher = opts.dispatcher || safeDispatcher

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const signal =
      init.signal ??
      (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(timeoutMs)
        : undefined)

    let res: Response
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await (undiciFetch as any)(current.toString(), {
        ...init,
        method,
        headers: baseHeaders,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        redirect: 'manual',
        signal,
        dispatcher,
      })
    } catch (err: any) {
      if (err?.cause?.message && /SSRF blocked/i.test(err.cause.message)) {
        throw new Error(`禁止访问内网地址: ${err.cause.message}`)
      }
      throw err
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      try {
        current = new URL(loc, current)
      } catch {
        throw new Error(`重定向 Location 无效: ${loc}`)
      }
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        throw new Error('重定向仅支持 http/https')
      }
      if (isPrivateHost(current.hostname)) {
        throw new Error('禁止重定向到内网地址')
      }
      continue
    }

    return res
  }

  throw new Error(`超过最大重定向次数 (${maxRedirects})`)
}
