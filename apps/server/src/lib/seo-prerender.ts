import fs from 'node:fs'
import path from 'node:path'
import type { Context } from 'hono'
import {
  coverOf,
  parseBangumiItem,
  toBangumiOfficialImageUrl,
  type BangumiItem,
} from '@animaku/shared'
import { config } from '../config'
import { bangumiFetch } from './http'
import {
  BANGUMI_CACHE_TTL,
  cacheGet,
  cacheSet,
} from './ttl-cache'

export function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Prevent </script> tags in serialized JSON-LD from prematurely closing the HTML script tag */
export function escapeJsonLdScript(jsonStr: string): string {
  return jsonStr.replace(/<\/script/gi, '<\\/script')
}

export function detectImageMimeType(url: string): string {
  const clean = (url || '').toLowerCase().split('?')[0]
  if (clean.endsWith('.png')) return 'image/png'
  if (clean.endsWith('.webp')) return 'image/webp'
  if (clean.endsWith('.gif')) return 'image/gif'
  if (clean.endsWith('.avif')) return 'image/avif'
  return 'image/jpeg'
}

export function truncateDescription(str: string, maxLen = 200): string {
  const t = str.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  const cut = t.slice(0, maxLen - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`
}

export type RouteName =
  | 'subject'
  | 'anime'
  | 'timeline'
  | 'search'
  | 'collect'
  | 'history'
  | 'settings'

const ROUTE_CHUNK_PREFIXES: Record<RouteName, string[]> = {
  subject: ['PlayPage-', 'bangumi-oped-', 'watched-', 'server-capabilities-'],
  anime: ['AnimePage-'],
  timeline: ['TimelinePage-'],
  search: ['SearchPage-'],
  collect: ['CollectPage-'],
  history: ['HistoryPage-'],
  settings: ['SettingsPage-'],
}

export function matchRouteName(pathname: string): RouteName | null {
  const clean = pathname.split('?')[0].split('#')[0]
  if (clean.startsWith('/subject/') || clean.startsWith('/play/')) return 'subject'
  if (clean === '/anime' || clean.startsWith('/anime/')) return 'anime'
  if (clean === '/timeline' || clean.startsWith('/timeline/')) return 'timeline'
  if (clean === '/search' || clean.startsWith('/search/')) return 'search'
  if (clean === '/collect' || clean.startsWith('/collect/')) return 'collect'
  if (clean === '/history' || clean.startsWith('/history/')) return 'history'
  if (clean === '/settings' || clean.startsWith('/settings/')) return 'settings'
  return null
}

interface TemplateCache {
  html: string
  mtimeMs: number
  path: string
  routePreloadTags: Record<RouteName, string>
}

let templateCache: TemplateCache | null = null

/**
 * Scans webRoot/assets to extract Vite modulepreload tags for a specific route chunk and its dependencies.
 * Enables zero-waterfall parallel chunk downloads on direct visits.
 */
export function findRouteModulePreloadTags(
  webRoot: string,
  route: RouteName,
): string {
  if (!webRoot) return ''
  const assetsDir = path.resolve(webRoot, 'assets')
  try {
    if (!fs.existsSync(assetsDir)) return ''
    const files = fs.readdirSync(assetsDir)
    const prefixes = ROUTE_CHUNK_PREFIXES[route] || []
    const tags: string[] = []

    for (const prefix of prefixes) {
      const match = files.find(
        (f) => f.startsWith(prefix) && f.endsWith('.js'),
      )
      if (match) {
        tags.push(`    <link rel="modulepreload" crossorigin href="/assets/${match}">`)
      }
    }
    return tags.join('\n')
  } catch {
    return ''
  }
}

export function findSubjectModulePreloadTags(webRoot: string): string {
  return findRouteModulePreloadTags(webRoot, 'subject')
}

function buildAllRoutePreloadTags(webRoot: string): Record<RouteName, string> {
  return {
    subject: findRouteModulePreloadTags(webRoot, 'subject'),
    anime: findRouteModulePreloadTags(webRoot, 'anime'),
    timeline: findRouteModulePreloadTags(webRoot, 'timeline'),
    search: findRouteModulePreloadTags(webRoot, 'search'),
    collect: findRouteModulePreloadTags(webRoot, 'collect'),
    history: findRouteModulePreloadTags(webRoot, 'history'),
    settings: findRouteModulePreloadTags(webRoot, 'settings'),
  }
}

/**
 * Reads index.html from disk with mtime hot-invalidation.
 * Always returns a fresh, immutable clean template string.
 */
export function getCleanTemplateHtml(webRoot: string): string {
  if (!webRoot) return ''
  const htmlPath = path.resolve(webRoot, 'index.html')
  try {
    const stat = fs.statSync(htmlPath)
    if (!templateCache || templateCache.path !== htmlPath || templateCache.mtimeMs !== stat.mtimeMs) {
      const html = fs.readFileSync(htmlPath, 'utf-8')
      const routePreloadTags = buildAllRoutePreloadTags(webRoot)
      templateCache = { html, mtimeMs: stat.mtimeMs, path: htmlPath, routePreloadTags }
    }
    return templateCache.html
  } catch (err) {
    console.warn('[seo-prerender] failed to read index.html at', htmlPath, err)
    return ''
  }
}

export function getCachedSubjectPreloadTags(webRoot?: string): string {
  if (templateCache?.routePreloadTags.subject) return templateCache.routePreloadTags.subject
  if (webRoot) return findRouteModulePreloadTags(webRoot, 'subject')
  return ''
}

/**
 * Returns clean HTML template with route-specific modulepreload tags injected for SPA routes.
 */
export function getPreloadedHtmlForRoute(webRoot: string, pathname: string): string | null {
  const template = getCleanTemplateHtml(webRoot)
  if (!template) return null

  const route = matchRouteName(pathname)
  if (!route) return template

  const tags = templateCache?.routePreloadTags[route] || findRouteModulePreloadTags(webRoot, route)
  if (!tags) return template

  return template.replace(/<\/head>/i, `${tags}\n  </head>`)
}

export type SubjectSeoResult =
  | { status: 'success'; data: BangumiItem }
  | { status: 'not_found' }
  | { status: 'degraded'; error: string }

/**
 * Fetch subject metadata with in-memory TTL caching and strict 600ms timeout.
 */
export async function fetchSubjectSeoData(id: number): Promise<SubjectSeoResult> {
  const key = `bangumi:${config.bangumiApiHost}:subject:${id}`
  const cached = cacheGet<{ data: BangumiItem }>(key)
  if (cached?.data) {
    return { status: 'success', data: cached.data }
  }

  const apiUrl = config.bangumiApi
  try {
    // Strict 600ms timeout with AbortController in bangumiFetch
    const res = await bangumiFetch(`${apiUrl}/v0/subjects/${id}`, {
      timeoutMs: 600,
    })

    if (res.status === 404) {
      return { status: 'not_found' }
    }
    if (!res.ok) {
      return { status: 'degraded', error: `upstream status ${res.status}` }
    }

    const json = (await res.json()) as Record<string, unknown>
    const item = parseBangumiItem(json)
    cacheSet(key, { data: item }, BANGUMI_CACHE_TTL.subject)
    return { status: 'success', data: item }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'degraded', error: msg }
  }
}

/**
 * Build rich JSON-LD objects for TVSeries and BreadcrumbList.
 */
export function buildJsonLd(args: {
  id: number
  name: string
  alternateName?: string
  description?: string
  image?: string
  datePublished?: string
  canonicalUrl: string
  origin: string
  ratingScore?: number
  ratingVotes?: number
}): [Record<string, unknown>, Record<string, unknown>] {
  const tvSeries: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: args.name,
    ...(args.alternateName && args.alternateName !== args.name
      ? { alternateName: args.alternateName }
      : {}),
    ...(args.description ? { description: args.description } : {}),
    ...(args.image ? { image: args.image } : {}),
    ...(args.datePublished ? { datePublished: args.datePublished } : {}),
    ...(args.ratingScore && args.ratingScore > 0 && args.ratingVotes && args.ratingVotes > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(args.ratingScore.toFixed(1)),
            bestRating: 10,
            worstRating: 1,
            ratingCount: args.ratingVotes,
          },
        }
      : {}),
    url: args.canonicalUrl,
    identifier: String(args.id),
  }

  const breadcrumbs: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: '首页',
        item: args.origin ? `${args.origin}/` : '/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: '番剧目录',
        item: args.origin ? `${args.origin}/anime` : '/anime',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: args.name,
        item: args.canonicalUrl,
      },
    ],
  }

  return [tvSeries, breadcrumbs]
}

/**
 * Prerender a 200 Success Subject HTML page.
 */
export function renderSuccessPage(
  templateHtml: string,
  subjectId: number,
  item: BangumiItem,
  origin: string,
  preloadTags?: string,
): string {
  const name = item.nameCn || item.name || `番剧 ${subjectId}`
  const altName =
    item.nameCn && item.name && item.nameCn !== item.name ? item.name : undefined
  const pageTitle = altName ? `${name}（${altName}）· Animaku` : `${name} · Animaku`
  const rawSummary = (item.summary || '').trim()
  const metaDesc = rawSummary
    ? truncateDescription(rawSummary, 200)
    : `${name} — 在 Animaku 查看 Bangumi 详细资料、每日更新与高清弹幕播放`
  const canonicalUrl = origin ? `${origin}/subject/${subjectId}` : `/subject/${subjectId}`
  const rawCover = coverOf(item, 'large') || coverOf(item)
  const coverUrl = rawCover ? toBangumiOfficialImageUrl(rawCover) : ''

  const [tvSeriesJson, breadcrumbsJson] = buildJsonLd({
    id: subjectId,
    name,
    alternateName: altName,
    description: metaDesc,
    image: coverUrl || undefined,
    datePublished: item.airDate || undefined,
    canonicalUrl,
    origin,
    ratingScore: item.ratingScore,
    ratingVotes: item.votes,
  })

  let html = templateHtml

  // 1. Replace <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`)

  // 2. Replace <meta name="description" ...>
  html = html.replace(
    /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(metaDesc)}" />`,
  )

  // 3. Replace og:type and og:title
  html = html.replace(
    /<meta\s+property="og:type"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta property="og:type" content="video.tv_show" />`,
  )
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
  )
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(metaDesc)}" />`,
  )

  // 4. Replace og:image with width, height, type & og:url
  if (coverUrl) {
    const mimeType = detectImageMimeType(coverUrl)
    const ogImageBlock = `<meta property="og:image" content="${escapeHtml(coverUrl)}" />
    <meta property="og:image:width" content="400" />
    <meta property="og:image:height" content="533" />
    <meta property="og:image:type" content="${escapeHtml(mimeType)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`

    html = html.replace(
      /<meta\s+property="og:image"\s+content="[\s\S]*?"\s*\/?>/i,
      ogImageBlock,
    )
  }

  // 5. Replace twitter tags
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`,
  )
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(metaDesc)}" />`,
  )
  if (coverUrl) {
    html = html.replace(
      /<meta\s+name="twitter:image"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="twitter:image" content="${escapeHtml(coverUrl)}" />\n    <meta name="twitter:card" content="summary_large_image" />`,
    )
  }

  // 6. Inject Canonical, JSON-LD & Modulepreload into <head>
  const preloadSection = preloadTags ? `\n${preloadTags}` : ''
  const headInject = `  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <script type="application/ld+json" data-animaku-jsonld="1">${escapeJsonLdScript(JSON.stringify(tvSeriesJson))}</script>
    <script type="application/ld+json" data-animaku-jsonld="1">${escapeJsonLdScript(JSON.stringify(breadcrumbsJson))}</script>${preloadSection}
  </head>`

  html = html.replace(/<\/head>/i, headInject)

  // 7. Inject Semantic <noscript> inside #root
  const noscriptContent = `      <noscript>
        <h1>${escapeHtml(name)}</h1>
        ${altName ? `<h2>${escapeHtml(altName)}</h2>` : ''}
        <p>${escapeHtml(rawSummary || metaDesc)}</p>
        ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(name)}" width="400" height="533" />` : ''}
      </noscript>`

  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>/i,
    `<div id="root">\n${noscriptContent}\n    </div>`,
  )

  return html
}

/**
 * Prerender a genuine 404 Subject Not Found HTML page.
 */
function render404Page(templateHtml: string, subjectId: number): string {
  let html = templateHtml

  const title404 = '番剧不存在 (404) · Animaku'
  const desc404 = `未找到条目 ID 为 ${subjectId} 的番剧信息。该番剧可能已下架或不存在。`

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title404)}</title>`)
  html = html.replace(
    /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(desc404)}" />`,
  )

  // Inject noindex, nofollow for 404
  html = html.replace(
    /<meta\s+name="robots"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="robots" content="noindex,nofollow" />`,
  )
  html = html.replace(
    /<meta\s+name="googlebot"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="googlebot" content="noindex,nofollow" />`,
  )

  // Noscript 404 notice
  const noscript404 = `      <noscript>
        <h1>404 - 该番剧不存在或已下架</h1>
        <p>未找到对应的 Bangumi 条目 (ID: ${escapeHtml(String(subjectId))})。</p>
      </noscript>`

  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>/i,
    `<div id="root">\n${noscript404}\n    </div>`,
  )

  return html
}

/**
 * Unified request handler for /subject/:id routes in Hono.
 */
export async function handleSubjectPrerender(
  c: Context,
  webRoot: string,
  origin: string,
): Promise<Response> {
  const rawId = c.req.param('id')
  const subjectId = Number(rawId)

  const template = getCleanTemplateHtml(webRoot)
  if (!template) {
    return c.text('Service Unavailable: index.html not found', 503)
  }

  // 1. Validate subject ID: Must be a positive integer
  if (!Number.isFinite(subjectId) || subjectId <= 0 || !Number.isInteger(subjectId)) {
    const notFoundHtml = render404Page(template, Number.isFinite(subjectId) ? subjectId : 0)
    return new Response(notFoundHtml, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    })
  }

  // 2. Fetch subject metadata
  const result = await fetchSubjectSeoData(subjectId)
  const preloadTags = getCachedSubjectPreloadTags(webRoot)

  // Case A: 200 Success
  if (result.status === 'success') {
    const prerendered = renderSuccessPage(template, subjectId, result.data, origin, preloadTags)
    return new Response(prerendered, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control':
          'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  }

  // Case B: 404 Not Found
  if (result.status === 'not_found') {
    const notFoundHtml = render404Page(template, subjectId)
    return new Response(notFoundHtml, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    })
  }

  // Case C: Upstream timeout or temporary failure -> Fall back cleanly to template with preload
  console.warn(
    `[seo-prerender] fallback to default template for subject /${subjectId}:`,
    result.error,
  )
  const fallbackHtml = preloadTags
    ? template.replace(/<\/head>/i, `${preloadTags}\n  </head>`)
    : template
  return new Response(fallbackHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
