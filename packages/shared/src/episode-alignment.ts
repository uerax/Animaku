/**
 * Authoritative Bangumi Positional Episode Alignment
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
 * Align source episode playlist to official Bangumi main episodes (type === 0).
 *
 * Rule:
 * 1. Filter official Bangumi episodes to main series (type === 0), sorted ascending by `sort`.
 * 2. Filter source identifiers to non-SP/PV items.
 * 3. If official count >= source count and source count > 0:
 *    Map source item 0..N-1 directly to officialMain[0..N-1].sort.
 *    (immune to title numbers and 0-based/1-based naming).
 * 4. If count is mismatched (e.g. source has more episodes than Bangumi or Bangumi fetch failed):
 *    Returns null, falling back to Layer 2.
 */
export function alignSourceToOfficial(
  sourceIdentifiers: string[],
  bgmEpisodes: BgmEpisodeLike[],
): AlignedEpisode[] | null {
  if (!sourceIdentifiers?.length || !bgmEpisodes?.length) return null

  // 1. Extract official main episodes (type === 0: 本篇)
  const officialMain = bgmEpisodes
    .filter((e) => e.type === 0)
    .sort((a, b) => a.sort - b.sort)

  if (officialMain.length === 0) return null

  // 2. Filter out non-main items from source playlist
  const filteredSource = filterOutObviousNonMainContent(sourceIdentifiers)
  if (filteredSource.length === 0) return null

  // 3. Safety valve: official main episodes must be able to cover the source items
  if (officialMain.length >= filteredSource.length) {
    return filteredSource.map((item, i) => ({
      sourceIndex: item.originalIndex,
      episode: officialMain[i].sort,
    }))
  }

  // Count mismatch (e.g. source has more episodes than official index has recorded)
  return null
}

/**
 * Look up the aligned episode number for a given source array index.
 * Returns null if not aligned or index not found.
 */
export function resolveAlignedEpisodeNumber(
  aligned: AlignedEpisode[] | null | undefined,
  epIndex: number,
): number | null {
  if (!aligned || aligned.length === 0) return null
  const match = aligned.find((a) => a.sourceIndex === epIndex)
  return match !== undefined ? match.episode : null
}
