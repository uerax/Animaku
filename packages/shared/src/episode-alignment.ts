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
  ep?: number
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
  /** Official 1-based entry episode number within this subject (bgm.ep || index + 1), used for Danmaku & AniSkip OP/ED alignment */
  entryEp: number
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
      const entryEp = bgm.ep && bgm.ep > 0 ? bgm.ep : i + 1
      const officialTitle = (bgm.name_cn || bgm.name || '').trim()
      const displayTitle = formatEpisodeDisplayTitle(canonicalEp, officialTitle)
      const pageUrl = urls[item.originalIndex] || ''
      const sourceTitle = item.title || identifiers[item.originalIndex] || `第${canonicalEp}话`

      return {
        canonicalEp,
        entryEp,
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
  // 用 -1 作为哨兵值（不能用 0！），使"未能从标题提取到数字"与"显式匹配到
  // 0 集模式（如「第00话」「序章」）"这两种完全不同的语义不再共用同一个
  // 返回值。此前复用 0 作为 fallback 导致纯文本首集标题（如"刽子手"）被
  // 误判为 0-based，造成后续所有集数整体左移 1 位。
  const firstIsZero =
    extractConservativeEpisodeNumber(firstRawTitle, -1, true) === 0

  // 超过 20 集必定为半年番、年番或长篇连载动画，绝非剧场版/单集多版本资源
  const isLongSeries = sourceItems.length > 20

  return sourceItems.map((item, i) => {
    const rawTitle = item.title || identifiers[item.originalIndex] || ''
    const fallbackVal = firstIsZero
      ? item.originalIndex
      : item.originalIndex + 1
    // 使用 -1 作为哨兵探测源站标题中是否含有显式、高置信度的集数标识
    const explicitEp = extractConservativeEpisodeNumber(
      rawTitle,
      -1,
      i === 0,
    )
    const canonicalEp = explicitEp >= 0 ? explicitEp : fallbackVal
    const entryEp = i + 1
    const pageUrl = urls[item.originalIndex] || ''
    const sourceTitle = rawTitle || `第${canonicalEp}集`
    // 满足以下任一条件时，规范化为干净的集数卡片（如 "第01话"）：
    // 1. 显式带有集数标记（如 "第1集"、"EP02"、"03" 等）；
    // 2. 总集数超过 20 集的连载动画（如海贼王、柯南等即使源站仅给纯剧情名，卡片也整齐显示集数，原名保留在 hover tooltip）；
    // 否则（<= 20 集且无集数标记，如剧场版 "1080P" / "4K" / "粤语版" 或短篇 OVA 纯文本篇名 "刽子手"），忠实呈现源站原名以保证辨识度
    const displayTitle =
      explicitEp >= 0 || isLongSeries
        ? formatEpisodeDisplayTitle(canonicalEp)
        : sourceTitle

    return {
      canonicalEp,
      entryEp,
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

/**
 * 依据 URL 或历史记录的集数参数 (qEp)，智能解析出目标播放槽位 (PlayableSlot)。
 * 1. 优先尝试直接匹配 canonicalEp === qEp (Layer 1 正常对齐场景)；
 * 2. 若扑空 (如 Layer 2 源站仅有 1..12，而 qEp 为 14)：
 *    通过 entryEpHint 或 Bangumi 官方数据映射 (sort -> ep)，找到对应的条目内序号；
 *    再从 slots 中寻找 entryEp === targetEntryEp，实现精准对齐；
 * 3. 安全兜底：如果 qEp 在合理范围内 (1..slots.length) 则按 qEp - 1 下标偏移，否则安全降级到 slots[0]，杜绝大集数溢出截断至末集。
 */
export function resolveTargetSlot(
  slots: PlayableSlot[],
  qEp: number | undefined,
  entryEpHint?: number,
  bgmEpisodes?: BgmEpisodeLike[] | null,
): PlayableSlot | undefined {
  if (!slots || slots.length === 0) return undefined
  if (qEp === undefined || qEp < 0) return slots[0]

  // 1. 直接按 canonicalEp 查找 (如目标源同为 14)
  const direct = slots.find((s) => s.canonicalEp === qEp)
  if (direct) return direct

  // 2. 跨层级/拆季番条目集数映射查找 (利用本地历史 entryEpHint 或 Bangumi sort -> ep 映射表)
  const targetEntryEp =
    entryEpHint ??
    bgmEpisodes?.find((e) => e.type === 0 && e.sort === qEp)?.ep

  if (targetEntryEp !== undefined && targetEntryEp > 0) {
    const mapped = slots.find((s) => s.entryEp === targetEntryEp)
    if (mapped) return mapped
  }

  // 3. 安全下标回退：仅当 qEp 在合法集数范围内才尝试 qEp - 1，避免大集数 (如 14) 强行截断到最后一集
  const safeIdx = qEp >= 1 && qEp <= slots.length ? qEp - 1 : 0
  return slots[safeIdx] || slots[0]
}
