import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  toBangumiApiUrl,
  resolveBangumiApiPreset,
  resolveBangumiImagePreset,
} from '@animaku/shared'

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

// cwd is typically apps/server when running via pnpm filter
loadEnvFile(resolve(process.cwd(), '../../.env'))
loadEnvFile(resolve(process.cwd(), '.env'))
loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
loadEnvFile(resolve(import.meta.dirname, '../../.env'))

function envInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback
  const v = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return fallback
}

/** Comma-separated Origin list; empty → built-in localhost allowlist only */
function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolveDataDir(): string {
  if (process.env.DATA_DIR?.trim()) {
    return resolve(process.env.DATA_DIR.trim())
  }
  if (process.cwd().endsWith('apps/server') || process.cwd().endsWith('apps\\server')) {
    return resolve(process.cwd(), '../../data')
  }
  return resolve(process.cwd(), 'data')
}

function resolveAppVersion(): string {
  if (process.env.APP_VERSION?.trim()) return process.env.APP_VERSION.trim()
  const candidatePaths = [
    resolve(process.cwd(), 'package.json'),
    resolve(process.cwd(), '../../package.json'),
    resolve(import.meta.dirname, '../../../package.json'),
    resolve(import.meta.dirname, '../../package.json'),
  ]
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf8'))
        if (pkg.version) return `v${pkg.version}`
      } catch {}
    }
  }
  return 'v1.1.1'
}

function resolveTimezone(): string {
  const raw = (
    process.env.TZ ||
    process.env.TIMEZONE ||
    process.env.LOG_TIMEZONE ||
    'Asia/Shanghai'
  ).trim()
  return raw || 'Asia/Shanghai'
}

/**
 * 解析以 PROXY_ 或 OUTBOUND_PROXY_ 开头的代理池配置
 * 自动支持完整变量名（如 proxy_1、proxy_cn）及其标识符（如 1、cn、proxy1）
 */
export function parseProxyPool(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const pool: Record<string, string> = {}
  for (const [key, val] of Object.entries(env)) {
    if (!val || typeof val !== 'string') continue
    const trimmedVal = val.trim()
    if (!trimmedVal) continue

    const upperKey = key.toUpperCase()
    if (
      upperKey.startsWith('PROXY_') ||
      upperKey.startsWith('OUTBOUND_PROXY_') ||
      /^PROXY\d+$/.test(upperKey)
    ) {
      // 1. 注册完整环境变量名，如 proxy_1 / outbound_proxy_1 / proxy1
      const fullKey = upperKey.toLowerCase()
      pool[fullKey] = trimmedVal

      // 2. 提取后缀标识，如 1 / cn
      let suffix = ''
      if (upperKey.startsWith('OUTBOUND_PROXY_')) {
        suffix = upperKey.slice('OUTBOUND_PROXY_'.length).toLowerCase()
      } else if (upperKey.startsWith('PROXY_')) {
        suffix = upperKey.slice('PROXY_'.length).toLowerCase()
      } else {
        suffix = upperKey.slice('PROXY'.length).toLowerCase()
      }

      if (suffix) {
        pool[suffix] = trimmedVal
        const cleanSuffix = suffix.replace(/_/g, '')
        pool[cleanSuffix] = trimmedVal
        pool[`proxy${cleanSuffix}`] = trimmedVal
        pool[`proxy_${cleanSuffix}`] = trimmedVal
      }
    }
  }
  return pool
}

/**
 * 解析视频源到代理的映射关系
 * 支持：
 * 1. SOURCE_PROXY_MAP="cycani:proxy1,anime1:proxy2" 或 JSON 字符串 '{"cycani":"proxy1"}'
 * 2. 独立环境变量覆盖 SOURCE_PROXY_CYCANI=proxy1
 */
export function parseSourceProxyMap(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const map: Record<string, string> = {}

  const rawMap = (env.SOURCE_PROXY_MAP || env.SOURCE_PROXIES || '').trim()
  if (rawMap) {
    if (rawMap.startsWith('{') && rawMap.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawMap)
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (k && typeof v === 'string' && v.trim()) {
              map[k.trim().toLowerCase()] = v.trim().toLowerCase()
            }
          }
        }
      } catch (err) {
        console.warn('[config] 无法解析 SOURCE_PROXY_MAP JSON:', err)
      }
    } else {
      const pairs = rawMap.split(',')
      for (const pair of pairs) {
        const [source, proxy] = pair.split(':')
        if (source && proxy) {
          map[source.trim().toLowerCase()] = proxy.trim().toLowerCase()
        }
      }
    }
  }

  for (const [key, val] of Object.entries(env)) {
    if (!val || typeof val !== 'string') continue
    const upperKey = key.toUpperCase()
    if (upperKey.startsWith('SOURCE_PROXY_') && upperKey !== 'SOURCE_PROXY_MAP') {
      const sourceName = upperKey.slice('SOURCE_PROXY_'.length).toLowerCase()
      if (sourceName) {
        map[sourceName] = val.trim().toLowerCase()
      }
    }
  }

  return map
}

const dataDir = resolveDataDir()
const appVersion = resolveAppVersion()
const cleanVersion = appVersion.replace(/^v/, '')
const timezone = resolveTimezone()

// Ensure process.env.TZ is set so that standard Node.js APIs also respect the timezone
if (!process.env.TZ) {
  process.env.TZ = timezone
}

export const config = {
  /** Application semantic version (e.g. v1.1.1) */
  version: appVersion,
  /** Directory for persistent state (SQLite db, cache, etc.) */
  dataDir,
  /** Full path to primary SQLite database file */
  sqlitePath: process.env.SQLITE_PATH?.trim()
    ? resolve(process.env.SQLITE_PATH.trim())
    : resolve(dataDir, 'animaku.db'),
  /** Enable SQLite Write-Ahead Logging (WAL) for concurrent read/write throughput */
  sqliteWal: envBool(process.env.SQLITE_WAL, true),
  /** Busy timeout in ms before throwing SQLITE_BUSY */
  sqliteBusyTimeout: envInt(process.env.SQLITE_BUSY_TIMEOUT, 5000),
  /** API listen port — `PORT` in root `.env` */
  port: envInt(process.env.PORT, 8787),
  /** API bind host — `HOST` in root `.env` */
  host: process.env.HOST || '0.0.0.0',
  /**
   * Extra browser Origins allowed by CORS (comma-separated).
   * Always allows same-origin (no Origin) + localhost / 127.0.0.1 any port.
   * Set CORS_ORIGINS=* only if you intentionally want open cross-origin (not recommended).
   */
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  corsOpen: (process.env.CORS_ORIGINS || '').trim() === '*',
  /**
   * Dedicated secret for signing and encrypting media playback tickets (AES-256-GCM).
   * Generates an ephemeral random master key if unset.
   */
  mediaSecret: (
    process.env.MEDIA_SECRET ||
    process.env.TICKET_SECRET ||
    ''
  ).trim(),
  dandanAppId: process.env.DANDAN_APP_ID || '',
  dandanAppSecret: process.env.DANDAN_APP_SECRET || '',
  /**
   * Bangumi API User-Agent (required for non-browser clients; we set it always).
   * Format: developer/App[/version] (https://project-homepage)
   * @see https://bangumi.github.io/api/ — 非浏览器使用者须带个人 ID + 应用名；开源附主页
   */
  bangumiUserAgent:
    process.env.BANGUMI_USER_AGENT ||
    `uerax/Animaku/${cleanVersion} (https://github.com/uerax/Animaku)`,
  /** Product UA for APIs that expect an app identity (e.g. DanDanPlay) */
  productUserAgent: process.env.PRODUCT_USER_AGENT || `Animaku/${cleanVersion}`,
  defaultUserAgent:
    process.env.DEFAULT_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  /**
   * Bangumi API URL (e.g. https://bgmapi.anibt.net or https://api.bgm.tv).
   * Configured via BANGUMI_API, BANGUMI_API_HOST, or VITE_BANGUMI_API_HOST (supports 'official' | 'mirror' | custom host).
   * Defaults to proxy https://bgmapi.anibt.net for CN-friendly out-of-the-box experience.
   */
  bangumiApi: toBangumiApiUrl(
    process.env.BANGUMI_API ||
      process.env.BANGUMI_API_HOST ||
      process.env.VITE_BANGUMI_API_HOST,
  ),
  bangumiApiHost: resolveBangumiApiPreset(
    process.env.BANGUMI_API ||
      process.env.BANGUMI_API_HOST ||
      process.env.VITE_BANGUMI_API_HOST,
  ),
  bangumiNextApi: (
    process.env.BANGUMI_NEXT_API || 'https://next.bgm.tv'
  )
    .trim()
    .replace(/\/+$/, ''),
  bangumiImageHost: resolveBangumiImagePreset(
    process.env.BANGUMI_IMAGE ||
      process.env.BANGUMI_IMAGE_HOST ||
      process.env.VITE_BANGUMI_IMAGE_HOST,
  ),
  dandanApi: 'https://api.dandanplay.net',
  /** KazumiRules primary + gitcode mirror (same as Kazumi ApiEndpoints) */
  pluginShop:
    process.env.PLUGIN_SHOP ||
    'https://raw.githubusercontent.com/Predidit/KazumiRules/main/',
  pluginShopMirror:
    process.env.PLUGIN_SHOP_MIRROR ||
    'https://raw.gitcode.com/gh_mirrors/ka/KazumiRules/raw/main/',
  /** AniBakaRule primary + mirror (modern pipeline rules anx-rule/2) */
  anibakaShop:
    process.env.ANIBAKA_SHOP ||
    'https://raw.githubusercontent.com/AniBakaBaka/AniBakaRule/main/',
  anibakaShopMirror:
    process.env.ANIBAKA_SHOP_MIRROR ||
    'https://raw.githubusercontents.com/AniBakaBaka/AniBakaRule/main/',
  /**
   * Public site origin for sitemap / robots (no trailing slash).
   * e.g. https://anime.example.com — when empty, robots/sitemap use request Host.
   */
  siteUrl: (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '')
    .trim()
    .replace(/\/+$/, ''),
  /**
   * Server access log output format: 'pretty' (default human-friendly) | 'json' (structured JSONL for ELK/Loki)
   */
  logFormat: (process.env.LOG_FORMAT || 'pretty').trim().toLowerCase() === 'json' ? ('json' as const) : ('pretty' as const),
  /**
   * Timezone for server logs and timestamp formatting (e.g. 'Asia/Shanghai', 'UTC').
   * Configured via TZ, TIMEZONE, or LOG_TIMEZONE. Defaults to 'Asia/Shanghai'.
   */
  timezone,
  /**
   * IndexNow Key for search engine instant indexing (Bing, Yandex, Seznam, Naver).
   * Key verification file is served at public/{INDEXNOW_KEY}.txt
   */
  indexnowKey: (
    process.env.INDEXNOW_KEY || '4ddfeb9c68384dd99bc302fb0f02eaf1'
  ).trim(),
  /**
   * Dedicated Admin secret token for protected operations (e.g. POST /api/admin/indexnow).
   */
  adminSecret: (process.env.ADMIN_SECRET || '').trim(),
  /**
   * Enable/disable IndexNow automatic & manual submissions (default: false).
   * Must be explicitly set to 1/true in production .env to prevent local dev test leakage.
   */
  indexnowEnabled: envBool(process.env.INDEXNOW_ENABLED, false),
  /**
   * 外部出站代理池（键名为归一化小写，如 proxy1, proxy_1, proxy_cn）
   */
  proxyPool: parseProxyPool(),
  /**
   * 视频源到代理的映射关系（键名为视频源小写，如 cycani -> proxy1）
   */
  sourceProxyMap: parseSourceProxyMap(),
}
