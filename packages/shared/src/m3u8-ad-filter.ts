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
    const m = uri.match(/^(https?:\/\/[^/?#]+)([^?#]*)/i)
    if (!m) return { origin: '', dir: '' }
    const origin = m[1]!.toLowerCase()
    const path = m[2] || '/'
    const dir = path.includes('/')
      ? path.slice(0, path.lastIndexOf('/') + 1)
      : '/'
    return { origin, dir }
  } catch {
    return { origin: '', dir: '' }
  }
}

/** Normalize URI for signature comparison by stripping query parameters and replacing numeric/hash patterns in filenames. */

/**
 * 提取切片 URL 中的连续数字序号（支持 1~10 位数字，兼容 hash 与数字直连命名如 b2dd7ad0c56000000.ts）。
 */
export function extractSegmentSequence(uri: string): number | null {
  try {
    const clean = uri.replace(/[?#].*$/, "")
    const lastSlash = clean.lastIndexOf("/")
    const filename = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean
    if (!filename.toLowerCase().endsWith(".ts")) return null
    const base = filename.slice(0, -3)
    const m = base.match(/(\d+)$/)
    return m ? parseInt(m[1]!, 10) : null
  } catch {
    return null
  }
}

export function normalizeUriForSignature(uri: string): string {
  try {
    // Strip query strings and hash anchors
    const clean = uri.replace(/[?#].*$/, '')
    const lastSlashIndex = clean.lastIndexOf('/')
    if (lastSlashIndex === -1) return clean

    const dir = clean.slice(0, lastSlashIndex + 1)
    const filename = clean.slice(lastSlashIndex + 1)

    // Normalize numbers and hex hashes (e.g. ad_102.ts -> ad_*.ts, a1b2c3d4.ts -> *.ts)
    const normalizedFile = filename
      .replace(/\d+/g, '*')
      .replace(/[a-f0-9]{16,}/gi, '*')

    return `${dir}${normalizedFile}`
  } catch {
    return uri
  }
}

/**
 * Filter ad segments using a multi-dimensional scoring model.
 * Evaluates location (origin + full dir), URI pattern signatures, key changes, and duration anomalies.
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

  // 1. Calculate total duration and key usage per (origin + dir)
  const locDuration = new Map<string, number>()
  const keyDuration = new Map<string, number>()

  for (const seg of segments) {
    const { origin, dir } = parseOriginAndDir(seg.uri)
    const locKey = `${origin}${dir}`
    locDuration.set(locKey, (locDuration.get(locKey) || 0) + seg.duration)

    const keyLine = seg.keyLine || "NONE"
    keyDuration.set(keyLine, (keyDuration.get(keyLine) || 0) + seg.duration)
  }

  let mainLoc = ""
  let maxLocDur = 0
  for (const [loc, dur] of locDuration) {
    if (dur > maxLocDur) {
      maxLocDur = dur
      mainLoc = loc
    }
  }

  let mainKeyLine = "NONE"
  let maxKeyDur = 0
  for (const [kLine, dur] of keyDuration) {
    if (dur > maxKeyDur) {
      maxKeyDur = dur
      mainKeyLine = kLine
    }
  }

  const mainLocSegments = segments.filter((s) => {
    const { origin, dir } = parseOriginAndDir(s.uri)
    return `${origin}${dir}` === mainLoc
  })
  const mainAvgDuration =
    mainLocSegments.length > 0
      ? mainLocSegments.reduce((s, seg) => s + seg.duration, 0) /
        mainLocSegments.length
      : 0

  const totalDuration = segments.reduce((s, seg) => s + seg.duration, 0)

  // 2. Track group normalized signatures for repetition detection
  const groupSignatures = new Map<number, { sig: string; duration: number }>()
  const sigCounts = new Map<string, number>()
  const sigDurations = new Map<string, number>()

  for (const [groupId, segs] of groups) {
    const groupDuration = segs.reduce((sum, s) => sum + s.duration, 0)
    const sig = segs
      .map((s) => normalizeUriForSignature(s.uri))
      .sort()
      .join("|")
    groupSignatures.set(groupId, { sig, duration: groupDuration })

    sigCounts.set(sig, (sigCounts.get(sig) || 0) + 1)
    sigDurations.set(sig, (sigDurations.get(sig) || 0) + groupDuration)
  }

  let mainSig = ""
  let maxSigDur = 0
  for (const [sig, dur] of sigDurations) {
    if (dur > maxSigDur) {
      maxSigDur = dur
      mainSig = sig
    }
  }

  // 3. Analyze group segment count distribution
  const segCountFreq = new Map<number, number>()
  for (const [, segs] of groups) {
    segCountFreq.set(segs.length, (segCountFreq.get(segs.length) || 0) + 1)
  }

  let dominantSegCount = 5
  let maxFreq = 0
  for (const [count, freq] of segCountFreq) {
    if (freq > maxFreq) {
      maxFreq = freq
      dominantSegCount = count
    }
  }

  // 4. TS 序号连续性与断层元数据分析 (TS Sequence Break Detection)
  const sortedGroupIds = Array.from(groups.keys()).sort((a, b) => a - b)
  const groupSeqMeta = new Map<
    number,
    { minSeq: number | null; maxSeq: number | null }
  >()

  for (const [groupId, segs] of groups) {
    const seqs = segs
      .map((s) => extractSegmentSequence(s.uri))
      .filter((n): n is number => n !== null)
    if (seqs.length > 0) {
      groupSeqMeta.set(groupId, {
        minSeq: Math.min(...seqs),
        maxSeq: Math.max(...seqs),
      })
    } else {
      groupSeqMeta.set(groupId, { minSeq: null, maxSeq: null })
    }
  }

  // 跨组桥接断层全局扫描 (Multi-span Bypass Continuity Scanning)
  // 当正片序列被 1~3 组连续广告切断，但后置正片首部与前置正片尾部严丝合缝闭合时，整体锁定中间插播组
  const bypassAdGroupIds = new Set<number>()

  for (let pIdx = 0; pIdx < sortedGroupIds.length - 1; pIdx++) {
    const pMeta = groupSeqMeta.get(sortedGroupIds[pIdx]!)
    if (pMeta?.maxSeq == null || pMeta?.minSeq == null) continue

    for (let span = 2; span <= 4; span++) {
      const nIdx = pIdx + span
      if (nIdx >= sortedGroupIds.length) break
      const nMeta = groupSeqMeta.get(sortedGroupIds[nIdx]!)
      if (nMeta?.minSeq == null) continue

      if (nMeta.minSeq === pMeta.maxSeq + 1) {
        let allMidAnomalous = true
        let midTotalDuration = 0
        for (let m = pIdx + 1; m < nIdx; m++) {
          const midGroupId = sortedGroupIds[m]!
          const midSegs = groups.get(midGroupId)!
          midTotalDuration += midSegs.reduce((sum, s) => sum + s.duration, 0)
          const mMeta = groupSeqMeta.get(midGroupId)!
          if (
            mMeta.minSeq === null ||
            (mMeta.minSeq <= nMeta.minSeq && mMeta.maxSeq! >= pMeta.maxSeq)
          ) {
            allMidAnomalous = false
            break
          }
        }
        if (allMidAnomalous && midTotalDuration <= 90) {
          for (let m = pIdx + 1; m < nIdx; m++) {
            bypassAdGroupIds.add(sortedGroupIds[m]!)
          }
        }
      }
    }
  }

  // 5. Score each group using the enhanced multi-dimensional feature model
  const adGroups = new Set<number>()

  for (let idx = 0; idx < sortedGroupIds.length; idx++) {
    const groupId = sortedGroupIds[idx]!
    const segs = groups.get(groupId)!
    const groupDuration = segs.reduce((sum, s) => sum + s.duration, 0)
    const { sig } = groupSignatures.get(groupId)!
    const currMeta = groupSeqMeta.get(groupId)!
    const prevMeta = idx > 0 ? groupSeqMeta.get(sortedGroupIds[idx - 1]!) : undefined
    const nextMeta =
      idx < sortedGroupIds.length - 1
        ? groupSeqMeta.get(sortedGroupIds[idx + 1]!)
        : undefined

    let hasMainLoc = false
    let hasMainKey = false
    let groupTotalSegDuration = 0

    for (const s of segs) {
      const { origin, dir } = parseOriginAndDir(s.uri)
      if (`${origin}${dir}` === mainLoc) {
        hasMainLoc = true
      }
      if ((s.keyLine || "NONE") === mainKeyLine) {
        hasMainKey = true
      }
      groupTotalSegDuration += s.duration
    }

    const groupAvgDuration =
      segs.length > 0 ? groupTotalSegDuration / segs.length : 0

    // Feature Calculations
    const isDiffLoc = !hasMainLoc
    const isRepeatedSig =
      sig !== mainSig &&
      (sigCounts.get(sig) || 0) > 1 &&
      (sigDurations.get(sig) || 0) < 120

    const isKeyMismatch = !hasMainKey && mainKeyLine !== "NONE"
    const isDurationAnomaly =
      mainAvgDuration > 0 &&
      Math.abs(groupAvgDuration - mainAvgDuration) / mainAvgDuration > 0.4

    // 连续性判定：若与前一组或后一组序号首尾严格相接，为正片正常分段
    const isSeqContinuousWithNeighbor =
      (prevMeta?.maxSeq != null &&
        currMeta.minSeq != null &&
        currMeta.minSeq === prevMeta.maxSeq + 1) ||
      (nextMeta?.minSeq != null &&
        currMeta.maxSeq != null &&
        nextMeta.minSeq === currMeta.maxSeq + 1)

    // 1. 桥接断层命中
    const isBypassBreak = bypassAdGroupIds.has(groupId)

    // 2. 首尾与中途跳跃断层检测 (Jump Break Detection: Head, Middle & Tail)
    let isJumpBreak = false
    if (!isSeqContinuousWithNeighbor && currMeta.minSeq != null && groupDuration <= 60) {
      if (prevMeta?.maxSeq != null && nextMeta?.minSeq != null) {
        isJumpBreak =
          Math.abs(currMeta.minSeq - prevMeta.maxSeq) > 50 &&
          Math.abs(nextMeta.minSeq - currMeta.maxSeq!) > 50
      } else if (idx === 0 && nextMeta?.minSeq != null) {
        isJumpBreak =
          (nextMeta.minSeq === 0 || nextMeta.minSeq === 1) &&
          currMeta.minSeq > 50
      } else if (idx === sortedGroupIds.length - 1 && prevMeta?.maxSeq != null) {
        isJumpBreak = Math.abs(currMeta.minSeq - prevMeta.maxSeq) > 50
      }
    }

    // 切片数异常仅在未被序号连续性保护时生效
    const isSegCountAnomaly =
      !isSeqContinuousWithNeighbor &&
      segs.length < dominantSegCount &&
      (segCountFreq.get(segs.length) || 0) <=
        Math.max(2, Math.floor(groups.size * 0.05))

    let score = 0

    // 断层高权重识别
    if (isBypassBreak) score += 60
    else if (isJumpBreak) score += 60

    if (isDiffLoc && groupDuration <= 90) score += 45
    if (isRepeatedSig && groupDuration <= 90) score += 45
    if (isKeyMismatch && groupDuration <= 90) score += 30
    if (isDurationAnomaly && groupDuration <= 90) score += 20
    if (isSegCountAnomaly && groupDuration <= 90) score += 40

    if (groupDuration <= 60) score += 25
    else if (groupDuration <= 90) score += 15
    else if (groupDuration > 240) score -= 50

    // 正片序号连续免死金牌
    if (isSeqContinuousWithNeighbor && !isBypassBreak && !isDiffLoc) {
      score = 0
    }

    if (score >= 60) {
      adGroups.add(groupId)
    }
  }

  if (adGroups.size === 0) return segments

  // Safeguard: abort if removing > 8% (2/25) of total duration
  let removedDuration = 0
  for (const gid of adGroups) {
    removedDuration += groups
      .get(gid)!
      .reduce((sum, s) => sum + s.duration, 0)
  }
  if (removedDuration / totalDuration > 2 / 25) return segments

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
