import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  buildJsonLd,
  escapeHtml,
  escapeJsonLdScript,
  detectImageMimeType,
  truncateDescription,
  findSubjectModulePreloadTags,
  findRouteModulePreloadTags,
  matchRouteName,
  getPreloadedHtmlForRoute,
  renderSuccessPage,
  render404Page,
  stripTemplateHomepageSeo,
  applySiteBrandingToHtml,
} from './seo-prerender'
import { getSiteConfig, saveSiteConfig } from './site-config'

test('buildJsonLd: builds TVSeries and BreadcrumbList schema objects without aggregateRating (Google compliance)', () => {
  const [tvSeries, breadcrumbs] = buildJsonLd({
    id: 100403,
    name: 'Fate/stay night [Unlimited Blade Works]',
    alternateName: 'Fate UBW',
    description: '圣杯战争',
    image: 'https://lain.bgm.tv/pic/cover/l/100403.jpg',
    datePublished: '2014-10-04',
    canonicalUrl: 'https://animaku.app/subject/100403',
    origin: 'https://animaku.app',
  })

  assert.equal(tvSeries['@type'], 'TVSeries')
  assert.equal(tvSeries.name, 'Fate/stay night [Unlimited Blade Works]')
  assert.equal(tvSeries.alternateName, 'Fate UBW')
  assert.equal(tvSeries.url, 'https://animaku.app/subject/100403')

  // Verify WatchAction
  const watchAction = tvSeries.potentialAction as Record<string, unknown>
  assert.ok(watchAction)
  assert.equal(watchAction['@type'], 'WatchAction')

  // Strictly assert aggregateRating is omitted to comply with Google review snippet guidelines
  assert.equal(tvSeries.aggregateRating, undefined)

  // Verify breadcrumbs
  assert.equal(breadcrumbs['@type'], 'BreadcrumbList')
  const list = breadcrumbs.itemListElement as Array<{ position: number; name: string }>
  assert.equal(list.length, 3)
  assert.equal(list[0].position, 1)
  assert.equal(list[2].name, 'Fate/stay night [Unlimited Blade Works]')
})

test('buildJsonLd: consistently omits aggregateRating across minimal subjects', () => {
  const [tvSeries] = buildJsonLd({
    id: 999999,
    name: '新番未开播',
    canonicalUrl: 'https://animaku.app/subject/999999',
    origin: 'https://animaku.app',
  })

  assert.equal(tvSeries.aggregateRating, undefined)
})

test('escapeJsonLdScript: safely prevents script tag breakout', () => {
  const input = '{"desc":"Dangerous </script><script>alert(1)</script>"}'
  const output = escapeJsonLdScript(input)
  assert.ok(!output.includes('</script'))
  assert.ok(output.includes('<\\/script'))
})

test('escapeHtml: safely escapes special HTML entities', () => {
  assert.equal(escapeHtml('<div class="test">&\'</div>'), '&lt;div class=&quot;test&quot;&gt;&amp;&#39;&lt;/div&gt;')
})

test('detectImageMimeType & truncateDescription utilities', () => {
  assert.equal(detectImageMimeType('https://lain.bgm.tv/cover.webp?v=1'), 'image/webp')
  assert.equal(detectImageMimeType('https://lain.bgm.tv/cover.jpg'), 'image/jpeg')
  assert.equal(detectImageMimeType('https://lain.bgm.tv/cover.png'), 'image/png')

  assert.equal(truncateDescription('短描述', 50), '短描述')
})

test('findSubjectModulePreloadTags: extracts PlayPage and dependency chunks from assets dir', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-preload-test-'))
  const assetsDir = path.join(tmpDir, 'assets')
  fs.mkdirSync(assetsDir)

  fs.writeFileSync(path.join(assetsDir, 'index-12345.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'PlayPage-ABCDEF.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'bangumi-oped-98765.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'server-capabilities-54321.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'watched-11111.js'), '')

  const tags = findSubjectModulePreloadTags(tmpDir)
  assert.ok(tags.includes('<link rel="modulepreload" crossorigin href="/assets/PlayPage-ABCDEF.js">'))
  assert.ok(tags.includes('<link rel="modulepreload" crossorigin href="/assets/bangumi-oped-98765.js">'))
  assert.ok(tags.includes('<link rel="modulepreload" crossorigin href="/assets/server-capabilities-54321.js">'))
  assert.ok(tags.includes('<link rel="modulepreload" crossorigin href="/assets/watched-11111.js">'))

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('renderSuccessPage: injects modulepreload tags cleanly into head', () => {
  const mockTemplate = '<!doctype html><html><head><title>Old</title></head><body><div id="root"></div></body></html>'
  const mockItem = {
    id: 622206,
    name: 'ヤニねこ',
    nameCn: '尼古喵喵',
    airDate: '2026-01-01',
    summary: '测试番剧简介',
  } as unknown as import('@animaku/shared').BangumiItem
  const preloadTags = '    <link rel="modulepreload" crossorigin href="/assets/PlayPage-Test.js">'
  const rendered = renderSuccessPage(mockTemplate, 622206, mockItem, 'https://animaku.app', preloadTags)

  assert.ok(rendered.includes('<link rel="modulepreload" crossorigin href="/assets/PlayPage-Test.js">'))
  assert.ok(rendered.includes('<title>《尼古喵喵》（ヤニねこ）全集高清在线观看 - Animaku 动漫 - 弹幕播放与多源聚合平台</title>'))
  const descMatch = rendered.match(/<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i)?.[1] || ''
  assert.ok(descMatch.length >= 150 && descMatch.length <= 160)
  assert.ok(rendered.includes('data-animaku-jsonld="1"'))
  assert.ok(rendered.includes('"@type":"WatchAction"'))
  assert.ok(rendered.includes('name="keywords"'))
  assert.ok(rendered.includes('尼古喵喵在线'))
  assert.ok(rendered.includes('尼古喵喵 在线'))
  assert.ok(rendered.includes('尼古喵喵动漫'))
  assert.ok(rendered.includes('<h1 class="sr-only">尼古喵喵</h1>'))
  // exactly one h1, and none of it lives inside <noscript>
  assert.equal((rendered.match(/<h1[\s>]/g) || []).length, 1)
  assert.ok(!/<noscript>[\s\S]*?<h1/i.test(rendered))
})

test('matchRouteName: matches all core routes and returns null for unmapped/home', () => {
  assert.equal(matchRouteName('/subject/400602'), 'subject')
  assert.equal(matchRouteName('/anime'), 'anime')
  assert.equal(matchRouteName('/timeline'), 'timeline')
  assert.equal(matchRouteName('/search'), 'search')
  assert.equal(matchRouteName('/collect'), 'collect')
  assert.equal(matchRouteName('/history'), 'history')
  assert.equal(matchRouteName('/settings'), 'settings')
  assert.equal(matchRouteName('/admin'), 'admin')
  assert.equal(matchRouteName('/'), null)
  assert.equal(matchRouteName('/unknown'), null)
})

test('findRouteModulePreloadTags & getPreloadedHtmlForRoute: works across all routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-route-preload-test-'))
  const assetsDir = path.join(tmpDir, 'assets')
  fs.mkdirSync(assetsDir)

  fs.writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html><head><title>Old</title></head><body><div id="root"></div></body></html>')
  fs.writeFileSync(path.join(assetsDir, 'AnimePage-11111.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'TimelinePage-22222.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'SearchPage-33333.js'), '')

  // 1. Module preload extraction
  assert.ok(findRouteModulePreloadTags(tmpDir, 'anime').includes('AnimePage-11111.js'))
  assert.ok(findRouteModulePreloadTags(tmpDir, 'timeline').includes('TimelinePage-22222.js'))
  assert.ok(findRouteModulePreloadTags(tmpDir, 'search').includes('SearchPage-33333.js'))

  // 2. Route preload HTML injection & title/desc optimization
  const animeHtml = getPreloadedHtmlForRoute(tmpDir, '/anime', 'https://animaku.app')
  assert.ok(animeHtml?.includes('AnimePage-11111.js'))
  assert.ok(animeHtml?.includes('<title>Animaku 动漫 - 番剧列表 - 高清动漫在线观看 - 免费热门番剧在线观看平台</title>'))
  assert.ok(animeHtml?.includes('<link rel="canonical" href="https://animaku.app/anime" />'))
  const animeDesc = animeHtml?.match(/<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i)?.[1] || ''
  assert.ok(animeDesc.length >= 150 && animeDesc.length <= 160)

  const timelineHtml = getPreloadedHtmlForRoute(tmpDir, '/timeline', 'https://animaku.app')
  assert.ok(timelineHtml?.includes('TimelinePage-22222.js'))
  assert.ok(timelineHtml?.includes('<title>Animaku 动漫 - 每日新番放送时间表 - 高清动漫在线观看 - 免费热门番剧在线观看平台</title>'))
  assert.ok(timelineHtml?.includes('<link rel="canonical" href="https://animaku.app/timeline" />'))
  const timelineDesc = timelineHtml?.match(/<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i)?.[1] || ''
  assert.ok(timelineDesc.length >= 150 && timelineDesc.length <= 160)

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('renderSuccessPage: removes template canonical and injects unique subject canonical', () => {
  const templateWithCanonical = `<!doctype html>
<html>
<head>
  <title>Old</title>
  <link rel="canonical" href="https://animaku.app/" />
</head>
<body><div id="root"></div></body>
</html>`

  const mockItem = {
    id: 400602,
    name: '葬送のフリーレン',
    nameCn: '葬送的芙莉莲',
  } as unknown as import('@animaku/shared').BangumiItem

  const rendered = renderSuccessPage(templateWithCanonical, 400602, mockItem, 'https://animaku.app')

  // Homepage canonical MUST be removed and replaced with /subject/400602
  assert.ok(!rendered.includes('href="https://animaku.app/"'))
  assert.ok(rendered.includes('href="https://animaku.app/subject/400602"'))
  // Exactly one canonical link
  assert.equal((rendered.match(/<link\s+[^>]*rel=["']canonical["']/g) || []).length, 1)
})

test('getPreloadedHtmlForRoute: strips homepage canonical and WebSite JSON-LD for non-home SPA routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-strip-canonical-test-'))
  const template = `<!doctype html>
<html>
<head>
  <title>Animaku 动漫</title>
  <link rel="canonical" href="https://animaku.app/" />
  <!--website-jsonld-->
  <script type="application/ld+json" data-animaku-jsonld="1">
    {"@context":"https://schema.org","@type":"WebSite","name":"Animaku"}
  </script>
</head>
<body><div id="root"></div></body>
</html>`
  fs.writeFileSync(path.join(tmpDir, 'index.html'), template)

  // 1. Home route MUST KEEP the canonical link & WebSite JSON-LD
  const homeHtml = getPreloadedHtmlForRoute(tmpDir, '/')
  assert.ok(homeHtml?.includes('<link rel="canonical" href="https://animaku.app/" />'))
  assert.ok(homeHtml?.includes('"@type":"WebSite"'))

  // 2. Sub-route (/settings) MUST STRIP the homepage canonical tag & WebSite JSON-LD
  const settingsHtml = getPreloadedHtmlForRoute(tmpDir, '/settings')
  assert.ok(!settingsHtml?.includes('href="https://animaku.app/"'))
  assert.ok(!settingsHtml?.includes('"@type":"WebSite"'))
  assert.ok(!settingsHtml?.includes('<!--website-jsonld-->'))

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('stripTemplateHomepageSeo: cleanly strips canonical, WebSite JSON-LD and preceding comments without orphans', () => {
  const htmlWithComment = `<!doctype html>
<html>
<head>
  <title>Animaku 动漫</title>
  <!-- Canonical URL injected dynamically by vite.config.ts -->
  <link rel="canonical" href="https://animaku.app/" />
  <!-- Google WebSite structured data (Site Name) injected dynamically -->
  <script type="application/ld+json" data-animaku-jsonld="1">
    {"@context":"https://schema.org","@type":"WebSite","name":"Animaku"}
  </script>
</head>
<body><div id="root"></div></body>
</html>`

  const stripped = stripTemplateHomepageSeo(htmlWithComment)
  assert.ok(!stripped.includes('rel="canonical"'))
  assert.ok(!stripped.includes('data-animaku-jsonld="1"'))
  assert.ok(!stripped.includes('Google WebSite structured data'))
})

test('render404Page: strips canonical and WebSite JSON-LD and injects noindex,nofollow', () => {
  const mockTemplate = `<!doctype html>
<html>
<head>
  <title>Animaku 动漫</title>
  <meta name="robots" content="index,follow" />
  <meta name="googlebot" content="index,follow" />
  <link rel="canonical" href="https://animaku.app/" />
  <script type="application/ld+json" data-animaku-jsonld="1">{"@type":"WebSite"}</script>
</head>
<body><div id="root"></div></body>
</html>`

  const page404 = render404Page(mockTemplate, 9999999)
  assert.ok(page404.includes('noindex,nofollow'))
  assert.ok(!page404.includes('index,follow'))
  assert.ok(!page404.includes('rel="canonical"'))
  assert.ok(!page404.includes('data-animaku-jsonld="1"'))
  assert.ok(page404.includes('<h1 class="sr-only">404 - 该番剧不存在或已下架</h1>'))
})

test('applySiteBrandingToHtml: replaces description tags when siteName and siteTagline are configured', () => {
  const original = getSiteConfig()
  try {
    saveSiteConfig({
      siteName: '极简动漫',
      siteTagline: '纯粹二次元',
      iconMode: 'default',
    })

    const template = `<!doctype html>
<html>
<head>
  <title>Animaku 动漫</title>
  <meta name="application-name" content="Animaku 动漫" />
  <meta property="og:site_name" content="Animaku 动漫" />
  <meta property="og:title" content="Animaku 动漫" />
  <meta name="twitter:title" content="Animaku 动漫" />
  <meta name="description" content="Animaku 多资源聚合..." />
  <meta property="og:description" content="Animaku 多资源聚合..." />
  <meta name="twitter:description" content="Animaku 多资源聚合..." />
  <script type="application/ld+json" data-animaku-jsonld="1">{"@type":"WebSite","name":"Animaku 动漫"}</script>
</head>
<body>
  <div id="root">
    <h1 class="sr-only">Animaku 动漫 - 在线高清动画多源聚合弹幕平台</h1>
    <p class="sr-only">Animaku 多资源聚合...</p>
  </div>
</body>
</html>`

    const result = applySiteBrandingToHtml(template)
    assert.ok(result.includes('<title>极简动漫 - 纯粹二次元 - 高清动漫在线观看 - 免费热门番剧在线观看平台</title>'))
    assert.ok(result.includes('<meta property="og:title" content="极简动漫 - 纯粹二次元 - 高清动漫在线观看 - 免费热门番剧在线观看平台" />'))
    assert.ok(result.includes('<meta name="twitter:title" content="极简动漫 - 纯粹二次元 - 高清动漫在线观看 - 免费热门番剧在线观看平台" />'))
    assert.ok(result.includes('极简动漫（纯粹二次元）致力于为广大动漫爱好者提供优质的高清日漫新番'))
    assert.ok(result.includes('<h1 class="sr-only">极简动漫 - 纯粹二次元</h1>'))
    assert.ok(result.includes('"name": "极简动漫"'))

    // When replaceTitle/replaceDescription is false (e.g. subject page), custom description and title are not overwritten
    const preserveDesc = applySiteBrandingToHtml(template, { replaceTitle: false })
    assert.ok(preserveDesc.includes('<title>Animaku 动漫</title>'))
    assert.ok(preserveDesc.includes('<meta property="og:title" content="Animaku 动漫" />'))
    assert.ok(preserveDesc.includes('content="Animaku 多资源聚合..."'))
  } finally {
    saveSiteConfig({
      siteName: original.siteName,
      siteTagline: original.siteTagline,
      iconMode: original.iconMode,
      iconUrl: original.iconUrl,
    })
  }
})

test('applySiteBrandingToHtml: injects compliant Google WebSite schema with url and domain alternateNames', () => {
  const original = getSiteConfig()
  try {
    saveSiteConfig({
      siteName: '杂口动漫',
      siteTagline: '在线追番',
      iconMode: 'default',
    })

    const template = `<!doctype html><html><head><title>Old</title></head><body><div id="root"></div></body></html>`
    const result = applySiteBrandingToHtml(template, { origin: 'https://zakoway.com' })
    assert.ok(result.includes('"@type": "WebSite"'))
    assert.ok(result.includes('"name": "杂口动漫"'))
    assert.ok(result.includes('"url": "https://zakoway.com/"'))
    assert.ok(result.includes('"zakoway.com"'))
    assert.ok(result.includes('"zakoway"'))
    assert.ok(result.includes('<link rel="canonical" href="https://zakoway.com/" />'))
  } finally {
    saveSiteConfig({
      siteName: original.siteName,
      siteTagline: original.siteTagline,
      iconMode: original.iconMode,
      iconUrl: original.iconUrl,
    })
  }
})
