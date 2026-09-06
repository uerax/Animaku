import type { PluginRule } from '@animaku/shared'
import {
  searchTvTFun,
  chaptersTvTFun,
  resolveTvTFun,
} from '../../tvtfun'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const TVTFUN_RULE: PluginRule = {
  name: 'tvtfun',
  version: '1.0.0',
  baseURL: 'https://www.tvtfun.net',
}

export const tvtfunAdapter: SourceAdapter = {
  id: 'tvtfun',
  name: 'TvTFun',
  tier: 'tier_a',
  capabilities: {},
  async search(keyword: string) {
    return searchTvTFun(TVTFUN_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersTvTFun(TVTFUN_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveTvTFun(TVTFUN_RULE, pageUrl)
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
