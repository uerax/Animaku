import { useEffect, useMemo } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  coverOf,
  formatSubjectDescription,
  formatSubjectTitle,
  generateSubjectKeywords,
} from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import {
  STATIC_ROUTE_SEO,
  applyPageSeo,
  buildBreadcrumbJsonLd,
  buildTvSeriesJsonLd,
  buildWebsiteJsonLd,
  DEFAULT_DESCRIPTION,
  formatDefaultDescription,
  type PageSeo,
} from '../lib/seo'
import { useSiteConfigStore } from '../stores/site-config'

/**
 * Keeps <title> / meta / JSON-LD in sync with the current client route.
 * Mount once under the router (Layout).
 */
export function DocumentSeo() {
  const { pathname, search } = useLocation()
  const siteName = useSiteConfigStore((s) => s.siteName)
  const siteTagline = useSiteConfigStore((s) => s.siteTagline)

  const subjectMatch = matchPath(
    { path: '/subject/:id', end: true },
    pathname,
  )
  const playMatch = matchPath({ path: '/play/:id', end: true }, pathname)
  const subjectId = Number(
    subjectMatch?.params.id || playMatch?.params.id || 0,
  )
  const onSubject = Number.isFinite(subjectId) && subjectId > 0
  /** /play is a cinema alias — canonical + index only on /subject/:id */
  const isPlayAlias = Boolean(playMatch)

  const subject = useQuery({
    queryKey: ['subject', subjectId],
    queryFn: ({ signal }) => bangumiApi.subject(subjectId, { signal }),
    enabled: onSubject,
    staleTime: 30 * 60_000,
    gcTime: 6 * 60 * 60_000,
  })

  const seo: PageSeo = useMemo(() => {
    if (onSubject) {
      const item = subject.data?.data
      const fallbackName = `番剧 ${subjectId}`
      const name = item
        ? item.nameCn || item.name || fallbackName
        : fallbackName
      const alt =
        item && item.nameCn && item.name && item.nameCn !== item.name
          ? item.name
          : undefined
      const summary = item?.summary?.trim()
      const title = formatSubjectTitle(name, alt, siteName?.trim() || undefined)
      const description = formatSubjectDescription(
        name,
        summary,
        160,
        siteName?.trim() || undefined,
      )
      const cover = item ? coverOf(item, 'large') || coverOf(item) : ''
      const tagNames = item?.tags?.map((t) => t.name).filter(Boolean) || []
      const keywords = generateSubjectKeywords(name, alt, tagNames).join(', ')
      const genre = Array.from(new Set(['动画', '动漫', '日本动画', ...tagNames.slice(0, 5)]))

      // Always canonicalize to /subject/:id (even when user is on /play/:id)
      const path = `/subject/${subjectId}`
      // /subject/:id 为公开正规单页（受服务端 SSR 预渲染保护），无论客户端初次挂载是否处于 loading 态，
      // 都必须保持 index,follow，禁止向 DOM 动态注入 noindex 导致搜索引擎被动删除索引；
      // 仅 /play/:id 别名路由声明 noindex 引导规范化至 /subject/:id。
      const indexable = !isPlayAlias
      return {
        title,
        description,
        keywords,
        image: cover || undefined,
        path,
        robots: indexable ? 'index,follow' : 'noindex,follow',
        jsonLd:
          item && !isPlayAlias
            ? [
                buildTvSeriesJsonLd({
                  id: subjectId,
                  name: item.nameCn || item.name,
                  alternateName: alt,
                  description: summary,
                  image: cover || undefined,
                  datePublished: item.airDate || undefined,
                  path,
                  genre,
                  keywords,
                }),
                buildBreadcrumbJsonLd([
                  { name: '首页', path: '/' },
                  { name: '番剧目录', path: '/anime' },
                  { name, path },
                ]),
              ]
            : undefined,
      }
    }

    // /search?q=… — keep noindex; reflect keyword in title for tabs
    if (pathname === '/search') {
      const q = new URLSearchParams(search).get('q')?.trim() || ''
      const base = STATIC_ROUTE_SEO['/search']
      return {
        ...base,
        title: q ? `搜索「${q}」` : base.title,
        path: '/search',
        description: q
          ? `Bangumi 搜索「${q}」的结果 — ${siteName?.trim() || 'Animaku'}`
          : base.description,
      }
    }

    const staticSeo = STATIC_ROUTE_SEO[pathname]
    if (staticSeo) {
      let routeTitle = staticSeo.title
      let routeDescription = staticSeo.description
      if (pathname === '/') {
        const trimmedName = siteName?.trim()
        const trimmedTagline = siteTagline?.trim()
        if (trimmedName) {
          routeTitle = trimmedTagline ? `${trimmedName} - ${trimmedTagline}` : trimmedName
        }
        routeDescription = formatDefaultDescription(trimmedName, trimmedTagline)
      }

      let routeJsonLd: PageSeo['jsonLd'] = undefined
      if (pathname === '/') {
        routeJsonLd = buildWebsiteJsonLd()
      } else if (pathname === '/anime') {
        routeJsonLd = buildBreadcrumbJsonLd([
          { name: '首页', path: '/' },
          { name: '番剧目录', path: '/anime' },
        ])
      } else if (pathname === '/timeline') {
        routeJsonLd = buildBreadcrumbJsonLd([
          { name: '首页', path: '/' },
          { name: '放送时间表', path: '/timeline' },
        ])
      }

      return {
        ...staticSeo,
        title: routeTitle,
        description: routeDescription,
        path: pathname,
        jsonLd: routeJsonLd,
      }
    }

    return {
      title: siteName?.trim() || 'Animaku',
      description: formatDefaultDescription(siteName?.trim(), siteTagline?.trim()),
      path: pathname,
      robots: 'noindex,follow',
    }
  }, [
    isPlayAlias,
    onSubject,
    pathname,
    search,
    subject.data,
    subject.isError,
    subjectId,
    siteName,
    siteTagline,
  ])

  useEffect(() => {
    // 番剧详情页还在首屏加载中时跳过应用，保护服务端 SSR 已注入的高质量标题与 JSON-LD 结构化数据，
    // 避免客户端在数据尚未返回时清空结构化数据或引发无意义的标题闪烁。
    if (onSubject && !subject.data && !subject.isError) {
      return
    }
    applyPageSeo(seo)
  }, [seo, onSubject, subject.data, subject.isError])

  return null
}
