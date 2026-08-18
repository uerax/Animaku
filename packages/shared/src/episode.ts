/**
 * Episode number and metadata parsing / normalization utilities
 * for cross-source episode alignment and playback position inheritance.
 */

export interface ParsedEpisode {
  /**
   * Normalized numerical episode value if identified (e.g. 1, 12, 5.5).
   * Null if no clear episode number could be parsed.
   */
  epNum: number | null
  /**
   * Whether this episode is identified as a special (SP, OVA, OAD, 剧场版, 特典, etc.)
   */
  isSP: boolean
  /**
   * Raw input episode title trimmed.
   */
  rawTitle: string
}

const SP_PATTERN = /(?:^|[\s_#\-\[\(（【])(?:SP|OVA|OAD|PV|NC[OE]D|EXTRA|特别篇|特別篇|剧场版|劇場版|特报|特報|特典|总集篇|總集篇|番外|预告|預告)(?:[\s_#\-\]\)）】]|$|\d+)/i

/**
 * Parse an episode display title into canonical episode metadata.
 *
 * Examples:
 * - "第01话" -> { epNum: 1, isSP: false }
 * - "第12集 1080P" -> { epNum: 12, isSP: false }
 * - "第5.5话" -> { epNum: 5.5, isSP: false }
 * - "EP03", "Ep. 04", "E05" -> { epNum: 3 / 4 / 5, isSP: false }
 * - "01", "12" -> { epNum: 1 / 12, isSP: false }
 * - "[05]", "【06】" -> { epNum: 5 / 6, isSP: false }
 * - "SP01", "OVA 02" -> { epNum: 1 / 2, isSP: true }
 * - "剧场版" -> { epNum: null, isSP: true }
 */
export function parseEpisodeNumber(rawTitle: string): ParsedEpisode {
  const title = (rawTitle || '').trim()
  if (!title) {
    return { epNum: null, isSP: false, rawTitle: '' }
  }

  const isSP = SP_PATTERN.test(title)

  // 1. Match patterns like "第01集", "第12.5话", "第1回"
  const cjkMatch = title.match(/第\s*(\d+(?:\.\d+)?)\s*[集话話回期]/)
  if (cjkMatch?.[1]) {
    const num = parseFloat(cjkMatch[1])
    if (Number.isFinite(num)) {
      return { epNum: num, isSP, rawTitle: title }
    }
  }

  // 2. Match patterns like "EP01", "Ep.02", "E03", "EP 04"
  const epMatch = title.match(/(?:^|[\s_#\-\[\(（【])(?:EP|Ep|E)\.?\s*(\d+(?:\.\d+)?)(?:[\s_#\-\]\)）】]|$|[^\d.])/i)
  if (epMatch?.[1]) {
    const num = parseFloat(epMatch[1])
    if (Number.isFinite(num)) {
      return { epNum: num, isSP, rawTitle: title }
    }
  }

  // 3. Match patterns like "SP01", "OVA02"
  const spNumMatch = title.match(/(?:SP|OVA|OAD|PV)\s*(\d+(?:\.\d+)?)/i)
  if (spNumMatch?.[1]) {
    const num = parseFloat(spNumMatch[1])
    if (Number.isFinite(num)) {
      return { epNum: num, isSP: true, rawTitle: title }
    }
  }

  // 4. Match bracketed numbers like "[01]", "(02)", "【03】"
  const bracketMatch = title.match(/^[\[\(（【]\s*(\d+(?:\.\d+)?)\s*[\]\)）】]/)
  if (bracketMatch?.[1]) {
    const num = parseFloat(bracketMatch[1])
    if (Number.isFinite(num)) {
      return { epNum: num, isSP, rawTitle: title }
    }
  }

  // 5. Match standalone or leading numbers e.g. "01", "12", "01 1080P", "01-国语", "01.mp4"
  const leadingNumMatch = title.match(/^(\d+(?:\.\d+)?)(?:[\s_#\-\.\(（\[【集话話回vV]|$)/)
  if (leadingNumMatch?.[1]) {
    const num = parseFloat(leadingNumMatch[1])
    if (Number.isFinite(num)) {
      return { epNum: num, isSP, rawTitle: title }
    }
  }

  // 6. Generic number extraction if surrounded by common delimiters
  const genericMatch = title.match(/(?:^|[\s_#\-\/])(\d+(?:\.\d+)?)(?:[\s_#\-\/话話集回]|$)/)
  if (genericMatch?.[1]) {
    const num = parseFloat(genericMatch[1])
    if (Number.isFinite(num)) {
      return { epNum: num, isSP, rawTitle: title }
    }
  }

  return {
    epNum: null,
    isSP,
    rawTitle: title,
  }
}

/**
 * Match a target episode (by number or title) against a list of candidate episode titles.
 * Returns the 0-based index of the best matching episode in candidateTitles, or -1 if none found.
 */
export function findMatchingEpisodeIndex(
  targetTitle: string,
  candidateTitles: string[],
  fallbackIndex = -1,
): number {
  if (!candidateTitles || candidateTitles.length === 0) {
    return -1
  }

  const targetParsed = parseEpisodeNumber(targetTitle)

  // 1. If target has a valid epNum, search for matching epNum in candidates
  if (targetParsed.epNum !== null) {
    // Prefer same isSP state
    const exactMatch = candidateTitles.findIndex((c) => {
      const p = parseEpisodeNumber(c)
      return p.epNum === targetParsed.epNum && p.isSP === targetParsed.isSP
    })
    if (exactMatch !== -1) return exactMatch

    // Next try match epNum regardless of isSP
    const numMatch = candidateTitles.findIndex((c) => {
      const p = parseEpisodeNumber(c)
      return p.epNum === targetParsed.epNum
    })
    if (numMatch !== -1) return numMatch
  }

  // 2. Exact raw title match
  const rawMatch = candidateTitles.findIndex(
    (c) => c.trim().toLowerCase() === targetTitle.trim().toLowerCase(),
  )
  if (rawMatch !== -1) return rawMatch

  // 3. Fallback to index if within bounds
  if (fallbackIndex >= 0 && fallbackIndex < candidateTitles.length) {
    return fallbackIndex
  }

  return 0
}
