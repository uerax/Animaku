import type { PluginRule } from '@animaku/shared'
import {
  searchBimi,
  chaptersBimi,
  resolveBimiPlayUrl,
} from '../../bimi'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const BIMI_RULE: PluginRule = {
  name: 'bimi',
  version: '1.0.0',
  baseURL: 'https://www.bimiacg14.net',
}

export const bimiAdapter: SourceAdapter = {
  id: 'bimi',
  name: '哔咪',
  tier: 'tier_a',
  capabilities: {},
  async search(keyword: string) {
    return searchBimi(BIMI_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersBimi(BIMI_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveBimiPlayUrl(BIMI_RULE, pageUrl)
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
