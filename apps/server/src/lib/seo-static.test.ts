import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRobotsTxt, buildLlmsTxt, buildDynamicSitemapXml } from './seo-static'

test('buildRobotsTxt: contains explicit rules for mainstream AI bots', () => {
  const robots = buildRobotsTxt('https://animaku.app')

  assert.ok(robots.includes('User-agent: GPTBot'))
  assert.ok(robots.includes('User-agent: ChatGPT-User'))
  assert.ok(robots.includes('User-agent: ClaudeBot'))
  assert.ok(robots.includes('User-agent: anthropic-ai'))
  assert.ok(robots.includes('User-agent: PerplexityBot'))
  assert.ok(robots.includes('User-agent: Google-Extended'))
  assert.ok(robots.includes('User-agent: Applebot-Extended'))
  assert.ok(robots.includes('User-agent: CCBot'))

  // Verify allowances
  assert.ok(robots.includes('Allow: /subject/'))
  assert.ok(robots.includes('Allow: /anime'))
  assert.ok(robots.includes('Allow: /timeline'))
  assert.ok(robots.includes('Allow: /llms.txt'))

  // Verify disallowances
  assert.ok(robots.includes('Disallow: /play/'))
  assert.ok(robots.includes('Disallow: /settings'))
  assert.ok(robots.includes('Disallow: /history'))

  // Verify sitemap line
  assert.ok(robots.includes('Sitemap: https://animaku.app/sitemap.xml'))
})

test('buildLlmsTxt: generates restrained markdown with accurate Frieren ID and no exaggeration/API promises', () => {
  const llms = buildLlmsTxt('https://animaku.test')

  assert.ok(llms.startsWith('# Animaku'))
  assert.ok(llms.includes('[番剧目录](https://animaku.test/anime)'))
  assert.ok(llms.includes('[每日放送时间表](https://animaku.test/timeline)'))
  assert.ok(llms.includes('https://animaku.test/subject/{bangumiId}'))

  // Verified accurate Frieren ID 400602
  assert.ok(llms.includes('https://animaku.test/subject/400602'))
  assert.ok(!llms.includes('400653'), 'Must not contain old erroneous manga ID 400653')

  // Restrained wording assertions (negative assertions)
  assert.ok(!llms.includes('无广告'), 'Must not claim unprovable "无广告"')
  assert.ok(!llms.includes('Aniku'), 'Must not mention legacy alias "Aniku"')
  assert.ok(!llms.includes('高清流媒体播放'), 'Must not claim unprovable "高清流媒体播放"')
  assert.ok(!llms.includes('100% 同步'), 'Must not claim unprovable "100% 同步"')
  assert.ok(!llms.includes('AggregateRating'), 'Must not mention removed AggregateRating')
  assert.ok(!llms.includes('/api/bangumi/subjects/{id}'), 'Must not promise public API endpoint')
})

test('buildDynamicSitemapXml: subjects have no lastmod and no double-escaped entities', async () => {
  const xml = await buildDynamicSitemapXml('https://animaku.test', true)

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.ok(xml.includes('<loc>https://animaku.test/</loc>'))
  assert.ok(xml.includes('<loc>https://animaku.test/anime</loc>'))
  assert.ok(xml.includes('<loc>https://animaku.test/timeline</loc>'))

  // 1. Static entries: / and /timeline have daily lastmod, /anime does NOT have lastmod
  const today = new Date().toISOString().slice(0, 10)
  const homeBlock = xml.slice(xml.indexOf('<loc>https://animaku.test/</loc>'), xml.indexOf('<loc>https://animaku.test/anime</loc>'))
  assert.ok(homeBlock.includes(`<lastmod>${today}</lastmod>`), 'Home route has daily lastmod')

  const animeBlock = xml.slice(xml.indexOf('<loc>https://animaku.test/anime</loc>'), xml.indexOf('<loc>https://animaku.test/timeline</loc>'))
  assert.ok(!animeBlock.includes('<lastmod>'), 'Anime route omits lastmod because it is weekly')

  // 2. Dynamic subject entries MUST NOT contain <lastmod>
  const subjectUrlBlocks = xml.split('<url>').filter((b) => b.includes('/subject/'))
  for (const block of subjectUrlBlocks) {
    assert.ok(!block.includes('<lastmod>'), 'Subject entries must omit <lastmod> to prevent fake/future dates')
  }

  // 3. Must not contain double-escaped HTML entities like &amp;#39; or &amp;#
  assert.ok(!xml.includes('&amp;#'), 'Sitemap XML must not double-escape HTML entities into &amp;#')
})

