import type { PluginRule } from '@animaku/shared'
import cycani from './cycani.json'
import tvtfun from './tvtfun.json'
import animoe from './animoe.json'
import akianime from './akianime.json'
import huazi from './huazi.json'
import jzacg from './jzacg.json'
import moonci from './moonci.json'
import mifun from './mifun.json'
import girigiri from './girigiri.json'
import lzizy from './lzizy.json'
import xifanNext from './xifan-next.json'
import bimi from './bimi.json'
import anime1 from './anime1.json'
import neosek from './neosek.json'
import sorani from './sorani.json'
import mxdm from './mxdm.json'
import omofun from './omofun.json'

/**
 * Built-in rules — keep lean & 100% CDN direct-stream (Zero server bandwidth).
 * Sorted by weight descending > alphabetical (external/third-party rules default to weight 0):
 * - xifan-next: 稀饭 next.xifanacg.com — Supabase RPC search + REST chapters + issue-web-playback (weight: 61, titlePreference: original)
 * - bimi: 哔咪动漫 bimiacg14.net — MacCMS suggest API + 多线路解析 + TikTok/快手 CDN 1080P MP4 (weight: 61, titlePreference: chinese)
 * - moonci: 月之祠 moonci.com — MacCMS JSON suggest API + multi-road extraction + 1080P MP4 (weight: 65, titlePreference: chinese)
 * - sorani: 青空次元 sorani.net — RESTful JSON API + 1080P HLS (weight: 65, titlePreference: chinese, platforms: ['app'])
 * - cycani: 次元城 cycani.org — RESTful JSON API + multiple player lines + CF 1080P MP4 (weight: 61, titlePreference: chinese, oldAnimePriority: true)
 * - mifun: MiFun ios.mifun.org — MacCMS suggest + data.m3u8.in resolver + 1080P Douyin/Baidu MP4 (weight: 61, titlePreference: chinese_compact)
 * - anime1: Anime1 anime1.me — 繁体源 + 动态 Cookie 鉴权 MP4 直链 (weight: 60, titlePreference: traditional, platforms: ['app'])
 * - neosek: neosek neosek.ai — RESTful JSON API + &content_type=anime + 香港 CDN fMP4 HLS (weight: 60, titlePreference: chinese)
 * - girigiri: girigiri愛動漫 ani.girigirilove.com — MacCMS suggest + encrypt:2 + 1080P CF HLS (weight: 59, titlePreference: chinese)
 * - lzizy: 量子资源 lzizy.net / cj.lziapi.com — Apple CMS V10 JSON API + 全品类影视 + 0ms 纯直链 HLS (weight: 59, titlePreference: chinese)
 * - animoe: Animoe animoe.org — MacCMS suggest API + 多线路字幕组 + 网易云 CDN fMP4 HLS (weight: 58, titlePreference: chinese)
 * - akianime: AkiAnime akianime.cc — MacCMS search + 多线路 + 移动云 1080P MP4 签名直链 (weight: 58, titlePreference: chinese)
 * - huazi: 花子动漫 huazidm.com — RESTful JSON API + 多线路解析 + 1080P MP4/HLS (weight: 58, titlePreference: chinese)
 * - jzacg: 橘子动漫 mgnacg.com — MacCMS suggest API + 多线路播放 + 1080P HLS (weight: 58, titlePreference: chinese)
 * - mxdm: MacCMS-style third party (weight: 55)
 * - tvtfun: TvTFun tvtfun.net — Next.js RESTful API + 线路D优先 + 1080P BytePlus/Akamai MP4 (weight: 51, titlePreference: chinese)
 * - omofun: 211dm/omofuns — server search adapter (verify gate) + XPath chapters + player_aaaa (weight: 50, titlePreference: original)
 * Note: legacy xifan retired (superseded by xifan-next); libvio retired from default built-ins to eliminate full media proxy egress risks.
 */
export const ALL_BUILTIN_PLUGIN_RULES: PluginRule[] = [
  xifanNext as PluginRule,
  bimi as PluginRule,
  moonci as PluginRule,
  sorani as PluginRule,
  cycani as PluginRule,
  mifun as PluginRule,
  anime1 as PluginRule,
  neosek as PluginRule,
  girigiri as PluginRule,
  lzizy as PluginRule,
  animoe as PluginRule,
  akianime as PluginRule,
  huazi as PluginRule,
  jzacg as PluginRule,
  mxdm as PluginRule,
  tvtfun as PluginRule,
  omofun as PluginRule,
]

/**
 * Web 端生效的默认规则：自动过滤仅供 App 原生端消费的源（如 platforms: ['app']）
 */
export const DEFAULT_PLUGIN_RULES: PluginRule[] = ALL_BUILTIN_PLUGIN_RULES.filter(
  (r) => !r.platforms || r.platforms.includes('web'),
)
