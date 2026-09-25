import type { PluginRule } from '@animaku/shared'
import {
  searchAnimoe,
  chaptersAnimoe,
  resolveAnimoe,
} from '../../animoe'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const ANIMOE_RULE: PluginRule = {
  name: 'animoe',
  version: '1.0.0',
  baseURL: 'https://animoe.org',
}

export const animoeAdapter: SourceAdapter = {
  id: 'animoe',
  name: 'Animoe',
  tier: 'tier_a',
  capabilities: {},
  async search(keyword: string) {
    return searchAnimoe(ANIMOE_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersAnimoe(ANIMOE_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveAnimoe(ANIMOE_RULE, pageUrl)
    const cookie = res.headers?.Cookie || res.headers?.cookie
    return {
      mediaUrl: res.playUrl,
      publicHeaders: res.headers,
      credentials: cookie,
      format: 'hls',
    }
  },
}
