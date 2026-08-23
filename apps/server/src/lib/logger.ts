import type { MiddlewareHandler } from 'hono'
import { config } from '../config'

// ==========================================
// 1. Types & Interfaces
// ==========================================

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'script' | 'unknown'

export interface ParsedClientDevice {
  type: DeviceType
  os: string
  shortOs: string
  browser: string
  raw?: string
}

export interface StructuredLogRecord {
  time: string
  level: 'info' | 'warn' | 'error'
  ip: string
  country?: string
  device: {
    type: DeviceType
    os: string
    shortOs: string
    browser: string
  }
  method: string
  path: string
  params?: Record<string, unknown>
  cache?: 'HIT' | 'HIT:L1' | 'HIT:L2' | 'MISS' | 'BYPASS' | 'NONE'
  status: number
  durationMs: number
  bytes?: number
  error?: string
}

// ==========================================
// 2. User-Agent & Device Parsing (Zero-dep)
// ==========================================

const UA_CACHE_LIMIT = 300
const uaCache = new Map<string, ParsedClientDevice>()

/**
 * Parses User-Agent header into structured device platform & short labels.
 * Backed by an in-memory cache to guarantee sub-millisecond execution.
 */
export function parseClientDevice(
  ua: string | undefined,
  platformVersionHeader?: string,
): ParsedClientDevice {
  if (!ua || !ua.trim()) {
    return {
      type: 'unknown',
      os: 'Unknown',
      shortOs: 'Unknown',
      browser: 'Unknown',
    }
  }

  const trimmedUa = ua.trim()
  const cacheKey = `${trimmedUa}|${platformVersionHeader || ''}`
  const cached = uaCache.get(cacheKey)
  if (cached) return cached

  let type: DeviceType = 'desktop'
  let os = 'Unknown'
  let shortOs = 'Unknown'
  let browser = 'Unknown'

  const lower = trimmedUa.toLowerCase()

  // 1. Bots / Crawlers
  if (
    /bot|spider|crawl|slurp|headless|mediapartners|googlebot|bingbot|baiduspider|bytespider|yandex/i.test(
      trimmedUa,
    )
  ) {
    type = 'bot'
    os = 'Bot'
    shortOs = 'Bot'
    if (/googlebot/i.test(trimmedUa)) browser = 'Googlebot'
    else if (/baiduspider/i.test(trimmedUa)) browser = 'BaiduSpider'
    else if (/bytespider/i.test(trimmedUa)) browser = 'ByteSpider'
    else if (/bingbot/i.test(trimmedUa)) browser = 'Bingbot'
    else browser = 'WebBot'
  }
  // 2. Developer / Automation Tools
  else if (/curl|postman|insomnia|python|undici|axios|httpclient|wget|go-http-client/i.test(trimmedUa)) {
    type = 'script'
    os = 'Script'
    if (/curl/i.test(trimmedUa)) {
      shortOs = 'Curl'
      browser = 'cURL'
    } else if (/postman/i.test(trimmedUa)) {
      shortOs = 'Postman'
      browser = 'Postman'
    } else if (/python/i.test(trimmedUa)) {
      shortOs = 'Python'
      browser = 'Python'
    } else {
      shortOs = 'Script'
      browser = 'HTTP-Client'
    }
  }
  // 3. Tablet Devices
  else if (/ipad|tablet|(android(?!.*mobile))/i.test(trimmedUa)) {
    type = 'tablet'
    if (/ipad/i.test(trimmedUa)) {
      os = 'iPadOS'
      shortOs = 'iPad'
    } else {
      os = 'Android Tablet'
      shortOs = 'Android'
    }
  }
  // 4. Mobile Devices
  else if (/mobile|iphone|ipod|android/i.test(trimmedUa)) {
    type = 'mobile'
    if (/iphone|ipod/i.test(trimmedUa)) {
      os = 'iOS'
      shortOs = 'iPhone'
    } else if (/android/i.test(trimmedUa)) {
      const vMatch = trimmedUa.match(/Android\s+([0-9.]+)/i)
      os = vMatch ? `Android ${vMatch[1]}` : 'Android'
      shortOs = 'Android'
    } else {
      os = 'Mobile'
      shortOs = 'Mobile'
    }
  }
  // 5. Desktop OS
  else {
    type = 'desktop'
    if (/windows nt 10\.0/i.test(trimmedUa)) {
      // Sec-CH-UA-Platform-Version >= 13 is Windows 11
      const isWin11 =
        platformVersionHeader &&
        Number.parseFloat(platformVersionHeader.replace(/"/g, '')) >= 13
      os = isWin11 ? 'Windows 11' : 'Windows 10'
      shortOs = isWin11 ? 'Win11' : 'Win10'
    } else if (/windows nt 11\.0/i.test(trimmedUa)) {
      os = 'Windows 11'
      shortOs = 'Win11'
    } else if (/windows nt 6\.3/i.test(trimmedUa)) {
      os = 'Windows 8.1'
      shortOs = 'Win8'
    } else if (/windows nt 6\.1/i.test(trimmedUa)) {
      os = 'Windows 7'
      shortOs = 'Win7'
    } else if (/windows/i.test(trimmedUa)) {
      os = 'Windows'
      shortOs = 'Win'
    } else if (/macintosh|mac os x/i.test(trimmedUa)) {
      os = 'macOS'
      shortOs = 'macOS'
    } else if (/linux/i.test(trimmedUa)) {
      os = 'Linux'
      shortOs = 'Linux'
    } else if (/cros/i.test(trimmedUa)) {
      os = 'ChromeOS'
      shortOs = 'ChromeOS'
    }
  }

  // Browser & Version Parsing (when not a bot/script)
  if (browser === 'Unknown') {
    if (/edg\/|edge\//i.test(trimmedUa)) {
      const match = trimmedUa.match(/edg(?:e)?\/([0-9]+)/i)
      browser = match ? `Edge/${match[1]}` : 'Edge'
    } else if (/micromessenger/i.test(trimmedUa)) {
      browser = 'WeChat'
    } else if (/quark/i.test(trimmedUa)) {
      browser = 'Quark'
    } else if (/chrome|crios/i.test(trimmedUa)) {
      const match = trimmedUa.match(/(?:chrome|crios)\/([0-9]+)/i)
      browser = match ? `Chrome/${match[1]}` : 'Chrome'
    } else if (/firefox|fxios/i.test(trimmedUa)) {
      const match = trimmedUa.match(/(?:firefox|fxios)\/([0-9]+)/i)
      browser = match ? `Firefox/${match[1]}` : 'Firefox'
    } else if (/safari/i.test(trimmedUa) && !/chrome|crios|android/i.test(trimmedUa)) {
      const match = trimmedUa.match(/version\/([0-9]+)/i)
      browser = match ? `Safari/${match[1]}` : 'Safari'
    } else {
      browser = 'Browser'
    }
  }

  const result: ParsedClientDevice = {
    type,
    os,
    shortOs,
    browser,
    raw: trimmedUa,
  }

  if (uaCache.size >= UA_CACHE_LIMIT) {
    uaCache.clear()
  }
  uaCache.set(cacheKey, result)

  return result
}

// ==========================================
// 3. Client IP & Timestamp Formatters
// ==========================================

let cachedLogFormatter: Intl.DateTimeFormat | null = null
let cachedLogTz: string | null = null

function getLogDateFormatter(tz: string = config.timezone): Intl.DateTimeFormat {
  if (cachedLogFormatter && cachedLogTz === tz) {
    return cachedLogFormatter
  }
  try {
    cachedLogFormatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    cachedLogTz = tz
  } catch {
    cachedLogFormatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    cachedLogTz = 'Asia/Shanghai'
  }
  return cachedLogFormatter
}

export function formatLogTimestamp(d: Date = new Date(), tz: string = config.timezone): string {
  try {
    return getLogDateFormatter(tz).format(d)
  } catch {
    const pad = (n: number) => n.toString().padStart(2, '0')
    const Y = d.getFullYear()
    const M = pad(d.getMonth() + 1)
    const D = pad(d.getDate())
    const h = pad(d.getHours())
    const m = pad(d.getMinutes())
    const s = pad(d.getSeconds())
    return `${Y}-${M}-${D} ${h}:${m}:${s}`
  }
}

export function getClientIp(req: { header: (name: string) => string | undefined }): string {
  // 1. Cloudflare CDN (最权威且经过边缘验证的真实客户端 IP)
  const cfIp = req.header('cf-connecting-ip')
  if (cfIp?.trim()) return cfIp.trim()

  // 2. Cloudflare Enterprise / Akamai / 常见 CDN 真实 IP 请求头
  const trueClientIp = req.header('true-client-ip')
  if (trueClientIp?.trim()) return trueClientIp.trim()

  // 3. X-Real-IP (常用于单层反向代理)
  const xReal = req.header('x-real-ip')
  if (xReal?.trim()) return xReal.trim()

  // 4. X-Forwarded-For (逗号分隔的代理链路，取最左侧原始客户端 IP)
  const xff = req.header('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }

  return '127.0.0.1'
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes) || bytes <= 0) {
    return ''
  }
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ==========================================
// 4. Business Parameter Extraction
// ==========================================

const SENSITIVE_KEYS = new Set(['token', 'password', 'secret', 'authorization', 'key'])

export function sanitizeParams(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      result[k] = '***'
    } else if (v !== undefined && v !== null && v !== '') {
      result[k] = v
    }
  }
  return result
}

export async function extractBusinessParams(
  req: {
    method: string
    path: string
    query: (key?: string) => any
    raw: Request
    header: (name: string) => string | undefined
  },
): Promise<Record<string, unknown> | undefined> {
  const params: Record<string, unknown> = {}

  // 1. Extract from Query parameters
  const queryKw = req.query('keyword') || req.query('q') || req.query('kw')
  if (queryKw) params.kw = String(queryKw).trim()

  const queryPlugin = req.query('plugin') || req.query('source')
  if (queryPlugin) params.plugin = String(queryPlugin).trim()

  const queryBgmId = req.query('bgmId') || req.query('subjectId')
  if (queryBgmId) params.bgmId = String(queryBgmId).trim()

  // 2. Extract from JSON Body (Safe clone)
  if (
    ['POST', 'PUT', 'PATCH'].includes(req.method) &&
    req.header('content-type')?.includes('application/json')
  ) {
    try {
      const cloned = req.raw.clone()
      const body = (await cloned.json()) as Record<string, unknown>
      if (body && typeof body === 'object') {
        if (body.keyword) params.kw = String(body.keyword).trim()
        if (body.plugin) params.plugin = String(body.plugin).trim()
        if (body.rule && typeof body.rule === 'object') {
          const ruleObj = body.rule as { name?: string; id?: string }
          if (ruleObj.name || ruleObj.id) {
            params.plugin = ruleObj.name || ruleObj.id
          }
        }
        if (body.episode !== undefined || body.ep !== undefined) {
          params.ep = body.episode ?? body.ep
        }
        if (body.sort && body.sort !== 'heat') {
          params.sort = body.sort
        }
        if (body.year) {
          params.year = body.year
        }
      }
    } catch {
      // Ignore JSON parse errors (body might be empty or invalid)
    }
  }

  // 3. Fallback path parameter recognition (/api/bangumi/subject/123456)
  const subjectMatch = req.path.match(/\/api\/bangumi\/subject\/([0-9]+)/)
  if (subjectMatch) {
    params.bgmId = subjectMatch[1]
  }

  return Object.keys(params).length > 0 ? sanitizeParams(params) : undefined
}

// ==========================================
// 5. Pretty & JSON Formatters
// ==========================================

// ANSI escape codes for terminal styling
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
}

function colorStatus(status: number): string {
  if (status >= 500) return `${ANSI.red}${status}${ANSI.reset}`
  if (status >= 400) return `${ANSI.yellow}${status}${ANSI.reset}`
  if (status >= 300) return `${ANSI.cyan}${status}${ANSI.reset}`
  return `${ANSI.green}${status}${ANSI.reset}`
}

function colorLevel(level: 'info' | 'warn' | 'error'): string {
  if (level === 'error') return `${ANSI.red}${ANSI.bold}ERROR${ANSI.reset}`
  if (level === 'warn') return `${ANSI.yellow}${ANSI.bold}WARN ${ANSI.reset}`
  return `${ANSI.blue}INFO ${ANSI.reset}`
}

function formatPrettyParams(params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return ''
  const parts: string[] = []
  if (params.plugin) parts.push(`plugin="${params.plugin}"`)
  if (params.kw) parts.push(`kw="${params.kw}"`)
  if (params.ep !== undefined) parts.push(`ep="${params.ep}"`)
  if (params.bgmId) parts.push(`bgmId=${params.bgmId}`)
  if (params.sort) parts.push(`sort=${params.sort}`)
  if (params.year) parts.push(`year=${params.year}`)

  // Any other custom params
  for (const [k, v] of Object.entries(params)) {
    if (!['plugin', 'kw', 'ep', 'bgmId', 'sort', 'year'].includes(k)) {
      parts.push(`${k}=${JSON.stringify(v)}`)
    }
  }

  return parts.length > 0 ? ` ${ANSI.cyan}${parts.join(' ')}${ANSI.reset}` : ''
}

export function formatPrettyLog(record: StructuredLogRecord): string {
  const timeStr = `[${record.time}]`
  const levelStr = colorLevel(record.level)
  const ipStr = `${ANSI.gray}[${record.ip}]${ANSI.reset}`
  const countryStr = record.country ? ` ${ANSI.blue}[${record.country}]${ANSI.reset}` : ''
  const deviceStr = `${ANSI.magenta}[${record.device.shortOs}]${ANSI.reset}`
  const methodStr = `${ANSI.bold}${record.method}${ANSI.reset}`
  const pathStr = record.path
  const paramsStr = formatPrettyParams(record.params)

  let cacheStr = ''
  if (record.cache && record.cache !== 'NONE') {
    if (record.cache.startsWith('HIT')) {
      cacheStr = ` ${ANSI.green}[${record.cache}]${ANSI.reset}`
    } else if (record.cache === 'MISS') {
      cacheStr = ` ${ANSI.gray}[MISS]${ANSI.reset}`
    } else if (record.cache === 'BYPASS') {
      cacheStr = ` ${ANSI.yellow}[BYPASS]${ANSI.reset}`
    }
  }

  const statusStr = colorStatus(record.status)

  // Slow request highlight (> 1000ms)
  let durationStr = `${record.durationMs}ms`
  if (record.durationMs >= 1000) {
    durationStr = `${ANSI.yellow}${ANSI.bold}SLOW: ${record.durationMs}ms${ANSI.reset}`
  }

  const sizeStr = record.bytes ? `, ${formatBytes(record.bytes)}` : ''
  const perfStr = `(${durationStr}${sizeStr})`
  const errStr = record.error ? ` ${ANSI.red}- "${record.error}"${ANSI.reset}` : ''

  return `${timeStr} ${levelStr} ${ipStr}${countryStr} ${deviceStr} ${methodStr} ${pathStr}${paramsStr}${cacheStr} -> ${statusStr} ${perfStr}${errStr}`
}

export function formatJsonLog(record: StructuredLogRecord): string {
  return JSON.stringify(record)
}

// ==========================================
// 6. Access Logger Middleware
// ==========================================

export function accessLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now()
    const path = c.req.path
    const method = c.req.method
    const ip = getClientIp(c.req)
    const isMediaProxy = path.startsWith('/api/media/proxy')
    const isHealthCheck = path === '/api/health' || path === '/api/health/'

    const ua = c.req.header('user-agent')
    const platformVer = c.req.header('sec-ch-ua-platform-version')
    const device = parseClientDevice(ua, platformVer)

    // Optional Cloudflare geo country (e.g. CN, US, JP, HK, TW). Filter out placeholder 'XX'/'T1'.
    const cfCountryRaw = c.req.header('cf-ipcountry')?.trim().toUpperCase()
    const country =
      cfCountryRaw && cfCountryRaw.length === 2 && cfCountryRaw !== 'XX' && cfCountryRaw !== 'T1'
        ? cfCountryRaw
        : undefined

    // Pre-extract parameters before request body is consumed
    let params: Record<string, unknown> | undefined
    try {
      params = await extractBusinessParams(c.req)
    } catch {
      // safe fallback
    }

    let caughtError: Error | null = null

    try {
      await next()
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err))
      throw err
    } finally {
      const elapsed = Date.now() - start
      const status = c.res ? c.res.status : caughtError ? 500 : 200

      // Silent health check on success (filter Docker/K8s polling)
      if (isHealthCheck && status === 200) {
        return
      }

      // Silent media proxy segment traffic on success (< 400)
      if (isMediaProxy && status < 400) {
        return
      }

      const timeStr = formatLogTimestamp()
      const level: 'info' | 'warn' | 'error' =
        status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

      // Extract cache header (e.g. X-Cache: HIT / MISS)
      const xCacheHeader = c.res?.headers.get('x-cache')?.toUpperCase()
      let cacheStatus: StructuredLogRecord['cache'] = 'NONE'
      if (xCacheHeader?.includes('HIT')) {
        cacheStatus = xCacheHeader as StructuredLogRecord['cache']
      } else if (xCacheHeader?.includes('MISS')) {
        cacheStatus = 'MISS'
      } else if (c.req.header('x-cache-bypass') || c.req.query('bypass')) {
        cacheStatus = 'BYPASS'
      }

      // Extract Content-Length
      const contentLengthHeader = c.res?.headers.get('content-length')
      const bytes = contentLengthHeader ? Number(contentLengthHeader) : undefined

      const record: StructuredLogRecord = {
        time: timeStr,
        level,
        ip,
        country,
        device: {
          type: device.type,
          os: device.os,
          shortOs: device.shortOs,
          browser: device.browser,
        },
        method,
        path,
        params,
        cache: cacheStatus !== 'NONE' ? cacheStatus : undefined,
        status,
        durationMs: elapsed,
        bytes: bytes && !Number.isNaN(bytes) ? bytes : undefined,
        error: caughtError ? caughtError.message : undefined,
      }

      const logFormat = config.logFormat || 'pretty'
      if (logFormat === 'json') {
        console.log(formatJsonLog(record))
      } else {
        console.log(formatPrettyLog(record))
      }
    }
  }
}
