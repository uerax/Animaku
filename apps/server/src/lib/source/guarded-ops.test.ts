import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { PluginRule, PluginSearchResult, PluginChapterResult } from '@animaku/shared'
import {
  resolveBuiltinSourceId,
  resolveUpstreamKey,
} from './resolve-builtin-id'
import {
  guardedOp,
  buildSourceCacheKey,
  clearChaptersCooldown,
} from './guarded-ops'
import { cacheDelete, cacheGet } from '../ttl-cache'
import {
  clearSourceRateLimits,
  checkSourceRateLimit,
  SourceRateLimitError,
} from '../source-rate-limit'

describe('resolveBuiltinSourceId & resolveUpstreamKey', () => {
  it('correctly matches official controlled sources', () => {
    const cycaniRule: PluginRule = { name: 'cycani', version: '1.0.0', baseURL: 'https://cycani.org' }
    assert.equal(resolveBuiltinSourceId(cycaniRule), 'cycani')
    assert.equal(resolveUpstreamKey(cycaniRule), 'cycani')

    const anime1Rule: PluginRule = { name: 'Anime1.me', version: '1.0.0', baseURL: 'https://anime1.me' }
    assert.equal(resolveBuiltinSourceId(anime1Rule), 'anime1')
    assert.equal(resolveUpstreamKey(anime1Rule), 'anime1')

    const soraniRule: PluginRule = { name: '青空次元', version: '1.0.0', baseURL: 'https://sorani.net' }
    assert.equal(resolveBuiltinSourceId(soraniRule), 'sorani')

    const neosekRule: PluginRule = { name: 'neosekai', version: '1.0.0', baseURL: 'https://neosek.ai' }
    assert.equal(resolveBuiltinSourceId(neosekRule), 'neosekai')
  })

  it('safely rejects rules with customized baseURL for animoe/bimi/jzacg', () => {
    // Official bimi domain
    const bimiOfficial: PluginRule = {
      name: 'bimi',
      version: '1.0.0',
      baseURL: 'https://www.bimiacg14.net',
    }
    assert.equal(resolveBuiltinSourceId(bimiOfficial), 'bimi')

    // Rogue / customized mirror bimi domain
    const bimiCustom: PluginRule = {
      name: 'bimi',
      version: '1.0.0',
      baseURL: 'https://my-custom-mirror.example.com',
    }
    assert.equal(resolveBuiltinSourceId(bimiCustom), null)
    // resolveUpstreamKey should extract the custom hostname instead of trusting rule.name
    assert.equal(resolveUpstreamKey(bimiCustom), 'my-custom-mirror.example.com')
  })

  it('extracts upstream host for custom rules and falls back securely', () => {
    const customRule: PluginRule = {
      name: 'MyAnimeSite',
      version: '1.0.0',
      baseURL: 'https://api.myanime.org',
      searchURL: 'https://api.myanime.org/v1/search?q=@keyword',
    }
    assert.equal(resolveBuiltinSourceId(customRule), null)
    assert.equal(resolveUpstreamKey(customRule), 'api.myanime.org')

    const fallbackRule: PluginRule = {
      name: 'Simple Rule',
      version: '1.0.0',
      baseURL: '',
    }
    assert.equal(resolveUpstreamKey(fallbackRule), 'simple_rule')
  })
})

describe('guardedOp unified protection & shared cache', () => {
  const testKey = 'src:cycani:search:test-keyword'

  beforeEach(() => {
    cacheDelete(testKey)
    clearSourceRateLimits()
    clearChaptersCooldown()
  })

  it('shares cache between Web and App while reformatting pluginName correctly', async () => {
    let loaderCallCount = 0
    const mockLoader = async (): Promise<PluginSearchResult> => {
      loaderCallCount++
      return {
        pluginName: 'raw-internal-source',
        items: [{ name: '攻壳机动队', src: 'https://example.com/play/1' }],
      }
    }

    // 1. First call: simulating Web client (/api/plugin/search)
    const webResult = await guardedOp<PluginSearchResult>({
      kind: 'search',
      upstreamKey: 'cycani',
      cacheKey: testKey,
      clientIp: '1.2.3.4',
      loader: mockLoader,
      reformatResult: (r) => ({ ...r, pluginName: 'web-custom-plugin-name' }),
    })

    assert.equal(loaderCallCount, 1)
    assert.equal(webResult.hit, false)
    assert.equal(webResult.data.pluginName, 'web-custom-plugin-name')
    assert.equal(webResult.data.items[0]?.name, '攻壳机动队')

    // 2. Second call: simulating App client (/api/source/search) for same keyword
    const appResult = await guardedOp<PluginSearchResult>({
      kind: 'search',
      upstreamKey: 'cycani',
      cacheKey: testKey,
      clientIp: '5.6.7.8',
      loader: mockLoader,
      reformatResult: (r) => ({ ...r, pluginName: 'cycani' }),
    })

    // Loader must NOT be called again (cache hit)
    assert.equal(loaderCallCount, 1)
    assert.equal(appResult.hit, true)
    assert.equal(appResult.data.pluginName, 'cycani')
    assert.equal(appResult.data.items[0]?.name, '攻壳机动队')
  })

  it('deduplicates concurrent requests via single-flight', async () => {
    let loaderCallCount = 0
    const slowLoader = async (): Promise<PluginSearchResult> => {
      loaderCallCount++
      await new Promise((res) => setTimeout(res, 30))
      return { pluginName: 'cycani', items: [] }
    }

    const [r1, r2] = await Promise.all([
      guardedOp<PluginSearchResult>({
        kind: 'search',
        upstreamKey: 'cycani',
        cacheKey: testKey,
        clientIp: '1.2.3.4',
        loader: slowLoader,
      }),
      guardedOp<PluginSearchResult>({
        kind: 'search',
        upstreamKey: 'cycani',
        cacheKey: testKey,
        clientIp: '1.2.3.4',
        loader: slowLoader,
      }),
    ])

    assert.equal(loaderCallCount, 1)
    assert.ok(r1.data)
    assert.ok(r2.data)
  })

  it('search ignores bypass=true and serves from cache', async () => {
    let count = 0
    const loader = async (): Promise<PluginSearchResult> => {
      count++
      return { pluginName: 'cycani', items: [{ name: 'Test', src: '/1' }] }
    }

    // 1st request populate cache
    await guardedOp({
      kind: 'search',
      upstreamKey: 'cycani',
      cacheKey: testKey,
      clientIp: '1.2.3.4',
      loader,
    })
    assert.equal(count, 1)

    // 2nd request with bypass=true should be ignored for search
    const r2 = await guardedOp({
      kind: 'search',
      upstreamKey: 'cycani',
      cacheKey: testKey,
      clientIp: '1.2.3.4',
      bypass: true,
      loader,
    })
    assert.equal(count, 1)
    assert.equal(r2.hit, true)
  })

  it('chapters limits bypass to once every 30 seconds for the same key', async () => {
    const chapKey = 'src:cycani:chapters:detail-page-a'
    cacheDelete(chapKey)

    let callCount = 0
    const mockChaptersLoader = async (): Promise<PluginChapterResult> => {
      callCount++
      return {
        pluginName: 'cycani',
        roads: [{ name: 'Road 1', identifier: ['1'], data: ['/play/1'] }],
      }
    }

    // 1. Initial request (populate cache)
    await guardedOp({
      kind: 'chapters',
      upstreamKey: 'cycani',
      cacheKey: chapKey,
      clientIp: '1.2.3.4',
      loader: mockChaptersLoader,
    })
    assert.equal(callCount, 1)

    // 2. First refresh (allowed) -> triggers loader
    await guardedOp({
      kind: 'chapters',
      upstreamKey: 'cycani',
      cacheKey: chapKey,
      clientIp: '1.2.3.4',
      bypass: true,
      loader: mockChaptersLoader,
    })
    assert.equal(callCount, 2)

    // 3. Second refresh within 30s -> ignored, returns cache!
    const r3 = await guardedOp({
      kind: 'chapters',
      upstreamKey: 'cycani',
      cacheKey: chapKey,
      clientIp: '1.2.3.4',
      bypass: true,
      loader: mockChaptersLoader,
    })
    assert.equal(callCount, 2)
    assert.equal(r3.hit, true)

    // 4. A different show/key is NOT affected by cooldown
    const otherChapKey = 'src:cycani:chapters:detail-page-b'
    await guardedOp({
      kind: 'chapters',
      upstreamKey: 'cycani',
      cacheKey: otherChapKey,
      clientIp: '1.2.3.4',
      bypass: true,
      loader: mockChaptersLoader,
    })
    assert.equal(callCount, 3)
  })

  it('enforces rate limits on cache misses and does not count cache hits', async () => {
    let callCount = 0
    const testIp = '198.51.100.5'

    // Perform 15 calls to different keys (simulate searching different keywords)
    for (let i = 1; i <= 15; i++) {
      const k = `src:test:search:kw-${i}`
      await guardedOp({
        kind: 'search',
        upstreamKey: 'test_src',
        cacheKey: k,
        clientIp: testIp,
        loader: async () => {
          callCount++
          return { pluginName: 'test', items: [{ name: `Anime ${i}`, src: `/${i}` }] }
        },
      })
    }
    assert.equal(callCount, 15)

    // 16th request to a new key should exceed rate limit (15/min) and throw SourceRateLimitError
    await assert.rejects(
      async () => {
        await guardedOp({
          kind: 'search',
          upstreamKey: 'test_src',
          cacheKey: 'src:test:search:kw-16',
          clientIp: testIp,
          loader: async () => ({ pluginName: 'test', items: [] }),
        })
      },
      (err: unknown) => {
        return err instanceof SourceRateLimitError && err.limit === 15
      },
    )

    // But querying an already cached key (e.g. kw-1) should succeed without 429
    const hitRes = await guardedOp<PluginSearchResult>({
      kind: 'search',
      upstreamKey: 'test_src',
      cacheKey: 'src:test:search:kw-1',
      clientIp: testIp,
      loader: async () => {
        throw new Error('should not call loader')
      },
    })
    assert.equal(hitRes.hit, true)
    assert.equal(hitRes.data.items[0]?.name, 'Anime 1')
  })
})
