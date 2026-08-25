import {
  coverOf,
  parseBangumiItem,
  toBangumiOfficialImageUrl,
  type BangumiItem,
} from '@animaku/shared'
import { config } from '../config'
import { bangumiFetch } from './http'
import { cacheGet } from './ttl-cache'

/**
 * Host-aware robots.txt + dynamic sitemap.xml for production SPA hosting.
 * Static copies also live in apps/web/public/ (dev / pure static); server
 * responses win when registered before serveStatic.
 */

export const SITEMAP_STATIC_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/anime', priority: '0.8', changefreq: 'weekly' },
  { path: '/timeline', priority: '0.8', changefreq: 'daily' },
] as const

/** Prefer SITE_URL, else request Host (+ X-Forwarded-*). */
export function resolvePublicOrigin(
  siteUrlConfig: string,
  req: {
    header: (name: string) => string | undefined
    url: string
  },
): string {
  const configured = siteUrlConfig.trim().replace(/\/+$/, '')
  if (configured) return configured

  const xfProto = (req.header('x-forwarded-proto') || '')
    .split(',')[0]
    ?.trim()
  const xfHost = (req.header('x-forwarded-host') || '')
    .split(',')[0]
    ?.trim()
  const host = xfHost || req.header('host') || ''
  if (!host) return ''

  let proto = xfProto || ''
  if (!proto) {
    try {
      proto = new URL(req.url).protocol.replace(':', '')
    } catch {
      proto = 'http'
    }
  }
  if (proto !== 'http' && proto !== 'https') proto = 'https'
  return `${proto}://${host}`.replace(/\/+$/, '')
}

export function buildRobotsTxt(origin: string): string {
  const sitemapLine = origin
    ? `Sitemap: ${origin}/sitemap.xml\n`
    : '# Set SITE_URL or open via public Host so Sitemap: can be absolute\n'

  return `# Animaku robots
User-agent: *
Allow: /
Allow: /anime
Allow: /timeline
Allow: /subject/

# Allow public metadata API for client-side rendering (SPA)
Allow: /api/bangumi/

Disallow: /api/
Disallow: /settings
Disallow: /history
Disallow: /collect
Disallow: /play/
Disallow: /search

Allow: /assets/

${sitemapLine}`
}

export function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

interface DynamicSitemapCache {
  xml: string
  origin: string
  timestamp: number
}

let sitemapCache: DynamicSitemapCache | null = null
const SITEMAP_CACHE_TTL_MS = 6 * 3600 * 1000 // 6 hours cache

/**
 * Fetch calendar and trending subjects for sitemap aggregation.
 * Prefers memory cache, falls back to direct fetch, never throws.
 */
export async function fetchSitemapSubjects(): Promise<BangumiItem[]> {
  const subjectsMap = new Map<number, BangumiItem>()
  const apiHost = config.bangumiApiHost
  const apiUrl = config.bangumiApi

  // 1. Check calendar cache first
  const calKey = `bangumi:${apiHost}:calendar`
  const calCached = cacheGet<{ data: BangumiItem[][] }>(calKey)
  if (calCached?.data) {
    for (const day of calCached.data) {
      for (const item of day) {
        if (item && item.id > 0) subjectsMap.set(item.id, item)
      }
    }
  } else {
    // Attempt to fetch calendar
    try {
      const res = await bangumiFetch(`${apiUrl}/calendar`, { timeoutMs: 3000 })
      if (res.ok) {
        const json = (await res.json()) as unknown
        if (Array.isArray(json)) {
          for (const dayEntry of json) {
            if (dayEntry && typeof dayEntry === 'object') {
              const items = (dayEntry as { items?: unknown[] }).items || []
              for (const entry of items) {
                try {
                  const e = entry as Record<string, unknown>
                  const subject = (e.subject as Record<string, unknown>) || e
                  const parsed = parseBangumiItem(subject)
                  if (parsed.id > 0) subjectsMap.set(parsed.id, parsed)
                } catch {
                  /* skip */
                }
              }
            }
          }
        }
      }
    } catch {
      /* ignore timeout */
    }
  }

  // 2. Check trending cache or fetch trending
  const trendKey = `bangumi:${apiHost}:trending:2:48:0`
  const trendCached = cacheGet<{ data: BangumiItem[] }>(trendKey)
  if (trendCached?.data) {
    for (const item of trendCached.data) {
      if (item && item.id > 0) subjectsMap.set(item.id, item)
    }
  } else {
    try {
      const res = await bangumiFetch(
        `${config.bangumiNextApi}/p1/trending/subjects?type=2&limit=48`,
        { timeoutMs: 3000 },
      )
      if (res.ok) {
        const json = (await res.json()) as { data?: unknown[] }
        for (const entry of json.data || []) {
          try {
            const e = entry as Record<string, unknown>
            const subject = (e.subject as Record<string, unknown>) || e
            const parsed = parseBangumiItem(subject)
            if (parsed.id > 0) subjectsMap.set(parsed.id, parsed)
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* ignore timeout */
    }
  }

  return Array.from(subjectsMap.values())
}

/**
 * Format a stable YYYY-MM-DD date for lastmod (ISO 8601).
 * Uses real airDate if valid, otherwise falls back to a stable seasonal date.
 */
function getValidLastmodDate(airDate: string | undefined): string {
  if (airDate && /^\d{4}-\d{2}-\d{2}$/.test(airDate)) {
    return airDate
  }
  // Fall back to current year season start rather than shifting runtime timestamps
  const now = new Date()
  const year = now.getFullYear()
  const seasonMonth = Math.floor(now.getMonth() / 3) * 3 + 1
  return `${year}-${String(seasonMonth).padStart(2, '0')}-01`
}

/**
 * Build dynamic sitemap XML with 6-hour in-memory cache,
 * URL deduplication, accurate lastmod dates, and Google Image Sitemap extensions.
 */
export async function buildDynamicSitemapXml(
  origin: string,
  forceRefresh = false,
): Promise<string> {
  const base = origin.replace(/\/+$/, '') || ''
  const now = Date.now()

  if (
    !forceRefresh &&
    sitemapCache &&
    sitemapCache.origin === base &&
    now - sitemapCache.timestamp < SITEMAP_CACHE_TTL_MS
  ) {
    return sitemapCache.xml
  }

  const today = new Date().toISOString().slice(0, 10)

  // 1. Static navigation entries
  const staticUrls = SITEMAP_STATIC_PATHS.map((entry) => {
    const loc = base ? `${base}${entry.path === '/' ? '/' : entry.path}` : entry.path
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  }).join('\n')

  // 2. Dynamic subject entries
  const subjects = await fetchSitemapSubjects()

  // Non-blocking trigger differential IndexNow check on sitemap refresh
  const indexnowOrigin = base || config.siteUrl || origin
  if (indexnowOrigin) {
    void import('./indexnow')
      .then((m) => m.submitDifferentialSitemapSubjects(indexnowOrigin, subjects))
      .catch((err) => {
        console.warn('[indexnow] background differential sync error:', err)
      })
  }

  const subjectUrls = subjects
    .map((item) => {
      const loc = base ? `${base}/subject/${item.id}` : `/subject/${item.id}`
      const lastmod = getValidLastmodDate(item.airDate)
      const name = item.nameCn || item.name || `番剧 ${item.id}`
      const rawCover = coverOf(item, 'large') || coverOf(item)
      const coverUrl = rawCover ? toBangumiOfficialImageUrl(rawCover) : ''

      const imageBlock = coverUrl
        ? `\n    <image:image>
      <image:loc>${escapeXml(coverUrl)}</image:loc>
      <image:title>${escapeXml(name)}</image:title>
    </image:image>`
        : ''

      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${imageBlock}
  </url>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${staticUrls}
${subjectUrls}
</urlset>
`

  sitemapCache = {
    xml,
    origin: base,
    timestamp: now,
  }

  return xml
}
