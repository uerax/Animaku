import type { PluginRule } from '@animaku/shared'
import {
  searchAkianime,
  chaptersAkianime,
  resolveAkianime,
} from '../../akianime'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const AKIANIME_RULE: PluginRule = {
  name: 'akianime',
  version: '1.0.0',
  baseURL: 'https://www.akianime.cc',
}

export const akianimeAdapter: SourceAdapter = {
  id: 'akianime',
  name: 'AkiAnime',
  tier: 'tier_a',
  capabilities: {
    allowedPorts: [80, 443],
  },
  async search(keyword: string) {
    return searchAkianime(AKIANIME_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersAkianime(AKIANIME_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveAkianime(AKIANIME_RULE, pageUrl)
    const isMp4 =
      res.format === 'mp4' ||
      res.contentType === 'video/mp4' ||
      res.playUrl.toLowerCase().includes('.mp4') ||
      res.playUrl.toLowerCase().includes('cmecloud.cn')
    const cookie = res.headers?.Cookie || res.headers?.cookie
    return {
      mediaUrl: res.playUrl,
      publicHeaders: res.headers,
      credentials: cookie,
      format: isMp4 ? 'mp4' : 'hls',
      subtitle: res.subtitle,
    }
  },
}
