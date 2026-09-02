export type DanmakuMode = 'rtl' | 'top' | 'bottom'

export interface DanmakuComment {
  mode: DanmakuMode
  text: string
  time: number
  style?: { color?: string }
  source?: string
  senderHash?: string
}

export interface DanmakuAnime {
  animeId: number
  animeTitle: string
  bangumiId?: string
  episodeCount?: number
  typeDescription?: string
  imageUrl?: string
}

export interface DanmakuEpisode {
  episodeId: number
  episodeTitle: string
}

/**
 * Smart episode matching for Danmaku episodes.
 * 1. Matches numeric episode pattern in episodeTitle (e.g. "第0话", "00 PROLOGUE", "第1话", "01", "Episode 1", "E01").
 * 2. Strict guard against NaN, Infinity, and negative numbers.
 * 3. Falls back to 0-based array index (episode - 1) for episode >= 1, or episodes[0] for episode === 0.
 */
export function matchDanmakuEpisode(
  episodes: DanmakuEpisode[],
  targetEpisode: number,
): DanmakuEpisode | undefined {
  if (!episodes || episodes.length === 0) return undefined
  if (!Number.isFinite(targetEpisode) || targetEpisode < 0) return episodes[0]

  // 1. Try regex pattern match on episodeTitle (supports episode 0, e.g. "第00话", "00", "EP0")
  for (const ep of episodes) {
    const title = (ep.episodeTitle || '').trim()
    // Match "第1集", "第 01 话", "EP01", "E1", " 01 ", "01.", "第00话", "00"
    const m =
      title.match(/(?:第|ep|e)\s*0*(\d+)\s*(?:话|集|期)?/i) ||
      title.match(/^0*(\d+)(?:\s|$|[-_.、:])/i) ||
      title.match(/(?:^|\D)0*(\d+)(?:话|集)(?:\D|$)/i)
    if (m && Number(m[1]) === targetEpisode) {
      return ep
    }
  }

  // 2. Fallback:
  // For targetEpisode === 0: if no "0" found in titles, fallback to first episode
  // For targetEpisode >= 1: fallback to 0-based index (targetEpisode - 1)
  if (targetEpisode === 0) {
    return episodes[0]
  }
  return episodes[targetEpisode - 1] || episodes[0]
}

export interface DanmakuSettings {
  enabled: boolean
  opacity: number
  fontSize: number
  speed: number
  area: number
  showTop: boolean
  showBottom: boolean
  showScroll: boolean
  showColor: boolean
  simplify: boolean
  filters: string[]
}

export const defaultDanmakuSettings: DanmakuSettings = {
  enabled: true,
  opacity: 0.85,
  fontSize: 1,
  speed: 1,
  area: 0.75,
  showTop: true,
  showBottom: false,
  showScroll: true,
  showColor: true,
  simplify: false,
  filters: [],
}

/** Map bilibili / dandan type codes → DanmakuMode */
const MODE_MAP: Record<string, DanmakuMode> = {
  '1': 'rtl',
  '2': 'rtl',
  '3': 'rtl',
  '4': 'bottom',
  '5': 'top',
  '6': 'rtl',
}

/** Parse dandan raw comment p field */
export function parseDanmakuComments(
  comments: { m: string; p: string }[],
): DanmakuComment[] {
  const out: DanmakuComment[] = []
  for (const o of comments) {
    const [time, type, color, senderHash] = o.p.split(',')
    const t = parseFloat(time)
    if (!Number.isFinite(t)) continue
    out.push({
      mode: MODE_MAP[type] || 'rtl',
      text: o.m,
      time: t,
      style: { color: colorToHex(color) },
      source: 'dandan',
      senderHash: senderHash || undefined,
    })
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

/**
 * Parse bilibili / pakku style danmaku XML.
 * Each `<d p="time,mode,fontSize,color,timestamp,pool,senderHash,rowId">text</d>`
 * (same format agefans-enhance `parsePakkuDanmakuXML` expects)
 */
export function parseDanmakuXml(xml: string): DanmakuComment[] {
  const out: DanmakuComment[] = []
  // tolerant: allow attributes order and whitespace
  const re = /<d\s+p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const p = m[1]
    const text = decodeXmlEntities(m[2]).trim()
    if (!text) continue
    const parts = p.split(',')
    const time = parseFloat(parts[0] || '0')
    const type = parts[1] || '1'
    const color = parts[3]
    const senderHash = parts[6] || undefined
    if (!Number.isFinite(time)) continue
    out.push({
      mode: MODE_MAP[type] || 'rtl',
      text,
      time,
      style: { color: colorToHex(color) },
      source: 'bilibili',
      senderHash,
    })
  }
  return out.sort((a, b) => a.time - b.time)
}

/**
 * Fast O(1) deduplication of extra/Bilibili comments against base/Dandan comments.
 * 1. Strong match: senderHash + '_' + normalizedText
 * 2. Time window match: same normalizedText within tolerance window (default 2.5s)
 * Returns the filtered incremental list from extraComments that are NOT in baseComments.
 */
export function deduplicateDanmakuIncremental(
  baseComments: DanmakuComment[],
  extraComments: DanmakuComment[],
  opts?: { windowSeconds?: number }
): {
  incremental: DanmakuComment[]
  duplicatesCount: number
} {
  const windowSec = opts?.windowSeconds ?? 2.5
  const baseStrongFingerprints = new Set<string>()
  const baseTimeBuckets = new Map<string, number[]>()

  for (const c of baseComments) {
    const text = (c.text || '').trim().toLowerCase()
    if (!text) continue
    if (c.senderHash) {
      baseStrongFingerprints.add(`${c.senderHash}_${text}`)
    }
    const times = baseTimeBuckets.get(text) || []
    times.push(c.time)
    baseTimeBuckets.set(text, times)
  }

  const incremental: DanmakuComment[] = []
  let duplicatesCount = 0

  for (const c of extraComments) {
    const text = (c.text || '').trim().toLowerCase()
    if (!text) continue

    // Rule 1: Strong fingerprint (same sender hash + same content)
    if (c.senderHash && baseStrongFingerprints.has(`${c.senderHash}_${text}`)) {
      duplicatesCount++
      continue
    }

    // Rule 2: Time-window content match (same text within windowSec)
    const existingTimes = baseTimeBuckets.get(text)
    if (existingTimes && existingTimes.some((t) => Math.abs(t - c.time) <= windowSec)) {
      duplicatesCount++
      continue
    }

    incremental.push(c)
  }

  return { incremental, duplicatesCount }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&amp;/g, '&')
}

function colorToHex(color: string | undefined): string {
  const n = parseInt(color || '16777215', 10)
  if (Number.isNaN(n)) return '#ffffff'
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`
}

/**
 * Structured target representation for Bilibili video / bangumi input.
 */
export type BilibiliTarget =
  | { type: 'ep'; epId: number; page?: number; raw: string }
  | { type: 'ss'; seasonId: number; page?: number; raw: string }
  | { type: 'md'; mediaId: number; page?: number; raw: string }
  | { type: 'bgm'; bangumiId: number; page?: number; raw: string }
  | { type: 'bv'; bvid: string; page?: number; raw: string }
  | { type: 'av'; aid: number; page?: number; raw: string }
  | { type: 'b23'; url: string; page?: number; raw: string }

/**
 * Parse various formats of Bilibili links and IDs:
 * - Bangumi episode: https://www.bilibili.com/bangumi/play/ep86012, ep86012, ep_id=86012
 * - Bangumi season: https://www.bilibili.com/bangumi/play/ss28277, ss28277, season_id=28277
 * - UGC BV video: https://www.bilibili.com/video/BV1TT4y1g77n, BV1TT4y1g77n
 * - UGC AV video: https://www.bilibili.com/video/av925796497, av925796497, aid=925796497
 * - Short links: https://b23.tv/ep86012, https://b23.tv/BV1xx, https://b23.tv/XyZ123
 * Automatically extracts ?p=N or &p=N pagination.
 */
export function parseBilibiliInput(input: string): BilibiliTarget | null {
  const s = (input || '').trim()
  if (!s) return null

  // 1. Extract optional page index (?p=2, ?page=2, &p=2)
  let page: number | undefined
  const pageMatch = s.match(/[?&](?:p|page)=(\d+)/i)
  if (pageMatch) {
    const p = parseInt(pageMatch[1], 10)
    if (p > 0) page = p
  }

  // 2. Bangumi Episode (e.g. ep86012, /bangumi/play/ep86012, ep_id=86012)
  const epMatch = s.match(/(?:^|\/|[?&]ep_id=|\b)ep(\d+)/i)
  if (epMatch) {
    return {
      type: 'ep',
      epId: parseInt(epMatch[1], 10),
      page,
      raw: s,
    }
  }

  // 3. Bangumi Season (e.g. ss28277, /bangumi/play/ss28277, season_id=28277)
  const ssMatch = s.match(/(?:^|\/|[?&]season_id=|\b)ss(\d+)/i)
  if (ssMatch) {
    return {
      type: 'ss',
      seasonId: parseInt(ssMatch[1], 10),
      page,
      raw: s,
    }
  }

  // 4. Bangumi Media (e.g. md28229015, /bangumi/media/md28229015, media_id=28229015)
  const mdMatch = s.match(/(?:^|\/|[?&]media_id=|\b)md(\d+)/i)
  if (mdMatch) {
    return {
      type: 'md',
      mediaId: parseInt(mdMatch[1], 10),
      page,
      raw: s,
    }
  }

  // 5. Bangumi.tv Subject (e.g. bgm1728, /subject/1728, bgm_id=1728)
  const bgmMatch = s.match(/(?:^|\/|[?&](?:bgm_id|bgm|bangumi_id)=|\b)bgm(\d+)/i) || s.match(/bangumi\.tv\/subject\/(\d+)/i)
  if (bgmMatch) {
    return {
      type: 'bgm',
      bangumiId: parseInt(bgmMatch[1], 10),
      page,
      raw: s,
    }
  }

  // 6. Standard BV (e.g. BV1TT4y1g77n, /video/BV1TT4y1g77n)
  const bvMatch = s.match(/BV[0-9A-Za-z]+/)
  if (bvMatch) {
    return {
      type: 'bv',
      bvid: bvMatch[0],
      page,
      raw: s,
    }
  }

  // 5. Classic AV / AID (e.g. av925796497, /video/av925796497, aid=925796497)
  const avMatch = s.match(/(?:^|\/|[?&]aid=|\b)av(\d+)/i)
  if (avMatch) {
    return {
      type: 'av',
      aid: parseInt(avMatch[1], 10),
      page,
      raw: s,
    }
  }

  // 6. Generic b23.tv short link (e.g. https://b23.tv/AbCdEf or b23.tv/AbCdEf)
  const b23Match = s.match(/(?:https?:\/\/)?(?:www\.)?b23\.tv\/([A-Za-z0-9_-]+)/i)
  if (b23Match) {
    return {
      type: 'b23',
      url: s.startsWith('http') ? s : `https://${s}`,
      page,
      raw: s,
    }
  }

  return null
}

/** Extract BV id from raw input (url or bare BV…) */
export function extractBvid(input: string): string | null {
  const target = parseBilibiliInput(input)
  if (target?.type === 'bv') return target.bvid
  const s = (input || '').trim()
  if (!s) return null
  const m = s.match(/BV[0-9A-Za-z]+/)
  return m ? m[0] : null
}
