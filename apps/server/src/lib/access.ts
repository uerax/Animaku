import type { Context, Next } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { config } from '../config'
import { isPrivateHost } from './private-host'

/** localhost / 127.x / [::1] for browser Origins */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    const h = u.hostname.toLowerCase()
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '[::1]' ||
      h === '::1'
    )
  } catch {
    return false
  }
}

export function isCorsOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return true // same-origin / curl / server-to-server
  if (config.corsOpen) return true
  if (isLoopbackOrigin(origin)) return true
  if (config.corsOrigins.includes(origin)) return true
  return false
}

/** Hono cors `origin` callback value */
export function corsOriginDecision(origin: string): string | undefined {
  if (isCorsOriginAllowed(origin)) return origin
  // Disallow: omit ACAO
  return undefined
}

function normalizeRemoteAddress(addr: string | undefined): string {
  if (!addr) return ''
  // Node may give ::ffff:127.0.0.1
  if (addr.startsWith('::ffff:')) return addr.slice(7)
  if (addr.startsWith('[') && addr.endsWith(']')) return addr.slice(1, -1)
  return addr
}

export function clientRemoteAddress(c: Context): string {
  try {
    const info = getConnInfo(c)
    return normalizeRemoteAddress(info.remote.address)
  } catch {
    return ''
  }
}

/**
 * Whether this request may use media stream proxying (/api/media/*).
 * - When PROXY_TOKEN is set: strictly requires matching token in Header or Query.
 *   Docker bridge NAT (172.x) and reverse proxies will NEVER bypass token check.
 * - When PROXY_TOKEN is empty: PUBLIC_PROXY=1 allows all, PUBLIC_PROXY=0 restricts to LAN.
 */
export function canUseMediaProxy(c: Context): boolean {
  const token = config.proxyToken?.trim()
  if (token) {
    const hdr =
      c.req.header('x-animaku-proxy-token') ||
      c.req.header('x-aniku-proxy-token') ||
      c.req.header('x-proxy-token') ||
      ''
    if (hdr && hdr === token) return true
    const q = c.req.query('proxyToken') || c.req.query('token') || ''
    if (q && q === token) return true

    // Only allow direct loopback socket from same host without proxy token in local dev
    const ip = clientRemoteAddress(c)
    const origin = c.req.header('origin')
    if ((ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') && (!origin || isLoopbackOrigin(origin))) {
      return true
    }
    return false
  }

  if (config.publicProxy) return true

  const ip = clientRemoteAddress(c)
  if (!ip) {
    // Unknown remote — allow only if Origin is allowlisted (browser same-site dev)
    const origin = c.req.header('origin')
    return isCorsOriginAllowed(origin)
  }
  if (isPrivateHost(ip)) return true
  return false
}

/**
 * Whether this request may use plugin parsing APIs (/api/plugin/*).
 * - If PUBLIC_PROXY=1 (default), allows web clients to parse anime sources with SSRF protection.
 * - If PUBLIC_PROXY=0 (LAN-only lockdown), restricts to LAN or loopback (unless PROXY_TOKEN matches).
 */
export function canUsePluginApi(c: Context): boolean {
  if (config.publicProxy) return true

  const token = config.proxyToken?.trim()
  if (token) {
    const hdr =
      c.req.header('x-animaku-proxy-token') ||
      c.req.header('x-aniku-proxy-token') ||
      c.req.header('x-proxy-token') ||
      ''
    if (hdr && hdr === token) return true
    const q = c.req.query('proxyToken') || c.req.query('token') || ''
    if (q && q === token) return true
  }

  const ip = clientRemoteAddress(c)
  if (!ip) {
    const origin = c.req.header('origin')
    return isCorsOriginAllowed(origin)
  }
  if (isPrivateHost(ip)) return true
  return false
}

/** Legacy alias for media proxy access check */
export const canUseOpenProxy = canUseMediaProxy

/** Middleware for media stream proxying */
export async function requireMediaProxyAccess(c: Context, next: Next) {
  if (canUseMediaProxy(c)) return next()
  return c.json(
    {
      error: 'forbidden',
      message:
        '媒体代理当前需管理员口令或局域网访问（PUBLIC_PROXY=0 / PROXY_TOKEN 已开启）。请在设置中输入口令解锁。',
    },
    403,
  )
}

/** Middleware for plugin search/chapters/resolve */
export async function requirePluginApiAccess(c: Context, next: Next) {
  if (canUsePluginApi(c)) return next()
  return c.json(
    {
      error: 'forbidden',
      message:
        '插件解析当前仅允许本机或局域网（PUBLIC_PROXY=0）。公网访问请设 PUBLIC_PROXY=1。',
    },
    403,
  )
}

/** Legacy middleware alias pointing to requireMediaProxyAccess */
export const requireLocalOrToken = requireMediaProxyAccess
