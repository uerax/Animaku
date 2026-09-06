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
} from './seo-prerender'

test('buildJsonLd: builds TVSeries and BreadcrumbList schema objects with aggregateRating', () => {
  const [tvSeries, breadcrumbs] = buildJsonLd({
    id: 100403,
    name: 'Fate/stay night [Unlimited Blade Works]',
    alternateName: 'Fate UBW',
    description: '圣杯战争',
    image: 'https://lain.bgm.tv/pic/cover/l/100403.jpg',
    datePublished: '2014-10-04',
    canonicalUrl: 'https://animaku.app/subject/100403',
    origin: 'https://animaku.app',
    ratingScore: 8.4,
    ratingVotes: 12500,
  })

  assert.equal(tvSeries['@type'], 'TVSeries')
  assert.equal(tvSeries.name, 'Fate/stay night [Unlimited Blade Works]')
  assert.equal(tvSeries.alternateName, 'Fate UBW')
  assert.equal(tvSeries.url, 'https://animaku.app/subject/100403')

  // Verify aggregateRating structure
  const agg = tvSeries.aggregateRating as Record<string, unknown>
  assert.ok(agg)
  assert.equal(agg['@type'], 'AggregateRating')
  assert.equal(agg.ratingValue, 8.4)
  assert.equal(agg.bestRating, 10)
  assert.equal(agg.worstRating, 1)
  assert.equal(agg.ratingCount, 12500)

  // Verify breadcrumbs
  assert.equal(breadcrumbs['@type'], 'BreadcrumbList')
  const list = breadcrumbs.itemListElement as Array<{ position: number; name: string }>
  assert.equal(list.length, 3)
  assert.equal(list[0].position, 1)
  assert.equal(list[2].name, 'Fate/stay night [Unlimited Blade Works]')
})

test('buildJsonLd: gracefully omits aggregateRating when score or votes is missing', () => {
  const [tvSeries] = buildJsonLd({
    id: 999999,
    name: '新番未开播',
    canonicalUrl: 'https://animaku.app/subject/999999',
    origin: 'https://animaku.app',
    ratingScore: 0,
    ratingVotes: 0,
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
  assert.ok(rendered.includes('<title>尼古喵喵（ヤニねこ）· Animaku</title>'))
  assert.ok(rendered.includes('data-animaku-jsonld="1"'))
})

test('matchRouteName: matches all core routes and returns null for unmapped/home', () => {
  assert.equal(matchRouteName('/subject/622206'), 'subject')
  assert.equal(matchRouteName('/anime'), 'anime')
  assert.equal(matchRouteName('/timeline'), 'timeline')
  assert.equal(matchRouteName('/search?q=test'), 'search')
  assert.equal(matchRouteName('/collect'), 'collect')
  assert.equal(matchRouteName('/history'), 'history')
  assert.equal(matchRouteName('/settings'), 'settings')
  assert.equal(matchRouteName('/'), null)
  assert.equal(matchRouteName('/play/622206'), null)
  assert.equal(matchRouteName('/404'), null)
})

test('findRouteModulePreloadTags & getPreloadedHtmlForRoute: works across all routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-universal-preload-test-'))
  const assetsDir = path.join(tmpDir, 'assets')
  fs.mkdirSync(assetsDir)

  fs.writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html><head><title>Animaku</title></head><body><div id="root"></div></body></html>')
  fs.writeFileSync(path.join(assetsDir, 'AnimePage-123.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'TimelinePage-456.js'), '')
  fs.writeFileSync(path.join(assetsDir, 'SettingsPage-789.js'), '')

  const animeTags = findRouteModulePreloadTags(tmpDir, 'anime')
  assert.ok(animeTags.includes('/assets/AnimePage-123.js'))

  const animeHtml = getPreloadedHtmlForRoute(tmpDir, '/anime')
  assert.ok(animeHtml?.includes('<link rel="modulepreload" crossorigin href="/assets/AnimePage-123.js">'))

  const settingsHtml = getPreloadedHtmlForRoute(tmpDir, '/settings')
  assert.ok(settingsHtml?.includes('<link rel="modulepreload" crossorigin href="/assets/SettingsPage-789.js">'))

  const homeHtml = getPreloadedHtmlForRoute(tmpDir, '/')
  assert.ok(!homeHtml?.includes('SettingsPage'))
  assert.ok(homeHtml?.includes('<title>Animaku</title>'))

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('renderSuccessPage: removes template canonical and injects unique subject canonical', () => {
  const mockTemplateWithCanonical =
    '<!doctype html><html><head><title>Animaku</title><link rel="canonical" href="https://animaku.app/" /><script type="application/ld+json" data-animaku-jsonld="1">{"@type":"WebSite","name":"Animaku"}</script></head><body><div id="root"></div></body></html>'
  const mockItem = {
    id: 12345,
    name: '测试番剧',
    nameCn: '测试番剧中文名',
    airDate: '2026-01-01',
    summary: '测试番剧简介',
  } as unknown as import('@animaku/shared').BangumiItem

  const rendered = renderSuccessPage(
    mockTemplateWithCanonical,
    12345,
    mockItem,
    'https://animaku.app',
  )

  const canonicalMatches = rendered.match(/<link[^>]+rel=["']canonical["'][^>]*>/gi)
  assert.equal(canonicalMatches?.length, 1, 'Should contain exactly ONE canonical tag')
  assert.ok(
    rendered.includes('<link rel="canonical" href="https://animaku.app/subject/12345" />'),
    'Should point to subject canonical url',
  )
  assert.ok(
    !rendered.includes('<link rel="canonical" href="https://animaku.app/" />'),
    'Should not contain old homepage canonical url',
  )

  const jsonLdScripts = rendered.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>/gi)
  assert.equal(jsonLdScripts?.length, 2, 'Should contain exactly TWO JSON-LD tags (TVSeries + BreadcrumbList)')
  assert.ok(!rendered.includes('"@type":"WebSite"'), 'Should strip template WebSite JSON-LD to avoid entity confusion')
  assert.ok(rendered.includes('"@type":"TVSeries"'), 'Should include TVSeries schema')
  assert.ok(rendered.includes('"@type":"BreadcrumbList"'), 'Should include BreadcrumbList schema')
})

test('getPreloadedHtmlForRoute: strips homepage canonical and WebSite JSON-LD for non-home SPA routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-canonical-preload-test-'))
  fs.writeFileSync(
    path.join(tmpDir, 'index.html'),
    '<!doctype html><html><head><title>Animaku</title><link rel="canonical" href="https://animaku.app/" /><script type="application/ld+json" data-animaku-jsonld="1">{"@type":"WebSite"}</script></head><body><div id="root"></div></body></html>',
  )

  const homeHtml = getPreloadedHtmlForRoute(tmpDir, '/')
  assert.ok(
    homeHtml?.includes('<link rel="canonical" href="https://animaku.app/" />'),
    'Home route preserves homepage canonical',
  )
  assert.ok(
    homeHtml?.includes('{"@type":"WebSite"}'),
    'Home route preserves WebSite JSON-LD',
  )

  const animeHtml = getPreloadedHtmlForRoute(tmpDir, '/anime')
  assert.ok(
    !animeHtml?.includes('<link rel="canonical"'),
    'Sub-route strips homepage canonical to avoid duplicate ranking signal',
  )
  assert.ok(
    !animeHtml?.includes('{"@type":"WebSite"}'),
    'Sub-route strips homepage WebSite JSON-LD to avoid entity confusion',
  )

  const indexHtml = getPreloadedHtmlForRoute(tmpDir, '/index.html')
  assert.ok(
    indexHtml?.includes('<link rel="canonical" href="https://animaku.app/" />'),
    'index.html preserves homepage canonical',
  )

  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('stripTemplateHomepageSeo: cleanly strips canonical, WebSite JSON-LD and preceding comments without orphans', () => {
  const template = `<!doctype html>
<html>
<head>
  <link rel="canonical" href="https://animaku.app/" />
  <!-- Google 网站名称结构化数据 (Site Name) -->
  <script type="application/ld+json" data-animaku-jsonld="1">
    {"@context":"https://schema.org","@type":"WebSite","name":"Animaku"}
  </script>
</head>
<body><div id="root"></div></body>
</html>`

  const cleaned = stripTemplateHomepageSeo(template)
  assert.ok(!cleaned.includes('rel="canonical"'), 'Strips canonical')
  assert.ok(!cleaned.includes('data-animaku-jsonld'), 'Strips WebSite JSON-LD')
  assert.ok(!cleaned.includes('Google 网站名称结构化数据'), 'Strips preceding comment without leaving orphans')
})

test('render404Page: strips canonical and WebSite JSON-LD and injects noindex,nofollow', () => {
  const template = `<!doctype html>
<html>
<head>
  <title>Animaku</title>
  <meta name="description" content="Animaku 动漫" />
  <link rel="canonical" href="https://animaku.app/" />
  <script type="application/ld+json" data-animaku-jsonld="1">
    {"@type":"WebSite"}
  </script>
  <meta name="robots" content="index,follow" />
</head>
<body><div id="root"></div></body>
</html>`

  const notFoundHtml = render404Page(template, 999999)
  assert.ok(!notFoundHtml.includes('rel="canonical"'), '404 page must never have canonical')
  assert.ok(!notFoundHtml.includes('"@type":"WebSite"'), '404 page must not contain WebSite JSON-LD')
  assert.ok(notFoundHtml.includes('<title>番剧不存在 (404) · Animaku</title>'), '404 page title')
  assert.ok(notFoundHtml.includes('<meta name="robots" content="noindex,nofollow" />'), '404 robots noindex')
  assert.ok(notFoundHtml.includes('<meta name="googlebot" content="noindex,nofollow" />'), '404 googlebot noindex')
})
