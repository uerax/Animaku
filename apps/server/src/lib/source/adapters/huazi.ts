import type { PluginRule } from '@animaku/shared'
import {
  HUAZI_BASE_URL,
  searchHuazi,
  chaptersHuazi,
  resolveHuazi,
} from '../../huazi'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const HUAZI_RULE: PluginRule = {
  name: 'huazi',
  version: '1.0.0',
  baseURL: HUAZI_BASE_URL,
}

export const huaziAdapter: SourceAdapter = {
  id: 'huazi',
  name: '花子动漫',
  tier: 'tier_a',
  capabilities: {
    allowedPorts: [80, 443],
  },
  async search(keyword: string) {
    return searchHuazi(HUAZI_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersHuazi(HUAZI_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveHuazi(HUAZI_RULE, pageUrl)
    return {
      mediaUrl: res.playUrl,
      publicHeaders: res.headers,
      format: res.format,
    }
  },
}
