import type { PluginRule } from '@animaku/shared'
import {
  searchXifanNext,
  chaptersXifanNext,
  resolveXifanNext,
} from '../../xifan-next'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const XIFAN_RULE: PluginRule = {
  name: 'xifan-next',
  version: '1.0.0',
  baseURL: 'https://next.xifanacg.com',
}

export const xifanAdapter: SourceAdapter = {
  id: 'xifan',
  name: '稀饭动漫',
  tier: 'tier_a',
  capabilities: {
    allowedHosts: [
      'next.xifanacg.com',
      'rzmsnqblptbceicadbyd.supabase.co',
      'anime.xifanacg.com',
      's2.xifanacg.com',
      's3.xifanacg.com',
      's4.xifanacg.com',
      'v.xifanacg.com',
      'cdn.xifanacg.com',
      'cdn1.xifanacg.com',
      'play.xifanacg.com',
      'm3u8.xifanacg.com',
      'm3u.xifanacg.com',
      'hls.xifanacg.com',
      'cdn.bfm3u8.com',
    ],
    allowedPorts: [80, 443, 8080, 8443],
  },
  async search(keyword: string) {
    return searchXifanNext(XIFAN_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersXifanNext(XIFAN_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveXifanNext(XIFAN_RULE, pageUrl)
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
