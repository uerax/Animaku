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

const dataDir = resolveDataDir()
const appVersion = resolveAppVersion()
const cleanVersion = appVersion.replace(/^v/, '')

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
   * When true (default): any client may call /api/media/proxy and plugin
   * search/chapters/resolve (typical VPS / public deploy). Still has SSRF host checks.
   * Set PUBLIC_PROXY=0 to restrict to loopback / private LAN only.
   */
  publicProxy: envBool(process.env.PUBLIC_PROXY, true),
  /**
   * Optional shared secret. When set, media + plugin exec also accept
   * `X-Animaku-Proxy-Token: <token>` even from public IPs.
   */
  proxyToken: (process.env.PROXY_TOKEN || '').trim(),
  /**
   * When false (default): /api/media/proxy only allows HLS playlists (.m3u8)
   * and forces hybrid rewrite (segments stay on CDN). fullProxy / cookie mp4
   * are rejected. Set MEDIA_FULL_PROXY=1 to allow ts/mp4/full segment tunnel
   * (needed for Anime1 and similar cookie progressive sources).
   */
  mediaFullProxy: envBool(process.env.MEDIA_FULL_PROXY, false),
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
  /**
   * Public site origin for sitemap / robots (no trailing slash).
   * e.g. https://anime.example.com — when empty, robots/sitemap use request Host.
   */
  siteUrl: (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '')
    .trim()
    .replace(/\/+$/, ''),
}
