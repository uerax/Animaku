/**
 * HLS discontinuity-based ad filter ( FFmpeg hls_ad_filter style).
 * Groups segments by #EXT-X-DISCONTINUITY; drops short non-main groups.
 */

export interface M3u8Segment {
  duration: number
  uri: string
  discontinuityGroup: number
  /** Raw #EXT-X-KEY line for this segment, if any (METHOD=NONE omitted) */
  keyLine?: string
}

export interface M3u8MediaPlaylist {
  segments: M3u8Segment[]
  targetDuration: number
  isVod: boolean
  /** Non-segment header lines we should preserve when rebuilding (best-effort) */
  headerLines: string[]
}

export type M3u8PlaylistKind = 'master' | 'media' | 'unknown'

export function detectM3u8Kind(content: string): M3u8PlaylistKind {
  if (/#EXT-X-STREAM-INF/i.test(content)) return 'master'
  if (/#EXTINF:/i.test(content) || /#EXT-X-TARGETDURATION/i.test(content)) {
    return 'media'
  }
  if (/#EXTM3U/i.test(content)) return 'media'
  return 'unknown'
}

/** Resolve relative URI without DOM `URL` (shared package is ES-only). */
export function resolveM3u8Url(baseUrl: string, relativeUrl: string): string {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl
  const base = baseUrl.trim()
  if (!base) return relativeUrl
  try {
    // protocol-relative
    if (relativeUrl.startsWith('//')) {
      const proto = base.match(/^(https?:)/i)?.[1] || 'https:'
      return `${proto}${relativeUrl}`
    }
    const m = base.match(/^(https?:\/\/[^/?#]+)/i)
    if (!m) return relativeUrl
    const origin = m[1]!
    if (relativeUrl.startsWith('/')) return `${origin}${relativeUrl}`
    const pathBase = base.replace(/[?#].*$/, '')
    const dir = pathBase.includes('/')
      ? pathBase.slice(0, pathBase.lastIndexOf('/') + 1)
      : `${origin}/`
    // collapse ./ and simple ../
    const joined = `${dir}${relativeUrl}`
    const parts: string[] = []
    const schemeHost = joined.match(/^(https?:\/\/[^/]+)(\/.*)?$/i)
    if (!schemeHost) return relativeUrl
    const path = schemeHost[2] || '/'
    for (const seg of path.split('/')) {
      if (!seg || seg === '.') continue
      if (seg === '..') parts.pop()
      else parts.push(seg)
    }
    return `${schemeHost[1]}/${parts.join('/')}`
  } catch {
    return relativeUrl
  }
}

export function parseMediaPlaylist(
  content: string,
  baseUrl: string,
): M3u8MediaPlaylist {
  const lines = content.split(/\r?\n/)
  const segments: M3u8Segment[] = []
  const headerLines: string[] = []
  let targetDuration = 0
  let hasEndList = false
  let isExplicitVod = false
  let isLiveEvent = false
  let currentDiscontinuityGroup = 0
  let currentKeyLine: string | undefined
  let currentDuration = 0
  let seenSegment = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      const n = Number(line.slice('#EXT-X-TARGETDURATION:'.length))
      if (Number.isFinite(n)) targetDuration = n
      if (!seenSegment) headerLines.push(raw)
      continue
    }
    if (line === '#EXT-X-ENDLIST') {
      hasEndList = true
      continue
    }
    if (line === '#EXT-X-PLAYLIST-TYPE:VOD') {
      isExplicitVod = true
      if (!seenSegment) headerLines.push(raw)
      continue
    }
    if (line === '#EXT-X-PLAYLIST-TYPE:EVENT') {
      isLiveEvent = true
      if (!seenSegment) headerLines.push(raw)
      continue
    }
    if (line === '#EXT-X-DISCONTINUITY') {
      currentDiscontinuityGroup++
      continue
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      if (/METHOD=NONE/i.test(line)) {
        currentKeyLine = undefined
      } else {
        // Absolute-ize KEY URI for proxy rewrite later
        currentKeyLine = line.replace(
          /URI=(["'])([^"']+)\1/i,
          (_m, q: string, u: string) => {
            try {
              return `URI=${q}${resolveM3u8Url(baseUrl, u)}${q}`
            } catch {
              return `URI=${q}${u}${q}`
            }
          },
        )
      }
      continue
    }
    if (line.startsWith('#EXTINF:')) {
      const durationStr = line.slice('#EXTINF:'.length).split(',')[0] ?? '0'
      currentDuration = Number(durationStr) || 0
      continue
    }
    if (line.startsWith('#')) {
      // Keep other headers before first segment (VERSION, MEDIA-SEQUENCE, MAP, …)
      if (!seenSegment && !line.startsWith('#EXTINF')) {
        headerLines.push(raw)
      }
      continue
    }

    // URI line
    seenSegment = true
    segments.push({
      duration: currentDuration,
      uri: resolveM3u8Url(baseUrl, line),
      discontinuityGroup: currentDiscontinuityGroup,
      keyLine: currentKeyLine,
    })
    currentDuration = 0
  }

  const isVod =
    hasEndList || isExplicitVod || (!isLiveEvent && segments.length > 0)

  return { segments, targetDuration, isVod, headerLines }
}

function parseOriginAndDir(uri: string): { origin: string; dir: string } {
  try {
    const m = uri.match(/^(https?:\/\/[^/?#]+)(\/[^?#]*\/)?/i)
    if (!m) return { origin: '', dir: '' }
    return { origin: m[1]!.toLowerCase(), dir: m[2] || '/' }
  } catch {
    return { origin: '', dir: '' }
  }
}

/**
 * Filter ad segments using location (origin + directory) and repetition signals.
 *
 * Real-world observations:
 * - Type A (e.g. omofun): Ads reside on a different CDN host or directory path from content.
 *   → Group(s) with origin/dir differing from the main content stream (< 120s) are dropped.
 * - Type B (e.g. MXdm): Transcoding produces dozens of discontinuity groups, but ALL segments
 *   share the exact same origin and directory path.
 *   → Whole stream is preserved intact (0% false positives).
 * - Repeated ads: Identical short segment sequences inserted across multiple groups (e.g. G1 & G3).
 *   → Flagged and dropped.
 */
export function filterAds(segments: M3u8Segment[]): M3u8Segment[] {
  if (segments.length === 0) return segments

  const groups = new Map<number, M3u8Segment[]>()
  for (const seg of segments) {
    const list = groups.get(seg.discontinuityGroup) || []
    list.push(seg)
    groups.set(seg.discontinuityGroup, list)
  }

  if (groups.size <= 1) return segments

  // Calculate total duration per (origin + dir)
  const locDuration = new Map<string, number>()
  for (const seg of segments) {
    const { origin, dir } = parseOriginAndDir(seg.uri)
    const key = `${origin}${dir}`
    locDuration.set(key, (locDuration.get(key) || 0) + seg.duration)
  }

  // Determine main stream location (origin + dir with max duration)
  let mainLoc = ''
  let maxLocDur = 0
  for (const [loc, dur] of locDuration) {
    if (dur > maxLocDur) {
      maxLocDur = dur
      mainLoc = loc
    }
  }

  const totalDuration = segments.reduce((s, seg) => s + seg.duration, 0)
  const adGroups = new Set<number>()

  // Track group signatures for repetition detection
  const groupSignatures = new Map<number, { sig: string; duration: number }>()

  for (const [groupId, segs] of groups) {
    const groupDuration = segs.reduce((sum, s) => sum + s.duration, 0)
    const sig = segs.map((s) => s.uri).sort().join('|')
    groupSignatures.set(groupId, { sig, duration: groupDuration })

    let hasMainLoc = false
    for (const s of segs) {
      const { origin, dir } = parseOriginAndDir(s.uri)
      if (`${origin}${dir}` === mainLoc) {
        hasMainLoc = true
        break
      }
    }

    // Rule 1: Group is outside main origin/dir and duration < 120s
    if (!hasMainLoc && groupDuration < 120) {
      adGroups.add(groupId)
    }
  }

  // Rule 2: Repeated short groups (e.g. same pre-roll / mid-roll ad template)
  const sigCounts = new Map<string, number>()
  for (const [, { sig, duration }] of groupSignatures) {
    if (duration < 120) {
      sigCounts.set(sig, (sigCounts.get(sig) || 0) + 1)
    }
  }
  for (const [gid, { sig, duration }] of groupSignatures) {
    if (duration < 120 && (sigCounts.get(sig) || 0) > 1) {
      adGroups.add(gid)
    }
  }

  if (adGroups.size === 0) return segments

  // Safeguard: abort if removing > 35% of total duration
  let removedDuration = 0
  for (const gid of adGroups) {
    removedDuration += groups
      .get(gid)!
      .reduce((sum, s) => sum + s.duration, 0)
  }
  if (removedDuration / totalDuration > 0.35) return segments

  const filtered = segments.filter((s) => !adGroups.has(s.discontinuityGroup))
  return filtered.length === 0 ? segments : filtered
}

export function calculateTargetDuration(segments: M3u8Segment[]): number {
  let max = 0
  for (const s of segments) {
    if (s.duration > max) max = s.duration
  }
  return max
}

/** Rebuild media playlist; URIs left absolute (proxy layer rewrites them). */
export function buildMediaPlaylist(
  segments: M3u8Segment[],
  opts?: { targetDuration?: number; headerLines?: string[] },
): string {
  const target =
    opts?.targetDuration != null && opts.targetDuration > 0
      ? Math.ceil(opts.targetDuration)
      : Math.max(1, Math.ceil(calculateTargetDuration(segments)))

  const out: string[] = ['#EXTM3U']
  const headers = opts?.headerLines || []
  let hasVersion = false
  let hasTarget = false
  let hasSeq = false
  for (const h of headers) {
    const t = h.trim()
    if (t === '#EXTM3U') continue
    if (t.startsWith('#EXT-X-TARGETDURATION')) {
      hasTarget = true
      out.push(`#EXT-X-TARGETDURATION:${target}`)
      continue
    }
    if (t.startsWith('#EXT-X-VERSION')) hasVersion = true
    if (t.startsWith('#EXT-X-MEDIA-SEQUENCE')) hasSeq = true
    // Skip ENDLIST / DISCONTINUITY / KEY / EXTINF — rebuilt below
    if (
      t === '#EXT-X-ENDLIST' ||
      t === '#EXT-X-DISCONTINUITY' ||
      t.startsWith('#EXT-X-KEY:') ||
      t.startsWith('#EXTINF:')
    ) {
      continue
    }
    out.push(h)
  }
  if (!hasVersion) out.push('#EXT-X-VERSION:3')
  if (!hasTarget) out.push(`#EXT-X-TARGETDURATION:${target}`)
  if (!hasSeq) out.push('#EXT-X-MEDIA-SEQUENCE:0')

  let lastGroup = segments[0]?.discontinuityGroup ?? 0
  let lastKey: string | undefined

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (i > 0 && seg.discontinuityGroup !== lastGroup) {
      out.push('#EXT-X-DISCONTINUITY')
      lastGroup = seg.discontinuityGroup
    }
    if (seg.keyLine !== lastKey) {
      if (!seg.keyLine) {
        if (lastKey) out.push('#EXT-X-KEY:METHOD=NONE')
      } else {
        out.push(seg.keyLine)
      }
      lastKey = seg.keyLine
    }
    out.push(`#EXTINF:${seg.duration.toFixed(6)},`)
    out.push(seg.uri)
  }
  out.push('#EXT-X-ENDLIST')
  return out.join('\n') + '\n'
}

/**
 * If content is a VOD media playlist with multiple discontinuity groups,
 * drop ad-like groups. Master / live / single-group: return original.
 */
export function filterM3u8AdsIfApplicable(
  content: string,
  baseUrl: string,
): { content: string; filtered: boolean; removed: number } {
  const kind = detectM3u8Kind(content)
  if (kind !== 'media') {
    return { content, filtered: false, removed: 0 }
  }
  const playlist = parseMediaPlaylist(content, baseUrl)
  if (!playlist.isVod || playlist.segments.length === 0) {
    return { content, filtered: false, removed: 0 }
  }
  const before = playlist.segments.length
  const filteredSegs = filterAds(playlist.segments)
  const removed = before - filteredSegs.length
  if (removed <= 0 || filteredSegs.length === 0) {
    return { content, filtered: false, removed: 0 }
  }
  const next = buildMediaPlaylist(filteredSegs, {
    targetDuration: calculateTargetDuration(filteredSegs),
    headerLines: playlist.headerLines,
  })
  return { content: next, filtered: true, removed }
}
