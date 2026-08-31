import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildJsonLd,
  escapeHtml,
  escapeJsonLdScript,
  detectImageMimeType,
  truncateDescription,
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
