import fs from 'node:fs'
import path from 'node:path'
import type { Context } from 'hono'
import {
  coverOf,
  formatDefaultDescription,
  formatSubjectDescription,
  formatSubjectTitle,
  generateSubjectKeywords,
  parseBangumiItem,
  toBangumiOfficialImageUrl,
  type BangumiItem,
} from '@animaku/shared'
import { config } from '../config'
import { getSiteConfig } from './site-config'
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
  | 'admin'

const ROUTE_CHUNK_PREFIXES: Record<RouteName, string[]> = {
  subject: ['PlayPage-', 'bangumi-oped-', 'watched-', 'server-capabilities-'],
  anime: ['AnimePage-'],
  timeline: ['TimelinePage-'],
  search: ['SearchPage-'],
  collect: ['CollectPage-'],
  history: ['HistoryPage-'],
  settings: ['SettingsPage-'],
  admin: ['AdminPage-'],
}

export function matchRouteName(pathname: string): RouteName | null {
  const clean = pathname.split('?')[0].split('#')[0]
  if (clean.startsWith('/subject/')) return 'subject'
  if (clean === '/anime' || clean.startsWith('/anime/')) return 'anime'
  if (clean === '/timeline' || clean.startsWith('/timeline/')) return 'timeline'
  if (clean === '/search' || clean.startsWith('/search/')) return 'search'
  if (clean === '/collect' || clean.startsWith('/collect/')) return 'collect'
  if (clean === '/history' || clean.startsWith('/history/')) return 'history'
  if (clean === '/settings' || clean.startsWith('/settings/')) return 'settings'
  if (clean === '/admin' || clean.startsWith('/admin/')) return 'admin'
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
    admin: findRouteModulePreloadTags(webRoot, 'admin'),
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
 * Strips any static homepage canonical link and WebSite structured data (JSON-LD)
 * along with any preceding comment from index.html template.
 */
export function stripTemplateHomepageSeo(html: string): string {
  return html
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*\/?>\s*/gi, '')
    .replace(/(?:<!--[^\n]*-->\s*)?<script\s+[^>]*data-animaku-jsonld=["']1["'][^>]*>[\s\S]*?<\/script>\s*/gi, '')
}

/**
 * 动态向 HTML 模板注入自定义站点标题、标语、og:site_name 及 Favicon 缓存指纹/外链
 */
export function applySiteBrandingToHtml(
  html: string,
  options: { replaceTitle?: boolean; replaceDescription?: boolean } = {
    replaceTitle: true,
    replaceDescription: true,
  },
): string {
  const cfg = getSiteConfig()
  let result = html

  if (cfg.siteName || cfg.siteTagline) {
    const siteTitle = cfg.siteTagline
      ? `${cfg.siteName || 'Animaku'} - ${cfg.siteTagline}`
      : cfg.siteName || 'Animaku'
    const dynamicDesc = formatDefaultDescription(cfg.siteName, cfg.siteTagline)

    if (cfg.siteName) {
      result = result.replace(
        /<meta\s+property=["']og:site_name["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
        `<meta property="og:site_name" content="${escapeHtml(cfg.siteName)}" />`,
      )
      result = result.replace(
        /<meta\s+name=["']application-name["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
        `<meta name="application-name" content="${escapeHtml(cfg.siteName)}" />`,
      )
    }

    if (options.replaceTitle) {
      result = result.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(siteTitle)}</title>`)
      result = result.replace(
        /<meta\s+property=["']og:title["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
        `<meta property="og:title" content="${escapeHtml(siteTitle)}" />`,
      )
      result = result.replace(
        /<meta\s+name=["']twitter:title["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
        `<meta name="twitter:title" content="${escapeHtml(siteTitle)}" />`,
      )

      // 动态更新首页原始 HTML 骨架中的 h1 与 p 标签，保证爬虫在首屏无 JS 情况下抓到自定义品牌
      const siteHeading = cfg.siteTagline
        ? `${cfg.siteName || 'Animaku'} - ${cfg.siteTagline}`
        : `${cfg.siteName || 'Animaku'} 动漫 - 在线高清动画多源聚合弹幕平台`
      result = result.replace(
        /<h1\s+class=["']sr-only["']>[\s\S]*?<\/h1>/i,
        `<h1 class="sr-only">${escapeHtml(siteHeading)}</h1>`,
      )
      result = result.replace(
        /<p\s+class=["']sr-only["']>[\s\S]*?<\/p>/i,
        `<p class="sr-only">${escapeHtml(dynamicDesc)}</p>`,
      )

      // 动态重写首页 HTML 中预埋的 WebSite 结构化数据 (JSON-LD)，覆盖静态写死的 name 与 description
      const websiteJsonRegex =
        /(<script\s+type=["']application\/ld\+json["']\s+data-animaku-jsonld=["']1["']>\s*\{[\s\S]*?"@type"\s*:\s*"WebSite"[\s\S]*?<\/script>)/i
      result = result.replace(websiteJsonRegex, (match) => {
        try {
          const jsonStr = match.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')
          const obj = JSON.parse(jsonStr)
          if (cfg.siteName) {
            obj.name = cfg.siteName
            if (Array.isArray(obj.alternateName)) {
              obj.alternateName = Array.from(new Set([cfg.siteName, ...obj.alternateName]))
            }
          }
          obj.description = dynamicDesc
          return `<script type="application/ld+json" data-animaku-jsonld="1">\n      ${escapeJsonLdScript(JSON.stringify(obj, null, 2))}\n    </script>`
        } catch {
          return match
        }
      })
    }

    // 默认 description 仅在未显式关闭 replaceDescription（且 replaceTitle 未置否）时注入，
    // 避免覆盖详情页已渲染好的番剧专属简介 meta description。
    const shouldReplaceDesc = options.replaceDescription ?? options.replaceTitle ?? true
    if (shouldReplaceDesc) {
      result = result.replace(
        /<meta\s+name=["']description["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
        `<meta name="description" content="${escapeHtml(dynamicDesc)}" />`,
      )
      result = result.replace(
        /<meta\s+property=["']og:description["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
        `<meta property="og:description" content="${escapeHtml(dynamicDesc)}" />`,
      )
      result = result.replace(
        /<meta\s+name=["']twitter:description["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
        `<meta name="twitter:description" content="${escapeHtml(dynamicDesc)}" />`,
      )
    }
  }

  // Favicon 与多尺寸图标统一版本指纹穿透 (保持全套图标同源同版本)
  if (cfg.iconMode === 'url' && cfg.iconUrl) {
    const escapedUrl = escapeHtml(cfg.iconUrl)
    result = result
      .replace(
        /<link\s+[^>]*rel=["']icon["'][^>]*\/?>/gi,
        `<link rel="icon" href="${escapedUrl}" sizes="any" />`,
      )
      .replace(
        /<link\s+[^>]*rel=["']apple-touch-icon["'][^>]*\/?>/gi,
        `<link rel="apple-touch-icon" href="${escapedUrl}" />`,
      )
  } else if (cfg.iconUpdatedAt) {
    const v = `?v=${cfg.iconUpdatedAt}`
    result = result
      .replace(/href=["']\/favicon\.ico(?:\?[^"']*)?["']/gi, `href="/favicon.ico${v}"`)
      .replace(/href=["']\/favicon-32x32\.png(?:\?[^"']*)?["']/gi, `href="/favicon-32x32.png${v}"`)
      .replace(/href=["']\/favicon-16x16\.png(?:\?[^"']*)?["']/gi, `href="/favicon-16x16.png${v}"`)
      .replace(/href=["']\/apple-touch-icon\.png(?:\?[^"']*)?["']/gi, `href="/apple-touch-icon.png${v}"`)
      .replace(/href=["']\/android-chrome-192x192\.png(?:\?[^"']*)?["']/gi, `href="/android-chrome-192x192.png${v}"`)
      .replace(/href=["']\/site\.webmanifest(?:\?[^"']*)?["']/gi, `href="/site.webmanifest${v}"`)
      .replace(/content=["']\/android-chrome-512x512\.png(?:\?[^"']*)?["']/gi, `content="/android-chrome-512x512.png${v}"`)
      .replace(/href=["']\/logo\.png(?:\?[^"']*)?["']/gi, `href="/logo.png${v}"`)
  }

  return result
}

/**
 * Returns clean HTML template with route-specific modulepreload tags injected for SPA routes.
 */
export function getPreloadedHtmlForRoute(webRoot: string, pathname: string): string | null {
  const template = getCleanTemplateHtml(webRoot)
  if (!template) return null

  let html = template
  const cleanPath = pathname.split('?')[0].split('#')[0]
  // If requesting a non-home SPA route, strip the static homepage canonical tag & WebSite JSON-LD
  // so search engines do not mistake the sub-route for a homepage mirror before JS hydrates.
  if (cleanPath && cleanPath !== '/' && cleanPath !== '/index.html') {
    html = stripTemplateHomepageSeo(html)
  }

  const route = matchRouteName(pathname)
  if (route) {
    const tags = templateCache?.routePreloadTags[route] || findRouteModulePreloadTags(webRoot, route)
    if (tags) {
      html = html.replace(/<\/head>/i, `${tags}\n  </head>`)
    }
  }

  return applySiteBrandingToHtml(html)
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
  genre?: string[]
  keywords?: string
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
    ...(args.genre && args.genre.length > 0 ? { genre: args.genre } : {}),
    ...(args.keywords ? { keywords: args.keywords } : {}),
    potentialAction: {
      '@type': 'WatchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: args.canonicalUrl,
        inLanguage: 'zh-CN',
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
    },
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
  const cfg = getSiteConfig()
  const siteName = cfg.siteName || 'Animaku'
  const pageTitle = formatSubjectTitle(name, altName, siteName)
  const rawSummary = (item.summary || '').trim()
  const metaDesc = formatSubjectDescription(name, rawSummary, 160, siteName)
  const canonicalUrl = origin ? `${origin}/subject/${subjectId}` : `/subject/${subjectId}`
  const rawCover = coverOf(item, 'large') || coverOf(item)
  const coverUrl = rawCover ? toBangumiOfficialImageUrl(rawCover) : ''

  const tagNames = item.tags?.map((t) => t.name).filter(Boolean) || []
  const keywordsList = generateSubjectKeywords(name, altName, tagNames)
  const keywordsStr = keywordsList.join(', ')
  const genreList = Array.from(new Set(['动画', '动漫', '日本动画', ...tagNames.slice(0, 5)]))

  const [tvSeriesJson, breadcrumbsJson] = buildJsonLd({
    id: subjectId,
    name,
    alternateName: altName,
    description: metaDesc,
    image: coverUrl || undefined,
    datePublished: item.airDate || undefined,
    canonicalUrl,
    origin,
    genre: genreList,
    keywords: keywordsStr,
  })

  let html = templateHtml

  // 1. Replace <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`)

  // 2. Replace <meta name="description" ...>
  html = html.replace(
    /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(metaDesc)}" />`,
  )

  // Replace or inject <meta name="keywords" ...>
  if (/<meta\s+name="keywords"\s+content="[\s\S]*?"\s*\/?>/i.test(html)) {
    html = html.replace(
      /<meta\s+name="keywords"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="keywords" content="${escapeHtml(keywordsStr)}" />`,
    )
  } else {
    html = html.replace(
      /<head>/i,
      `<head>\n    <meta name="keywords" content="${escapeHtml(keywordsStr)}" />`,
    )
  }

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

  // 6. Strip any existing canonical link and homepage WebSite JSON-LD from template,
  // then inject subject Canonical, JSON-LD (TVSeries + BreadcrumbList) & Modulepreload into <head>
  html = stripTemplateHomepageSeo(html)
  const preloadSection = preloadTags ? `\n${preloadTags}` : ''
  const headInject = `  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <script type="application/ld+json" data-animaku-jsonld="1">${escapeJsonLdScript(JSON.stringify(tvSeriesJson))}</script>
    <script type="application/ld+json" data-animaku-jsonld="1">${escapeJsonLdScript(JSON.stringify(breadcrumbsJson))}</script>${preloadSection}
  </head>`

  html = html.replace(/<\/head>/i, headInject)

  // 7. Inject static SEO skeleton into #root as REAL DOM (not <noscript>).
  // Keep h1 text identical to the client-rendered h1 (WatchMeta) — one h1 per page.
  // Note: Do not wrap with <div> here; the replace regex below stops at the first </div>.
  const skeleton = `      <h1 class="sr-only">${escapeHtml(name)}</h1>
      ${altName ? `<p class="sr-only">${escapeHtml(altName)}</p>` : ''}
      <p class="sr-only">${escapeHtml(rawSummary || metaDesc)}</p>
      ${coverUrl ? `<img class="sr-only" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(name)} 海报" width="400" height="533" />` : ''}
      <noscript>请启用 JavaScript 以使用播放器与弹幕功能。</noscript>`

  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>/i,
    `<div id="root">\n${skeleton}\n    </div>`,
  )

  return applySiteBrandingToHtml(html, { replaceTitle: false })
}

/**
 * Prerender a genuine 404 Subject Not Found HTML page.
 */
export function render404Page(templateHtml: string, subjectId: number): string {
  let html = templateHtml

  const cfg = getSiteConfig()
  const siteName = cfg.siteName || 'Animaku'
  const title404 = `番剧不存在 (404) · ${siteName}`
  const desc404 = `未找到条目 ID 为 ${subjectId} 的番剧信息。该番剧可能已下架或不存在。`

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title404)}</title>`)
  html = html.replace(
    /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(desc404)}" />`,
  )

  // 404 pages must never have a canonical link or website jsonld pointing to a valid page
  html = stripTemplateHomepageSeo(html)

  // Inject noindex, nofollow for 404
  if (/<meta\s+name="robots"\s+content="[\s\S]*?"\s*\/?>/i.test(html)) {
    html = html.replace(
      /<meta\s+name="robots"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="robots" content="noindex,nofollow" />`,
    )
  } else {
    html = html.replace(/<head>/i, '<head>\n    <meta name="robots" content="noindex,nofollow" />')
  }

  if (/<meta\s+name="googlebot"\s+content="[\s\S]*?"\s*\/?>/i.test(html)) {
    html = html.replace(
      /<meta\s+name="googlebot"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="googlebot" content="noindex,nofollow" />`,
    )
  } else {
    html = html.replace(
      /<meta\s+name="robots"\s+content="noindex,nofollow"\s*\/?>/i,
      `<meta name="robots" content="noindex,nofollow" />\n    <meta name="googlebot" content="noindex,nofollow" />`,
    )
  }

  // 404 skeleton as REAL DOM (not <noscript>)
  const skeleton404 = `      <h1 class="sr-only">404 - 该番剧不存在或已下架</h1>
      <p class="sr-only">未找到对应的 Bangumi 条目 (ID: ${escapeHtml(String(subjectId))})。</p>
      <noscript>请启用 JavaScript 以使用完整功能。</noscript>`

  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>/i,
    `<div id="root">\n${skeleton404}\n    </div>`,
  )

  return applySiteBrandingToHtml(html, { replaceTitle: false })
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
  let fallbackHtml = stripTemplateHomepageSeo(template)
  if (preloadTags) {
    fallbackHtml = fallbackHtml.replace(/<\/head>/i, `${preloadTags}\n  </head>`)
  }
  fallbackHtml = applySiteBrandingToHtml(fallbackHtml, { replaceTitle: false })
  return new Response(fallbackHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
