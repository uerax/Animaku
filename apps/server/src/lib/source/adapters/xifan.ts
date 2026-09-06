import type { PluginRule } from '@animaku/shared'
import {
  searchWithRule,
  chaptersWithRule,
  resolvePlay,
} from '../../../rule-engine'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const XIFAN_RULE: PluginRule = {
  name: 'xifan',
  version: '1.0.0',
  baseURL: 'https://anime.xifanacg.com/',
  searchMode: 'api',
  chapterMode: 'xpath',
  searchApiConfig: {
    request: {
      method: 'GET',
      url: 'https://anime.xifanacg.com/index.php/ajax/suggest',
      query: {
        mid: '1',
        wd: '@keyword',
        limit: '10',
      },
    },
    listPath: '$.list[*]',
    namePath: '$.name',
    sourcePath: '$.id',
    sourceTemplate: '/bangumi/@source.html',
  },
  chapterRoads: "//div[contains(@class,'anthology-list-box')]",
  chapterResult: ".//a[contains(@href,'/watch/')]",
  referer: 'https://anime.xifanacg.com/',
}

export const xifanAdapter: SourceAdapter = {
  id: 'xifan',
  name: '稀饭动漫',
  tier: 'tier_a',
  capabilities: {
    allowedPorts: [80, 443, 8080, 8443],
  },
  async search(keyword: string) {
    return searchWithRule(XIFAN_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersWithRule(XIFAN_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolvePlay(XIFAN_RULE, pageUrl)
    const isMp4 =
      res.contentType === 'video/mp4' ||
      res.playUrl.toLowerCase().includes('.mp4')
    const cookie = res.headers?.Cookie || res.headers?.cookie
    return {
      mediaUrl: res.playUrl,
      publicHeaders: res.headers,
      credentials: cookie,
      format: isMp4 ? 'mp4' : 'hls',
    }
  },
}
