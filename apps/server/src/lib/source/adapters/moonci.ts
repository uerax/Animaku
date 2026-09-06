import type { PluginRule } from '@animaku/shared'
import {
  searchMoonci,
  chaptersMoonci,
  resolveMoonci,
} from '../../moonci'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const MOONCI_RULE: PluginRule = {
  name: 'moonci',
  version: '1.0.0',
  baseURL: 'https://www.moonci.com',
}

export const moonciAdapter: SourceAdapter = {
  id: 'moonci',
  name: '月之祠',
  tier: 'tier_a',
  capabilities: {},
  async search(keyword: string) {
    return searchMoonci(MOONCI_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersMoonci(MOONCI_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveMoonci(MOONCI_RULE, pageUrl)
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
