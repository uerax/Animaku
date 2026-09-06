import type { PluginRule } from '@animaku/shared'
import {
  searchAnime1,
  chaptersAnime1,
  resolveAnime1,
} from '../../anime1'
import type { SourceAdapter, RawResolveResult } from '../source-types'

const ANIME1_RULE: PluginRule = {
  name: 'anime1',
  version: '1.0.0',
  baseURL: 'https://anime1.me',
}

export const anime1Adapter: SourceAdapter = {
  id: 'anime1',
  name: 'Anime1',
  tier: 'tier_b',
  capabilities: {
    allowedHosts: [
      'anime1.me',
      'v.anime1.me',
      'v2.anime1.me',
      'v3.anime1.me',
      'v4.anime1.me',
      'v5.anime1.me',
      'v6.anime1.me',
      'v7.anime1.me',
      'v8.anime1.me',
      'v9.anime1.me',
    ],
    allowedPorts: [80, 443, 8080, 8443],
  },
  async search(keyword: string) {
    return searchAnime1(ANIME1_RULE, keyword)
  },
  async chapters(source: string) {
    return chaptersAnime1(ANIME1_RULE, source)
  },
  async resolve(pageUrl: string): Promise<RawResolveResult> {
    const res = await resolveAnime1(ANIME1_RULE, pageUrl)
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
