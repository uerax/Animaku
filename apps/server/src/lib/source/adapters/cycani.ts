import type { PluginRule } from '@animaku/shared'
import {
  searchCycani,
  chaptersCycani,
  resolveCycani,
} from '../../cycani'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const CYCANI_RULE: PluginRule = {
  name: 'cycani',
  version: '1.0.0',
  baseURL: 'https://www.cycani.org',
}

export const cycaniAdapter: SourceAdapter = {
  id: 'cycani',
  name: '次元城动画',
  tier: 'tier_a',
  capabilities: {
    allowedPorts: [80, 443, 8080, 8443],
  },
  async search(keyword: string) {
    return searchCycani(CYCANI_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersCycani(CYCANI_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveCycani(CYCANI_RULE, pageUrl)
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
