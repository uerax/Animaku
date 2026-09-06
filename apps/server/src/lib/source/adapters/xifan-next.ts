import type { PluginRule } from '@animaku/shared'
import {
  searchXifanNext,
  chaptersXifanNext,
  resolveXifanNext,
} from '../../xifan-next'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const XIFAN_NEXT_RULE: PluginRule = {
  name: 'xifan-next',
  version: '1.0.0',
  baseURL: 'https://next.xifanacg.com',
}

export const xifanNextAdapter: SourceAdapter = {
  id: 'xifan-next',
  name: '稀饭Next',
  tier: 'tier_a',
  capabilities: {},
  async search(keyword: string) {
    return searchXifanNext(XIFAN_NEXT_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersXifanNext(XIFAN_NEXT_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveXifanNext(XIFAN_NEXT_RULE, pageUrl)
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
