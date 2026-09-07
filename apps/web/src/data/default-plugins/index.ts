import type { PluginRule } from '@animaku/shared'
import cycani from './cycani.json'
import tvtfun from './tvtfun.json'
import moonci from './moonci.json'
import xifan from './xifan.json'
import xifanNext from './xifan-next.json'
import mxdm from './mxdm.json'
import omofun from './omofun.json'

/**
 * Built-in rules — keep lean & 100% CDN direct-stream (Zero server bandwidth).
 * Sorted by weight descending > alphabetical (external/third-party rules default to weight 0):
 * - xifan-next: 稀饭 next.xifanacg.com — Supabase RPC search + REST chapters + issue-web-playback (weight: 75, preferOriginalTitle: true)
 * - cycani: 次元城 cycani.org — RESTful JSON API + multiple player lines + CF 1080P MP4 (weight: 70, preferOriginalTitle: false)
 * - moonci: 月之祠 moonci.com — MacCMS JSON suggest API + multi-road extraction + 1080P MP4 (weight: 65, preferOriginalTitle: true)
 * - tvtfun: TvTFun tvtfun.net — Next.js RESTful API + multi-line extraction + 1080P BytePlus/Akamai MP4 (weight: 65, preferOriginalTitle: false)
 * - mxdm: MacCMS-style third party (weight: 55)
 * - omofun: 211dm/omofuns — server search adapter (verify gate) + XPath chapters + player_aaaa (weight: 50, preferOriginalTitle: true)
 * - xifan: 稀饭 anime.xifanacg.com — suggest API search + HTML chapters + player_aaaa (weight: 50)
 * Note: anime1 & libvio retired from default built-ins to eliminate full media proxy egress risks.
 */
export const DEFAULT_PLUGIN_RULES: PluginRule[] = [
  xifanNext as PluginRule,
  cycani as PluginRule,
  moonci as PluginRule,
  tvtfun as PluginRule,
  mxdm as PluginRule,
  omofun as PluginRule,
  xifan as PluginRule,
]
