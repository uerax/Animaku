import type { PluginRule } from '@animaku/shared'
import {
  searchJzacg,
  chaptersJzacg,
  resolveJzacg,
  JZACG_BASE_URL,
} from '../../jzacg'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const JZACG_RULE: PluginRule = {
  name: 'jzacg',
  version: '1.0.0',
  weight: 58,
  baseURL: JZACG_BASE_URL,
}

export const jzacgAdapter: SourceAdapter = {
  id: 'jzacg',
  name: '橘子动漫',
  tier: 'tier_a',
  capabilities: {},
  async search(keyword: string) {
    return searchJzacg(JZACG_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersJzacg(JZACG_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveJzacg(JZACG_RULE, pageUrl)
    const isMp4 =
      res.contentType === 'video/mp4' ||
      res.format === 'mp4' ||
      res.playUrl.toLowerCase().includes('.mp4') ||
      res.playUrl.toLowerCase().includes('.mknvideo') ||
      res.playUrl.toLowerCase().includes('/d/')
    const cookie = res.headers?.Cookie || res.headers?.cookie
    return {
      mediaUrl: res.playUrl,
      publicHeaders: res.headers,
      credentials: cookie,
      format: isMp4 ? 'mp4' : 'hls',
    }
  },
}
