import test from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns'
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici'
import { searchTvTFun, chaptersTvTFun, resolveTvTFun } from './tvtfun'

const TVTFUN_RULE = {
  name: 'tvtfun',
  version: '2.0.0',
  baseURL: 'https://www.tvtfun.net',
}

test('tvtfun: chapters sanitization and resolve security (no directUrl trust)', async () => {
  const originalDispatcher = getGlobalDispatcher()
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)

  const origDnsLookup = dns.promises.lookup
  // Mock DNS 避免离线沙箱环境抛出 ENOTFOUND
  // @ts-expect-error mock lookup
  dns.promises.lookup = async (hostname: string, opts?: any) => {
    if (hostname.includes('tvtfun.net')) {
      const records = [{ address: '104.21.5.1', family: 4 }]
      return opts?.all ? records : records[0]
    }
    return origDnsLookup(hostname, opts)
  }

  try {
    const tvtPool = mockAgent.get('https://www.tvtfun.net')

    // 1. Mock search API
    tvtPool
      .intercept({ path: /^\/api\/client\/anime\?keyword=/, method: 'GET' })
      .reply(200, {
        code: 0,
        data: [{ id: 'anime-123', name: '鬼灭之刃', slug: 'kimetsu' }],
      })

    // 2. Mock detail/chapters API: 源站故意带了 directUrl 和 requiresResolve: false
    tvtPool
      .intercept({ path: '/api/client/anime/anime-123', method: 'GET' })
      .reply(200, {
        code: 0,
        data: {
          id: 'anime-123',
          name: '鬼灭之刃',
          slug: 'kimetsu',
          seasons: [
            {
              id: 's1',
              episodes: [
                {
                  id: 'ep-999',
                  number: 1,
                  title: '第 1 话',
                  sources: [
                    {
                      id: 'src-1',
                      name: '线路A',
                      playback: {
                        url: 'https://cdn.tvtfun.net/official_stream.mp4',
                        requiresResolve: false,
                        mediaType: 'mp4',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      })

    // 验证 1：选集返回的 URL 彻底不带 url= 或 requiresResolve
    const chaptersResult = await chaptersTvTFun(
      TVTFUN_RULE,
      'https://www.tvtfun.net/anime/anime-123',
      { dispatcher: mockAgent },
    )
    assert.equal(chaptersResult.roads.length, 1)
    const epUrl = chaptersResult.roads[0].data[0]
    assert.ok(epUrl.includes('episodeId=ep-999'))
    assert.ok(epUrl.includes('sourceId=src-1'))
    assert.equal(epUrl.includes('requiresResolve'), false)
    assert.equal(epUrl.includes('official_stream.mp4'), false)

    // 验证 2：即使黑客在调用 resolve 时恶意构造恶意的外部 URL 和 requiresResolve=false
    const spoofedPageUrl = `${epUrl}&requiresResolve=false&url=https://attacker-target.com/huge-malicious-file.iso`
    const resolved = await resolveTvTFun(TVTFUN_RULE, spoofedPageUrl, { dispatcher: mockAgent })

    // 关键安全断言：服务端绝不信任攻击者传入的恶意 URL，而是返回官方受控映射的真实直链！
    assert.equal(resolved.playUrl, 'https://cdn.tvtfun.net/official_stream.mp4')
    assert.equal(resolved.playUrl.includes('attacker-target.com'), false)
  } finally {
    dns.promises.lookup = origDnsLookup
    setGlobalDispatcher(originalDispatcher)
  }
})
