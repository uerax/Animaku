/**
 * Client-side document SEO helpers for the SPA.
 *
 * Crawlers that only fetch raw HTML still see index.html defaults.
 * Google (and similar) that run JS pick up title / meta / JSON-LD updates here.
 * Absolute OG / canonical URLs need VITE_SITE_URL (or runtime origin fallback).
 */

import {
  DEFAULT_SITE_NAME,
  formatHomeTitle,
  formatAnimeListTitle,
  formatTimelineTitle,
  formatSubjectTitle,
  formatDefaultDescription,
  formatAnimeListDescription,
  formatTimelineDescription,
  formatSubjectDescription,
} from '@animaku/shared'
import { useSiteConfigStore } from '../stores/site-config'

export {
  DEFAULT_SITE_NAME,
  formatHomeTitle,
  formatAnimeListTitle,
  formatTimelineTitle,
  formatSubjectTitle,
  formatDefaultDescription,
  formatAnimeListDescription,
  formatTimelineDescription,
  formatSubjectDescription,
}

export const SITE_NAME = DEFAULT_SITE_NAME

export const DEFAULT_DESCRIPTION = formatDefaultDescription()

/** Max length for meta description (search engines typically show ~150–160). */
const DESC_MAX = 160

export type SeoRobots = 'index,follow' | 'noindex,follow' | 'noindex,nofollow'

export type PageSeo = {
  /** Browser tab + og:title base (product name appended unless already present) */
  title: string
  description?: string
  /** Absolute or site-relative image URL for og:image */
  image?: string
  /** Path only, e.g. /anime — used for canonical / og:url */
  path?: string
  robots?: SeoRobots
  keywords?: string
  /** Optional JSON-LD object or list (serialized into application/ld+json) */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

/** Static route SEO (exact path, query ignored except search). */
export const STATIC_ROUTE_SEO: Record<
  string,
  Omit<PageSeo, 'path' | 'image' | 'jsonLd'>
> = {
  '/': {
    title: formatHomeTitle(),
    description: DEFAULT_DESCRIPTION,
  },
  '/anime': {
    title: formatAnimeListTitle(),
    description: formatAnimeListDescription(),
  },
  '/timeline': {
    title: formatTimelineTitle(),
    description: formatTimelineDescription(),
  },
  '/search': {
    title: '搜索 - 高清动漫在线观看',
    description: '在全网动画与Bangumi索引中搜索心仪动漫番剧，获取全集高清视频源与实时弹幕播放支持。',
    robots: 'noindex,follow',
  },
  '/collect': {
    title: '我的追番收藏',
    description: 'Bangumi 收藏数据同步（需个人 Token）。本地私有追番列表，不对搜索引擎开放。',
    robots: 'noindex,nofollow',
  },
  '/history': {
    title: '本地播放历史',
    description: '本地浏览器保存的动画播放进度与选集记录，不对搜索引擎开放。',
    robots: 'noindex,nofollow',
  },
  '/settings': {
    title: '播放与站点设置',
    description: '视频源切换规则、播放器内核、弹幕样式与账号数据管理设置。',
    robots: 'noindex,nofollow',
  },
  '/admin': {
    title: '站点运维与全局配置',
    description: '站点运维管理与全局功能配置面板，需系统管理员权限。',
    robots: 'noindex,nofollow',
  },
  '/404': {
    title: '404 - 页面未找到',
    description: '很抱歉，你访问的页面不存在、已被移除或链接有误。',
    robots: 'noindex,nofollow',
  },
}

/** Public paths listed in sitemap (no private / thin pages). */
export const SITEMAP_PATHS = ['/', '/anime', '/timeline'] as const

export function truncateDescription(text: string, max = DESC_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`
}

export function formatDocumentTitle(pageTitle: string, siteName?: string): string {
  const dynamicName = useSiteConfigStore.getState().siteName?.trim()
  const effectiveSiteName = siteName || dynamicName || SITE_NAME
  const t = pageTitle.trim()
  if (!t || t === effectiveSiteName) return effectiveSiteName

  // 若标题已经包含当前生效的站名，避免重复拼接
  if (t.includes(effectiveSiteName)) return t

  // 若包含默认站名占位符，全局替换为当前自定义站名
  if (t.includes(DEFAULT_SITE_NAME)) {
    return t.replace(new RegExp(DEFAULT_SITE_NAME, 'g'), effectiveSiteName)
  }
  if (t.includes('Animaku')) {
    return t.replace(/Animaku/g, effectiveSiteName)
  }

  // 针对简短页面（设置、观看历史等），拼接品牌后缀
  return `${t} · ${effectiveSiteName}`
}

/** Prefer build-time public site URL; fall back to browser origin. */
export function resolveSiteUrl(): string {
  const fromEnv = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim()
  if (fromEnv) {
    const clean = fromEnv.replace(/\/+$/, '')
    if (clean) {
      return clean.startsWith('http://') || clean.startsWith('https://')
        ? clean
        : `https://${clean}`
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return ''
}

export function toAbsoluteUrl(pathOrUrl: string, siteUrl = resolveSiteUrl()): string {
  const raw = (pathOrUrl || '').trim()
  if (!raw) return siteUrl || ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (!siteUrl) return raw.startsWith('/') ? raw : `/${raw}`
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return `${siteUrl}${path}`
}

function ensureMetaByName(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function ensureMetaByProperty(property: string, content: string) {
  let el = document.querySelector(
    `meta[property="${property}"]`,
  ) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function ensureLinkRel(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

const JSON_LD_ATTR = 'data-animaku-jsonld'

function applyJsonLd(data: PageSeo['jsonLd']) {
  document
    .querySelectorAll(`script[${JSON_LD_ATTR}]`)
    .forEach((n) => n.parentNode?.removeChild(n))
  if (!data) return
  const list = Array.isArray(data) ? data : [data]
  for (const item of list) {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.setAttribute(JSON_LD_ATTR, '1')
    script.textContent = JSON.stringify(item)
    document.head.appendChild(script)
  }
}

/**
 * Apply title + meta + optional JSON-LD to document.head.
 * Safe to call on every navigation; overwrites previous SEO tags we manage.
 */
export function applyPageSeo(seo: PageSeo): void {
  if (typeof document === 'undefined') return

  const dynamicName = useSiteConfigStore.getState().siteName?.trim()
  const dynamicTagline = useSiteConfigStore.getState().siteTagline?.trim()
  const effectiveSiteName = dynamicName || SITE_NAME
  const dynamicDefaultDescription = formatDefaultDescription(
    effectiveSiteName,
    dynamicTagline,
  )

  const title = formatDocumentTitle(seo.title, effectiveSiteName)
  const description = truncateDescription(
    seo.description?.trim() || dynamicDefaultDescription,
  )
  const robots = seo.robots || 'index,follow'
  const isIndexable = robots.startsWith('index')
  const fullRobots = isIndexable
    ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    : robots
  const siteUrl = resolveSiteUrl()
  const path = seo.path || (typeof window !== 'undefined' ? window.location.pathname : '/')
  const pageUrl = toAbsoluteUrl(path, siteUrl)
  const image = seo.image
    ? toAbsoluteUrl(seo.image, siteUrl)
    : toAbsoluteUrl('/android-chrome-512x512.png', siteUrl)

  document.title = title

  ensureMetaByName('description', description)
  if (seo.keywords) {
    ensureMetaByName('keywords', seo.keywords)
  }
  ensureMetaByName('robots', fullRobots)
  ensureMetaByName('googlebot', fullRobots)
  ensureMetaByName('application-name', effectiveSiteName)

  // Open Graph — TVSeries pages use video.tv_show; everything else website
  const isSubjectPath =
    path.startsWith('/subject/') || path.startsWith('/play/')
  ensureMetaByProperty('og:type', isSubjectPath ? 'video.tv_show' : 'website')
  ensureMetaByProperty('og:site_name', effectiveSiteName)
  ensureMetaByProperty('og:title', title)
  ensureMetaByProperty('og:description', description)
  if (pageUrl) ensureMetaByProperty('og:url', pageUrl)
  if (image) ensureMetaByProperty('og:image', image)
  ensureMetaByProperty('og:locale', 'zh_CN')

  // Twitter
  ensureMetaByName('twitter:card', image ? 'summary_large_image' : 'summary')
  ensureMetaByName('twitter:title', title)
  ensureMetaByName('twitter:description', description)
  if (image) ensureMetaByName('twitter:image', image)

  if (pageUrl && robots.startsWith('index')) {
    ensureLinkRel('canonical', pageUrl)
  } else {
    const canon = document.querySelector('link[rel="canonical"]')
    canon?.parentNode?.removeChild(canon)
  }

  applyJsonLd(seo.jsonLd)
}

export function buildWebsiteJsonLd(siteUrl = resolveSiteUrl()): Record<string, unknown> {
  const base = siteUrl ? siteUrl.replace(/\/+$/, '') : ''
  const url = base ? `${base}/` : undefined

  let hostnameBackup = ''
  if (base) {
    try {
      const urlObj = new URL(base.includes('://') ? base : `https://${base}`)
      hostnameBackup = urlObj.hostname.toLowerCase()
    } catch {
      hostnameBackup = base
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .split(':')[0]
        .toLowerCase()
    }
  }

  const dynamicName = useSiteConfigStore.getState().siteName?.trim()
  const dynamicTagline = useSiteConfigStore.getState().siteTagline?.trim()
  const effectiveSiteName = dynamicName || SITE_NAME
  const effectiveDescription = formatDefaultDescription(
    effectiveSiteName,
    dynamicTagline,
  )

  const candidateNames = [
    effectiveSiteName,
    dynamicName,
    hostnameBackup && hostnameBackup !== 'localhost' && hostnameBackup !== '127.0.0.1' ? hostnameBackup : undefined,
  ].filter(Boolean) as string[]
  const alternateName: string[] = Array.from(new Set(candidateNames))

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: effectiveSiteName,
    alternateName,
    description: effectiveDescription,
    ...(url ? { url } : {}),
    // Absolute SearchAction only when we know the public origin
    ...(url
      ? {
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${base}/search?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
        }
      : {}),
  }
}

export function buildTvSeriesJsonLd(args: {
  id: number
  name: string
  alternateName?: string
  description?: string
  image?: string
  path: string
  genre?: string[]
  keywords?: string
}): Record<string, unknown> {
  const siteUrl = resolveSiteUrl()
  const canonicalUrl = toAbsoluteUrl(args.path, siteUrl)
  return {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: args.name,
    ...(args.alternateName && args.alternateName !== args.name
      ? { alternateName: args.alternateName }
      : {}),
    ...(args.description ? { description: truncateDescription(args.description, 300) } : {}),
    ...(args.image ? { image: toAbsoluteUrl(args.image, siteUrl) } : {}),
    // datePublished removed: Google misinterprets anime airDate as page publication date
    ...(args.genre && args.genre.length > 0 ? { genre: args.genre } : {}),
    ...(args.keywords ? { keywords: args.keywords } : {}),
    potentialAction: {
      '@type': 'WatchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: canonicalUrl,
        inLanguage: 'zh-CN',
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
    },
    url: canonicalUrl,
    identifier: String(args.id),
  }
}

export function buildBreadcrumbJsonLd(
  items: { name: string; path: string }[],
  siteUrl = resolveSiteUrl(),
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.path, siteUrl),
    })),
  }
}
