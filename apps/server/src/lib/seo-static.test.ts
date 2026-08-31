import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRobotsTxt, buildLlmsTxt } from './seo-static'

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

test('buildLlmsTxt: generates valid markdown with origin and canonical linking guidelines', () => {
  const llms = buildLlmsTxt('https://animaku.test')

  assert.ok(llms.startsWith('# Animaku'))
  assert.ok(llms.includes('[番剧目录](https://animaku.test/anime)'))
  assert.ok(llms.includes('[每日放送时间表](https://animaku.test/timeline)'))
  assert.ok(llms.includes('https://animaku.test/subject/{bangumiId}'))
  assert.ok(llms.includes('https://animaku.test/api/bangumi/subjects/{id}'))
})
