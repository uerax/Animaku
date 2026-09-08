import type { PluginRule } from '@animaku/shared'
import cycani from './cycani.json'
import tvtfun from './tvtfun.json'
import moonci from './moonci.json'
import mifun from './mifun.json'
import girigiri from './girigiri.json'
import lzizy from './lzizy.json'
import xifan from './xifan.json'
import xifanNext from './xifan-next.json'
import mxdm from './mxdm.json'
import omofun from './omofun.json'

/**
 * Built-in rules — keep lean & 100% CDN direct-stream (Zero server bandwidth).
 * Sorted by weight descending > alphabetical (external/third-party rules default to weight 0):
 * - xifan-next: 稀饭 next.xifanacg.com — Supabase RPC search + REST chapters + issue-web-playback (weight: 75, titlePreference: original)
 * - cycani: 次元城 cycani.org — RESTful JSON API + multiple player lines + CF 1080P MP4 (weight: 70, titlePreference: chinese, oldAnimePriority: true)
 * - girigiri: girigiri愛動漫 ani.girigirilove.com — MacCMS suggest + encrypt:2 + 1080P CF HLS (weight: 70, titlePreference: chinese, oldAnimePriority: true)
 * - mifun: MiFun ios.mifun.org — MacCMS suggest + data.m3u8.in resolver + 1080P Douyin/Baidu MP4 (weight: 70, titlePreference: chinese_compact)
 * - moonci: 月之祠 moonci.com — MacCMS JSON suggest API + multi-road extraction + 1080P MP4 (weight: 65, titlePreference: original)
 * - tvtfun: TvTFun tvtfun.net — Next.js RESTful API + multi-line extraction + 1080P BytePlus/Akamai MP4 (weight: 65, titlePreference: chinese)
 * - lzizy: 量子资源 lzizy.net / cj.lziapi.com — Apple CMS V10 JSON API + 全品类影视 + 0ms 纯直链 HLS (weight: 60, titlePreference: chinese)
 * - mxdm: MacCMS-style third party (weight: 55)
 * - omofun: 211dm/omofuns — server search adapter (verify gate) + XPath chapters + player_aaaa (weight: 50, titlePreference: original)
 * - xifan: 稀饭 anime.xifanacg.com — suggest API search + HTML chapters + player_aaaa (weight: 50)
 * Note: anime1 & libvio retired from default built-ins to eliminate full media proxy egress risks.
 */
export const DEFAULT_PLUGIN_RULES: PluginRule[] = [
  xifanNext as PluginRule,
  cycani as PluginRule,
  girigiri as PluginRule,
  mifun as PluginRule,
  moonci as PluginRule,
  tvtfun as PluginRule,
  lzizy as PluginRule,
  mxdm as PluginRule,
  omofun as PluginRule,
  xifan as PluginRule,
]
