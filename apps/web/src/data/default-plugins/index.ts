import type { PluginRule } from '@animaku/shared'
import anime1 from './anime1.json'
import cycani from './cycani.json'
import tvtfun from './tvtfun.json'
import moonci from './moonci.json'
import xifan from './xifan.json'
import xifanNext from './xifan-next.json'
import mxdm from './mxdm.json'
import omofun from './omofun.json'
import libvio from './libvio.json'

/**
 * Built-in rules — keep lean.
 * Sorted by weight descending > alphabetical (external/third-party rules default to weight 0):
 * - xifan-next: 稀饭 next.xifanacg.com — Supabase RPC search + REST chapters + issue-web-playback (weight: 70, preferOriginalTitle: true)
 * - tvtfun: TvTFun tvtfun.net — Next.js RESTful API + multi-line extraction + 1080P BytePlus/Akamai MP4 (weight: 70, preferOriginalTitle: false)
 * - moonci: 月之祠 moonci.com — MacCMS JSON suggest API + multi-road extraction + 1080P MP4 (weight: 70, preferOriginalTitle: true)
 * - cycani: 次元城 cycani.org — RESTful JSON API + multiple player lines + CF 1080P MP4 (weight: 65, preferOriginalTitle: false)
 * - anime1: progressive + cookie adapter (needs MEDIA_FULL_PROXY=1) (weight: 60)
 * - libvio: release-page 类型 (libviogroup.github.io) — XPath search + XPath chapters + player_aaaa (weight: 60, preferOriginalTitle: true)
 * - mxdm: MacCMS-style third party (weight: 55)
 * - omofun: 211dm/omofuns — server search adapter (verify gate) + XPath chapters + player_aaaa (weight: 50, preferOriginalTitle: true)
 * - xifan: 稀饭 anime.xifanacg.com — suggest API search + HTML chapters + player_aaaa (weight: 50)
 * More sources: Settings, catalog / import (7sefun, age, gugu3, otage still folder-only).
 */
export const DEFAULT_PLUGIN_RULES: PluginRule[] = [
  xifanNext as PluginRule,
  tvtfun as PluginRule,
  moonci as PluginRule,
  cycani as PluginRule,
  anime1 as PluginRule,
  libvio as PluginRule,
  mxdm as PluginRule,
  omofun as PluginRule,
  xifan as PluginRule,
]
