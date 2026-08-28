/**
 * Authoritative Bangumi Positional Episode Alignment & PlayableSlot Engine
 *
 * Maps video source episode arrays directly to official Bangumi episode numbers (`sort`),
 * completely bypassing ambiguous regex number guessing for title names like "第十天恶魔", "86", "100万".
 */

export interface FilteredSourceItem {
  originalIndex: number
  title: string
}

export interface AlignedEpisode {
  sourceIndex: number
  episode: number
}

export interface BgmEpisodeLike {
  type: number
  sort: number
  name?: string
  nameCn?: string
  name_cn?: string
}

/**
 * Unified Canonical Playable Episode Slot (Single Source of Truth)
 * Combines authoritative Bangumi metadata with the physical source stream url.
 */
export interface PlayableSlot {
  /** Canonical episode number (0, 1, 2, ...), governed by Bangumi `type===0 sort` (Layer 1) or safe conservative extraction (Layer 2) */
  canonicalEp: number
  /** Official episode subtitle from Bangumi (e.g. "冬之日", "序章"), empty string in Layer 2 */
  officialTitle: string
  /** Standard display title (e.g. "第01话 冬之日", "第00话 序章", or raw source title in Layer 2) */
  displayTitle: string
  /** Physical 0-based array index in `road.data` */
  sourceIndex: number
  /** Real video playback page URL from source */
  pageUrl: string
  /** Raw episode title string from video source (for tooltips / debug) */
  sourceTitle: string
  /** Whether this slot is operating in Layer 2 fallback / overflow / offline mode */
  isLayer2?: boolean
}

const NON_MAIN_KEYWORDS =
  /(?:^|[\s_#\-\[\(（【])(?:PV|预告|預告|花絮|OVA|OAD|SP\d*|特别篇|特別篇|总集篇|總集篇|特典|特报|特報|NC[OE]D|EXTRA)(?:[\s_#\-\]\)）】]|$|\d+)/i

/**
 * Filter out obvious non-main content items (e.g. PV, SP, Previews, Specials, Trailers).
 * Only performs coarse classification by keywords without guessing episode numbers.
 */
export function filterOutObviousNonMainContent(
  identifiers: string[],
): FilteredSourceItem[] {
  return (identifiers || [])
    .map((title, originalIndex) => ({
      originalIndex,
      title: (title || '').trim(),
    }))
    .filter(({ title }) => !title || !NON_MAIN_KEYWORDS.test(title))
}

/**
 * Format standardized episode display title with canonical number (pure clean episode label).
 */
export function formatEpisodeDisplayTitle(
  canonicalEp: number,
  _officialTitle?: string,
): string {
  if (canonicalEp === 0) return '第00话'
  if (canonicalEp > 0 && canonicalEp < 10) return `第0${canonicalEp}话`
  return `第${canonicalEp}话`
}

const CHINESE_NUMS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function parseChineseNumber(str: string): number | null {
  const s = str.trim()
  if (!s) return null
  if (s.length === 1 && CHINESE_NUMS[s] !== undefined) return CHINESE_NUMS[s]
  if (s.startsWith('十')) {
    const unit = CHINESE_NUMS[s.slice(1)] ?? 0
    return 10 + unit
  }
  if (s.includes('十')) {
    const [tens, units] = s.split('十')
    const t = CHINESE_NUMS[tens] ?? 1
    const u = units ? (CHINESE_NUMS[units] ?? 0) : 0
    return t * 10 + u
  }
  return null
}

/**
 * Conservative episode number extraction for Layer 2 (Source-Decided Mode).
 * Only matches explicit, high-certainty patterns without greedy guessing.
 */
export function extractConservativeEpisodeNumber(
  rawTitle: string,
  fallbackValue: number,
  isFirstItem = false,
): number {
  const title = (rawTitle || '').trim()
  if (!title) return fallbackValue

  // 1. Explicit 0-patterns e.g. "第00话", "第0话", "EP00", "EP0", "00", "0", "序章", "PROLOGUE"
  if (
    /(?:第\s*0+[\s集话話回期]|(?:^|[\s_#\-\[\(（【])(?:EP|Ep|E)\.?\s*0+(?:[\s_#\-\]\)）】]|$|\D)|^[\[\(（【]?\s*0+\s*[\]\)）】]?$|^0+[\s_#\-\.、:])/i.test(
      title,
    ) ||
    (isFirstItem && /(?:序章|PROLOGUE|前传|前傳)/i.test(title))
  ) {
    return 0
  }

  // 2. Explicit patterns like "第01集", "第12话", "第1回", "第一集", "第十二话"
  const cjkMatch = title.match(/第\s*([0-9一二两兩三四五六七八九十]+(?:\.\d+)?)\s*[集话話回期]/)
  if (cjkMatch?.[1]) {
    const raw = cjkMatch[1]
    const n = /^\d+(?:\.\d+)?$/.test(raw) ? parseFloat(raw) : parseChineseNumber(raw)
    if (n !== null && Number.isFinite(n) && n >= 0) return n
  }

  // 3. Explicit "EP01", "Ep. 02", "E03"
  const epMatch = title.match(
    /(?:^|[\s_#\-\[\(（【])(?:EP|Ep|E)\.?\s*(\d+(?:\.\d+)?)(?:[\s_#\-\]\)）】]|$|\D)/i,
  )
  if (epMatch?.[1]) {
    const n = parseFloat(epMatch[1])
    if (Number.isFinite(n) && n >= 0) return n
  }

  // 4. Bracketed numbers e.g. "[01]", "(02)", "【03】"
  const bracketMatch = title.match(/^[\[\(（【]\s*(\d+(?:\.\d+)?)\s*[\]\)）】]/)
  if (bracketMatch?.[1]) {
    const n = parseFloat(bracketMatch[1])
    if (Number.isFinite(n) && n >= 0) return n
  }

  // 5. Standalone or leading numbers e.g. "01", "12", "01 1080P", "01.mp4"
  const leadingNumMatch = title.match(
    /^(\d+(?:\.\d+)?)(?:[\s_#\-\.\(（\[【集话話回vV]|$)/,
  )
  if (leadingNumMatch?.[1]) {
    const n = parseFloat(leadingNumMatch[1])
    if (Number.isFinite(n) && n >= 0) return n
  }

  // Fallback: strictly to provided fallback value
  return fallbackValue
}

/**
 * Build authoritative, standardized PlayableSlot list for a video road.
 *
 * - Layer 1 (Bangumi Authoritative Positional Alignment):
 *   When Bangumi official main episodes (`type === 0`) can cover the filtered source items,
 *   maps items 0..N-1 1:1 to officialMain[0..N-1].sort and formats clean official subtitles.
 *
 * - Layer 2 (Source-Decided Conservative Mode):
 *   When official count mismatches (overflow/underflow) or Bangumi is offline/empty,
 *   safely falls back to source-decided conservative number extraction and preserves raw titles.
 */
export function buildPlayableSlots(
  road: { data: string[]; identifier?: string[] } | null | undefined,
  bgmEpisodes?: BgmEpisodeLike[] | null,
): PlayableSlot[] {
  if (!road?.data || road.data.length === 0) return []

  const identifiers = road.identifier || []
  const urls = road.data

  // 1. Extract official main episodes (type === 0: 本篇)
  const officialMain = (bgmEpisodes || [])
    .filter((e) => e.type === 0)
    .sort((a, b) => a.sort - b.sort)

  // 2. Filter out obvious non-main items from source playlist
  const filteredSource = filterOutObviousNonMainContent(identifiers)

  // If filteredSource is empty (e.g. no identifiers or all filtered), fall back to raw url list
  const sourceItems: FilteredSourceItem[] =
    filteredSource.length > 0
      ? filteredSource
      : urls.map((_, i) => ({
          originalIndex: i,
          title: (identifiers[i] || '').trim(),
        }))

  // Layer 1: Authoritative Bangumi Positional Alignment
  // Condition: Official main list exists and can cover the filtered source items
  if (officialMain.length > 0 && officialMain.length >= sourceItems.length) {
    return sourceItems.map((item, i) => {
      const bgm = officialMain[i]
      const canonicalEp = bgm.sort
      const officialTitle = (bgm.name_cn || bgm.name || '').trim()
      const displayTitle = formatEpisodeDisplayTitle(canonicalEp, officialTitle)
      const pageUrl = urls[item.originalIndex] || ''
      const sourceTitle = item.title || identifiers[item.originalIndex] || `第${canonicalEp}话`

      return {
        canonicalEp,
        officialTitle,
        displayTitle,
        sourceIndex: item.originalIndex,
        pageUrl,
        sourceTitle,
        isLayer2: false,
      }
    })
  }

  // Layer 2: Source-Decided Conservative Mode (Fallback / Overflow / Offline)
  const firstRawTitle =
    sourceItems[0]?.title ||
    identifiers[sourceItems[0]?.originalIndex ?? 0] ||
    ''
  const firstIsZero =
    extractConservativeEpisodeNumber(firstRawTitle, 0, true) === 0

  return sourceItems.map((item, i) => {
    const rawTitle = item.title || identifiers[item.originalIndex] || ''
    const fallbackVal = firstIsZero
      ? item.originalIndex
      : item.originalIndex + 1
    const canonicalEp = extractConservativeEpisodeNumber(
      rawTitle,
      fallbackVal,
      i === 0,
    )
    const pageUrl = urls[item.originalIndex] || ''
    const sourceTitle = rawTitle || `第${canonicalEp}集`
    const displayTitle = sourceTitle

    return {
      canonicalEp,
      officialTitle: '',
      displayTitle,
      sourceIndex: item.originalIndex,
      pageUrl,
      sourceTitle,
      isLayer2: true,
    }
  })
}

/**
 * Legacy compatibility: Align source episode playlist to official Bangumi main episodes (type === 0).
 */
export function alignSourceToOfficial(
  sourceIdentifiers: string[],
  bgmEpisodes: BgmEpisodeLike[],
): AlignedEpisode[] | null {
  if (!sourceIdentifiers?.length || !bgmEpisodes?.length) return null

  const officialMain = bgmEpisodes
    .filter((e) => e.type === 0)
    .sort((a, b) => a.sort - b.sort)

  if (officialMain.length === 0) return null

  const filteredSource = filterOutObviousNonMainContent(sourceIdentifiers)
  if (filteredSource.length === 0) return null

  if (officialMain.length >= filteredSource.length) {
    return filteredSource.map((item, i) => ({
      sourceIndex: item.originalIndex,
      episode: officialMain[i].sort,
    }))
  }

  return null
}

/**
 * Legacy compatibility: Look up the aligned episode number for a given source array index.
 */
export function resolveAlignedEpisodeNumber(
  aligned: AlignedEpisode[] | null | undefined,
  epIndex: number,
): number | null {
  if (!aligned || aligned.length === 0) return null
  const match = aligned.find((a) => a.sourceIndex === epIndex)
  return match !== undefined ? match.episode : null
}
