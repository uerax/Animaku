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
  assert.equal(matchRouteName('/play/622206?ep=1'), 'subject')
  assert.equal(matchRouteName('/anime'), 'anime')
  assert.equal(matchRouteName('/timeline'), 'timeline')
  assert.equal(matchRouteName('/search?q=test'), 'search')
  assert.equal(matchRouteName('/collect'), 'collect')
  assert.equal(matchRouteName('/history'), 'history')
  assert.equal(matchRouteName('/settings'), 'settings')
  assert.equal(matchRouteName('/'), null)
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
