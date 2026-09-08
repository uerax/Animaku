/** HTTP template used by API-mode rules ( ApiRequestConfig) */
export interface ApiRequestConfig {
  method?: string
  url: string
  headers?: Record<string, unknown>
  query?: Record<string, unknown>
  bodyType?: 'none' | 'json' | 'form'
  body?: unknown
}

/**  ApiSearchConfig — JSON API search */
export interface ApiSearchConfig {
  request: ApiRequestConfig
  listPath: string
  namePath: string
  sourcePath: string
  /**
   * Optional template to turn a bare id/slug from sourcePath into a detail URL.
   * Use `@source` for the raw value (e.g. `/bangumi/@source.html`).
   * When omitted, sourcePath value is used as-is (sorani / TvTFun style).
   */
  sourceTemplate?: string
}

export interface ApiEpisodePageConfig {
  url: string
  query?: Record<string, unknown>
}

/**  ApiChapterConfig — nested or delimited chapter responses */
export interface ApiChapterConfig {
  request: ApiRequestConfig
  format?: 'nested' | 'delimited'
  roadsPath?: string
  roadNamePath?: string
  episodesPath?: string
  episodeNamePath?: string
  episodeUrlPath?: string
  roadNamesPath?: string
  roadEpisodesPath?: string
  roadSeparator?: string
  episodeSeparator?: string
  fieldSeparator?: string
  variables?: Record<string, string>
  episodePage?: ApiEpisodePageConfig
}

/** Release-page config: fetch a hub page, XOR-decode the latest domain list. */
export interface ReleaseConfig {
  /** Release / hub page URL that lists current mirrors. */
  pageUrl: string
  /** Hours between re‑fetches (default 2). */
  fetchHour?: number
  /** Index into the decoded domain array (0 = first). */
  domainIndex?: number
  /** XOR key for domain obfuscation. */
  xorKey?: string
  /** JS variable name that holds the encoded domain array (default "sites"). */
  varName?: string
}

/** AniBaka Pipeline Step (anx-rule/2) */
export interface PipelineStep {
  op: string
  [key: string]: unknown
}

/**
 * Title search preference:
 * - 'chinese': Standard Chinese title (with spaces, e.g. cycani, tvtfun, girigiri)
 * - 'chinese_compact': Compact Chinese title (multi-season without spaces, e.g. mifun)
 * - 'original': Japanese / original title first (e.g. xifan-next, moonci, omofun, libvio)
 * - 'traditional': Traditional Chinese title first (e.g. anime1)
 */

/**
 * 广告切片清洗模式：
 * - 'none': 不开启清洗（默认）
 * - 'client': 客户端本地清洗（纯前端执行，零服务端资源消耗，适用于量子资源等直连开放源）
 * - 'server': 服务端网关清洗（服务端仅代理清洗 M3U8 文本，切片直连，适用于有防盗链/无跨域头的受限源）
 */
export type AdBlockerMode = 'none' | 'client' | 'server'

export type TitlePreference =
  | 'chinese'
  | 'chinese_compact'
  | 'original'
  | 'traditional'

/** Plugin rule (subset used by web, supporting both Kazumi V1 and AniBaka V2 pipelines). */
export interface PluginRule {
  api?: string
  type?: string
  format?: string
  id?: string
  name: string
  version: string
  iconUrl?: string
  description?: string
  headers?: Record<string, string>
  recipes?: string[]
  search?: PipelineStep[]
  detail?: PipelineStep[]
  play?: PipelineStep[]
  directConnection?: boolean
  mediaValidationTimeoutMs?: number
  /** Display sorting weight (higher weight = higher priority). Missing defaults to lowest weight. */
  weight?: number
  /**
   * When true, prioritizes this plugin for vintage / classic anime (released >= 5 years ago, e.g. airDate <= currentYear - 5).
   * In default source selection and sorting, plugins with oldAnimePriority receive +12 weight bonus
   * when the current subject is an older anime.
   */
  oldAnimePriority?: boolean
  /**
   * Title search preference:
   * - 'chinese': Standard Chinese title (with spaces, e.g. cycani, tvtfun, girigiri)
   * - 'chinese_compact': Compact Chinese title (multi-season without spaces, e.g. mifun)
   * - 'original': Japanese / original title first (e.g. xifan-next, moonci, omofun, libvio)
   * - 'traditional': Traditional Chinese title first (e.g. anime1)
   */
  titlePreference?: TitlePreference
  /**
   * When true, automatically convert Simplified Chinese search keywords to Traditional Chinese.
   */
  traditionalChinese?: boolean
  /**
   * When true, strip special punctuation and symbols before sending search requests.
   */
  stripSymbols?: boolean
  muliSources?: boolean
  useWebview?: boolean
  useNativePlayer?: boolean
  usePost?: boolean
  useLegacyParser?: boolean
  adBlockerMode?: AdBlockerMode
  userAgent?: string
  baseURL: string
  searchURL?: string
  searchList?: string
  searchName?: string
  searchResult?: string
  chapterRoads?: string
  chapterResult?: string
  referer?: string
  /** True when playback requires server-side full media proxy plus client opt-in. */
  requiresFullMediaProxy?: boolean
  searchMode?: 'xpath' | 'api'
  chapterMode?: 'xpath' | 'api'
  /** Required when searchMode === 'api' (e.g. sorani / TvTFun) */
  searchApiConfig?: ApiSearchConfig
  /** Required when chapterMode === 'api' */
  chapterApiConfig?: ApiChapterConfig
  /** Release-page config: dynamic domain resolution from a hub page. */
  release?: ReleaseConfig
}

export interface PluginMeta extends PluginRule {
  /** client-only */
  enabled: boolean
  /** per-source media proxy toggle */
  proxy?: boolean
  id: string
  importedAt: number
  /** how the rule entered the client store */
  source?: 'builtin' | 'import' | 'catalog'
  /** rule engine / ecosystem type */
  engineType?: 'anibaka' | 'kazumi' | 'adapter'
}

/** Check if a rule is an AniBaka (anx-rule/2) pipeline rule */
export function isAnxRule(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  const format = String(r.format ?? '').trim().toLowerCase()
  if (format === 'anx-rule/2') return true
  return Array.isArray(r.search) && (Array.isArray(r.detail) || Array.isArray(r.play))
}

/** KazumiRules & AniBakaRule `index.json` entry */
export interface PluginCatalogItem {
  name: string
  version: string
  useNativePlayer: boolean
  author: string
  lastUpdate: number
  antiCrawlerEnabled: boolean
  // AniBaka & Unified Shop extensions
  id?: string
  shop?: 'anibaka' | 'kazumi'
  title?: string
  intro?: string
  site?: string
  badge?: string
  labels?: string[]
  ref?: string
  engine?: string
}

export type PluginCatalogStatus = 'install' | 'installed' | 'update'

/** Simple semver-ish compare: true if remote is newer than local*/
export function isRemoteNewer(localVersion: string, remoteVersion: string): boolean {
  const local = String(localVersion || '')
    .split('.')
    .map((s) => parseInt(s, 10) || 0)
  const remote = String(remoteVersion || '')
    .split('.')
    .map((s) => parseInt(s, 10) || 0)
  const n = Math.max(local.length, remote.length)
  for (let i = 0; i < n; i++) {
    const l = local[i] ?? 0
    const r = remote[i] ?? 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

export function catalogItemStatus(
  installed: { name: string; version: string } | undefined,
  remote: PluginCatalogItem,
): PluginCatalogStatus {
  if (!installed) return 'install'
  if (isRemoteNewer(installed.version, remote.version)) return 'update'
  return 'installed'
}

/**
 * Compare two plugins for display ordering:
 * 1. Higher weight first (built-in sources default to 50; third-party/imported sources default to 0).
 *    When isOldAnime is true, plugins with oldAnimePriority receive +12 weight bonus.
 * 2. Equal weights tie-break alphabetically by plugin name (case-insensitive, stable).
 */
export function comparePluginOrder(
  a: { name?: string; weight?: number; source?: string; oldAnimePriority?: boolean },
  b: { name?: string; weight?: number; source?: string; oldAnimePriority?: boolean },
  isOldAnime = false,
): number {
  const getWeight = (p: { weight?: number; source?: string; oldAnimePriority?: boolean }) => {
    let base = 0
    if (typeof p.weight === 'number' && Number.isFinite(p.weight)) {
      base = p.weight
    } else {
      base = p.source === 'builtin' ? 50 : 0
    }
    if (isOldAnime && p.oldAnimePriority) {
      base += 12
    }
    return base
  }
  const wa = getWeight(a)
  const wb = getWeight(b)
  if (wa !== wb) {
    return wb - wa
  }
  const na = (a.name || '').toLowerCase()
  const nb = (b.name || '').toLowerCase()
  const cmp = na.localeCompare(nb)
  if (cmp !== 0) return cmp
  return (a.name || '').localeCompare(b.name || '')
}

export interface SearchItem {
  name: string
  src: string
}

export interface Road {
  name: string
  /** absolute episode page URLs */
  data: string[]
  /** episode display names */
  identifier: string[]
}

export interface PluginSearchResult {
  pluginName: string
  items: SearchItem[]
  diagnostics?: string[]
}

export interface PluginChapterResult {
  pluginName: string
  roads: Road[]
  diagnostics?: string[]
}

export interface ResolvePlayResult {
  playUrl: string
  proxyUrl: string
  contentType?: string
  referer?: string
  headers?: Record<string, string>
  diagnostics?: string[]
  /** True when playback requires server-side proxy (e.g. cookie auth, CORS, or adFilter) */
  requiresProxy?: boolean
  /** Inferred or declared media format ('hls' | 'mp4') for player engine routing */
  format?: 'hls' | 'mp4'
  /** Declared or inferred ad blocker mode ('none' | 'client' | 'server') */
  adBlockerMode?: AdBlockerMode
}

const CHINESE_DIGITS: Record<string, number> = {
  '零': 0,
  '一': 1,
  '二': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
  '十': 10,
}

/**
 * Parse Chinese numeral strings (1-99) into Arabic numbers.
 * e.g. "一" -> 1, "四" -> 4, "十二" -> 12, "二十三" -> 23
 */
export function parseChineseNumber(raw: string): number | null {
  if (!raw) return null
  const direct = parseInt(raw, 10)
  if (!Number.isNaN(direct)) return direct
  const tenIndex = raw.indexOf('十')
  if (tenIndex === -1) return CHINESE_DIGITS[raw] ?? null
  const tens = tenIndex === 0 ? 1 : (CHINESE_DIGITS[raw[0]] ?? 1)
  const onesPart = raw.slice(tenIndex + 1)
  const ones = onesPart ? (CHINESE_DIGITS[onesPart] ?? 0) : 0
  return tens * 10 + ones
}

const ROMAN_NUMERALS: Record<string, number> = {
  'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6, 'Ⅶ': 7, 'Ⅷ': 8, 'Ⅸ': 9, 'Ⅹ': 10,
  'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6,
}

const SEASON_NUM_RE =
  /第\s*([一二三四五六七八九十\d]+)\s*[季期部]|season\s*(\d+)|\bs(\d+)\b|part\s*(\d+)|([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])|\b(II|III|IV|V|VI)\b/i

/**
 * Extract normalized season number from anime title string.
 * Supports Chinese numbers, Arabic digits, Season/S tags, and Roman numerals (II, III, Ⅱ, Ⅲ).
 * Returns null if no explicit season is declared.
 */
export function extractSeason(title: string | null | undefined): number | null {
  if (!title) return null
  const m = title.match(SEASON_NUM_RE)
  if (!m) return null
  if (m[1]) return parseChineseNumber(m[1])
  const numStr = m[2] || m[3] || m[4]
  if (numStr) return parseInt(numStr, 10)
  if (m[5]) return ROMAN_NUMERALS[m[5]] ?? null
  if (m[6]) return ROMAN_NUMERALS[m[6].toLowerCase()] ?? null
  return null
}

const ARC_OR_SEASON_SUFFIX_RE =
  /\s*(?:第\s*[一二三四五六七八九十\d]+\s*[季期部]|Season\s*\d+|S\d+|Part\s*\d+|[第上下][季期]|[上下前后]篇?|[一二三四五六七八九十\d]+章|特别篇|总集篇|番外篇|剧场版|[一-龥]{2,6}[篇編])\s*$/i

const BRACKET_SUFFIX_RE =
  /\s*[\(\[（【][^\)\]）】]+[\)\]）】]\s*$/

/**
 * Extract base anime title by recursively stripping arc/chapter/season suffixes.
 * e.g. "Re：从零开始的异世界生活 第四季 夺还篇" -> "Re：从零开始的异世界生活 第四季" -> "Re：从零开始的异世界生活"
 */
export function extractBaseTitle(fullTitle: string): string {
  if (!fullTitle) return ''
  let base = fullTitle.trim()
  if (BRACKET_SUFFIX_RE.test(base)) {
    base = base.replace(BRACKET_SUFFIX_RE, '').trim()
  }
  if (ARC_OR_SEASON_SUFFIX_RE.test(base)) {
    base = base.replace(ARC_OR_SEASON_SUFFIX_RE, '').trim()
  }
  return base || fullTitle
}

/**
 * Resolve the default search keyword for a given plugin rule based on its title preference.
 * - 'original': item.name (Japanese/original) -> item.nameCn (Chinese) -> fallback
 * - 'chinese_compact': Chinese title with multi-season collapsed without spaces (e.g. 碧蓝之海第二季)
 * - 'traditional': item.nameCn -> item.name -> fallback
 * - 'chinese': item.nameCn (Chinese) -> item.name (Japanese/original) -> fallback
 */
export function resolvePluginDefaultKeyword(
  plugin: { titlePreference?: TitlePreference } | null | undefined,
  item: { nameCn?: string | null; name?: string | null } | null | undefined,
  fallback?: string,
): string {
  const name = (item?.name || '').trim()
  const nameCn = (item?.nameCn || '').trim()
  const fb = (fallback || '').trim()
  const pref = plugin?.titlePreference || 'chinese'

  if (pref === 'original') {
    return name || nameCn || fb
  }

  const chineseTitle = nameCn || name || fb
  if (pref === 'chinese_compact') {
    return chineseTitle.replace(/\s+(第\s*[一二三四五六七八九十\d]+\s*[季期部])/g, '$1')
  }

  return chineseTitle
}

const SHORT_PREFIX_BLACKLIST = new Set([
  're', 'fate', 'ova', 'oad', 'sp', 'part', '剧场版', '特别篇', '总集篇',
])

/**
 * Build structured multi-tier search keyword candidates.
 * Tier 1: Full original title
 * Tier 2: Main title + season (with space)
 * Tier 3: Main title + season (compact, without space)
 * Tier 4: Base anime title (season and arc stripped)
 */
export function buildSearchKeywords(
  nameCn?: string | null,
  name?: string | null,
  aliases?: string[] | null,
): string[] {
  const titles = [nameCn, name, ...(aliases || [])]
    .map((s) => (s || '').trim())
    .filter(Boolean)

  const variants: string[] = []
  const push = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim()
    if (!t || t.length < 2) return
    if (t.length < 4 && SHORT_PREFIX_BLACKLIST.has(t.toLowerCase())) return
    if (t.length > 60) return
    if (!variants.some((v) => v.toLowerCase() === t.toLowerCase())) {
      variants.push(t)
    }
  }

  for (const title of titles) {
    // 1. Full original title (Tier 1)
    push(title)

    // 2. Compact season without space if original has space (Tier 2/3)
    const compactSeason = title.replace(/\s+(第\s*[一二三四五六七八九十\d]+\s*[季期部])/g, '$1')
    if (compactSeason !== title) {
      push(compactSeason)
    }

    // 3. Strip trailing arc/subtitle (Level 1 extraction)
    const baseWithSeason = extractBaseTitle(title)
    if (baseWithSeason !== title) {
      push(baseWithSeason)
      push(baseWithSeason.replace(/\s+(第\s*[一二三四五六七八九十\d]+\s*[季期部])/g, '$1'))
    }

    // 4. Strip season marker (Level 2 extraction -> Tier 4 pure base)
    const basePure = extractBaseTitle(baseWithSeason)
    if (basePure !== baseWithSeason) {
      push(basePure)
    }

    // 5. Clean subtitles enclosed in tildes: e.g. "无职转生～到了异世界就拿出真本事～" -> "无职转生"
    const noTilde = title.replace(/[～~].*?[～~]/g, ' ').replace(/\s+/g, ' ').trim()
    if (noTilde && noTilde !== title) {
      push(noTilde)
      const noTildeBase = extractBaseTitle(noTilde)
      if (noTildeBase && noTildeBase !== noTilde) {
        push(noTildeBase)
        push(noTildeBase.replace(/\s+(第\s*[一二三四五六七八九十\d]+\s*[季期部])/g, '$1'))
        const noTildePure = extractBaseTitle(noTildeBase)
        if (noTildePure && noTildePure !== noTildeBase) {
          push(noTildePure)
        }
      }
    }

    // 6. Clean brackets e.g. (第X季)
    const noBracket = title.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim()
    if (noBracket && noBracket !== title) {
      push(noBracket)
    }

    // 7. Colon/delimiter head ONLY if >= 4 characters and not blacklisted
    const colonHead = title.split(/[\s　:：\-–—·・]/)[0]?.trim()
    if (colonHead && colonHead.length >= 4 && !SHORT_PREFIX_BLACKLIST.has(colonHead.toLowerCase())) {
      push(colonHead)
    }
  }

  return variants
}

const MODIFIER_RE =
  /第\s*[一二三四五六七八九十\d]+\s*[季期部]|season\s*\d+|s\d+|part\s*\d+|剧场版|劇場版|特别篇|特別編|ova|oad|movie|映画/i

/**
 * Cheap title similarity for ranking plugin hits (not a full fuzzy matcher).
 * Enhanced with Season Guard:
 * 1. Hard Season Conflict: when both titles explicitly declare seasons and they differ,
 *    clamp score to 0.15 (completely disqualifies auto-pick).
 * 2. Modifier Mismatch: when one title has season/modifier while the other does not (e.g. S4 vs S1),
 *    clamp substring bonus to 0.45 (below AUTO_PICK_MIN_SIMILARITY 0.55, avoiding false auto-picks).
 * 3. Neutral Jaccard/Bigram when neither title has season indicators (zero impact on single-season anime).
 */
export function titleSimilarity(a: string, b: string): number {
  const s1 = (a || '').toLowerCase().replace(/\s+/g, '')
  const s2 = (b || '').toLowerCase().replace(/\s+/g, '')
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1

  const seasonA = extractSeason(a)
  const seasonB = extractSeason(b)

  // 1. Hard Season Conflict: both explicitly declare seasons and they differ (e.g. S4 vs S2)
  if (seasonA !== null && seasonB !== null && seasonA !== seasonB) {
    return 0.15
  }

  const aHasMod = MODIFIER_RE.test(a)
  const bHasMod = MODIFIER_RE.test(b)
  const modMismatch = aHasMod !== bHasMod

  if (s1.includes(s2) || s2.includes(s1)) {
    const ratio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length)
    if (modMismatch) {
      // One has season/modifier while the other does not (e.g. Season 4 vs Season 1 without tag)
      const penalized = (0.65 + ratio * 0.25) * 0.6
      return Math.min(penalized, 0.45)
    }
    return 0.85 + 0.1 * ratio
  }

  // character Jaccard-ish
  const set1 = new Set(s1)
  let inter = 0
  for (const ch of s2) if (set1.has(ch)) inter++
  const union = new Set([...s1, ...s2]).size || 1
  const jaccard = inter / union
  // bigram overlap for CJK titles
  const bigrams = (s: string) => {
    const out: string[] = []
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
    return out
  }
  const b1 = bigrams(s1)
  const b2 = new Set(bigrams(s2))
  let bi = 0
  for (const g of b1) if (b2.has(g)) bi++
  const biScore = b1.length ? bi / b1.length : 0
  const combined = Math.max(jaccard * 0.6 + biScore * 0.4, jaccard)
  return modMismatch ? combined * 0.7 : combined
}

/** Best score of `name` against any reference title (cn/en/aliases). */
export function bestTitleSimilarity(
  name: string,
  references: Array<string | null | undefined>,
): number {
  let best = 0
  for (const ref of references) {
    if (!ref) continue
    best = Math.max(best, titleSimilarity(name, ref))
  }
  return best
}

/** Sort search hits closer to Bangumi titles first (all items kept). */
export function rankSearchItems<T extends { name: string }>(
  items: T[],
  references: Array<string | null | undefined>,
): T[] {
  if (!items.length) return items
  return [...items].sort((a, b) => {
    const sb = bestTitleSimilarity(b.name, references)
    const sa = bestTitleSimilarity(a.name, references)
    if (sb !== sa) return sb - sa
    return a.name.length - b.name.length
  })
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseApiRequestConfig(raw: unknown): ApiRequestConfig {
  const j = asObject(raw) || {}
  const url = String(j.url ?? '').trim()
  if (!url) throw new Error('API 请求缺少 url')
  const method = String(j.method ?? 'GET').toUpperCase()
  const bodyTypeRaw = String(j.bodyType ?? 'none')
  const bodyType =
    bodyTypeRaw === 'json' || bodyTypeRaw === 'form' ? bodyTypeRaw : 'none'
  return {
    method,
    url,
    headers: asObject(j.headers) || undefined,
    query: asObject(j.query) || undefined,
    bodyType,
    body: j.body,
  }
}

function parseApiSearchConfig(raw: unknown): ApiSearchConfig {
  const j = asObject(raw)
  if (!j) throw new Error('searchApiConfig 无效')
  const listPath = String(j.listPath ?? '').trim()
  const namePath = String(j.namePath ?? '').trim()
  const sourcePath = String(j.sourcePath ?? '').trim()
  if (!listPath || !namePath || !sourcePath) {
    throw new Error('searchApiConfig 缺少 listPath / namePath / sourcePath')
  }
  const sourceTemplate = String(j.sourceTemplate ?? '').trim()
  return {
    request: parseApiRequestConfig(j.request),
    listPath,
    namePath,
    sourcePath,
    ...(sourceTemplate ? { sourceTemplate } : {}),
  }
}

function parseApiChapterConfig(raw: unknown): ApiChapterConfig {
  const j = asObject(raw)
  if (!j) throw new Error('chapterApiConfig 无效')
  const format = j.format === 'delimited' ? 'delimited' : 'nested'
  const episodePageRaw = asObject(j.episodePage)
  const episodePage = episodePageRaw
    ? {
        url: String(episodePageRaw.url ?? '').trim(),
        query: asObject(episodePageRaw.query) || undefined,
      }
    : undefined
  if (episodePage && !episodePage.url) {
    throw new Error('chapterApiConfig.episodePage.url 不能为空')
  }
  const variablesRaw = asObject(j.variables)
  const variables: Record<string, string> | undefined = variablesRaw
    ? Object.fromEntries(
        Object.entries(variablesRaw).map(([k, v]) => [k, String(v ?? '')]),
      )
    : undefined
  return {
    request: parseApiRequestConfig(j.request),
    format,
    roadsPath: String(j.roadsPath ?? ''),
    roadNamePath: String(j.roadNamePath ?? ''),
    episodesPath: String(j.episodesPath ?? ''),
    episodeNamePath: String(j.episodeNamePath ?? ''),
    episodeUrlPath: String(j.episodeUrlPath ?? ''),
    roadNamesPath: String(j.roadNamesPath ?? ''),
    roadEpisodesPath: String(j.roadEpisodesPath ?? ''),
    roadSeparator: String(j.roadSeparator ?? '$$$'),
    episodeSeparator: String(j.episodeSeparator ?? '#'),
    fieldSeparator: String(j.fieldSeparator ?? '$'),
    variables,
    episodePage,
  }
}

export function parsePluginRule(raw: unknown): PluginRule {
  if (!raw || typeof raw !== 'object') {
    throw new Error('插件 JSON 无效')
  }
  const j = raw as Record<string, unknown>
  const name = String(j.name ?? '').trim()
  const baseURL = String(j.baseURL ?? j.baseUrl ?? '').trim()
  const searchURL = String(j.searchURL ?? '').trim()
  const searchMode = j.searchMode === 'api' ? 'api' : 'xpath'
  const chapterMode = j.chapterMode === 'api' ? 'api' : 'xpath'

  if (!name || !baseURL) {
    throw new Error('插件缺少 name / baseURL')
  }

  const weight =
    typeof j.weight === 'number' && Number.isFinite(j.weight)
      ? j.weight
      : undefined

  const oldAnimePriority =
    typeof j.oldAnimePriority === 'boolean'
      ? j.oldAnimePriority
      : undefined

  const rawPref = j.titlePreference
  const titlePreference: TitlePreference =
    rawPref === 'chinese' ||
    rawPref === 'chinese_compact' ||
    rawPref === 'original' ||
    rawPref === 'traditional'
      ? rawPref
      : 'chinese'

  const traditionalChinese =
    typeof j.traditionalChinese === 'boolean'
      ? j.traditionalChinese
      : undefined

  const stripSymbols =
    typeof j.stripSymbols === 'boolean'
      ? j.stripSymbols
      : undefined

  // If this is an AniBaka anx-rule/2 pipeline rule, parse its pipeline fields
  if (isAnxRule(j)) {
    const parseSteps = (val: unknown): PipelineStep[] | undefined => {
      if (!Array.isArray(val)) return undefined
      return val.filter(
        (step): step is PipelineStep =>
          Boolean(step) &&
          typeof step === 'object' &&
          typeof (step as Record<string, unknown>).op === 'string',
      )
    }
    const headersMap = asObject(j.headers)
    const headers: Record<string, string> | undefined = headersMap
      ? Object.fromEntries(
          Object.entries(headersMap).map(([k, v]) => [k, String(v ?? '')]),
        )
      : undefined

    return {
      format: 'anx-rule/2',
      id: String(j.id ?? '').trim() || undefined,
      name,
      baseURL,
      version: String(j.version ?? '1.0'),
      iconUrl: j.iconUrl ? String(j.iconUrl).trim() : undefined,
      description: j.description ? String(j.description).trim() : undefined,
      headers,
      recipes: Array.isArray(j.recipes)
        ? j.recipes.map((r) => String(r))
        : undefined,
      search: parseSteps(j.search),
      detail: parseSteps(j.detail),
      play: parseSteps(j.play),
      useWebview: Boolean(j.useWebview ?? false),
      directConnection: Boolean(j.directConnection ?? false),
      mediaValidationTimeoutMs:
        typeof j.mediaValidationTimeoutMs === 'number'
          ? j.mediaValidationTimeoutMs
          : undefined,
      weight,
      oldAnimePriority,
      titlePreference,
      traditionalChinese,
      stripSymbols,
      muliSources: true,
      useNativePlayer: true,
      usePost: false,
      useLegacyParser: false,
      adBlockerMode: j.adBlockerMode === 'client' || j.adBlockerMode === 'server' ? j.adBlockerMode : 'none',
      searchURL: '',
      searchList: '',
      searchName: '',
      searchResult: '',
      chapterRoads: '',
      chapterResult: '',
      referer: headers?.Referer || baseURL,
    }
  }

  let searchApiConfig: ApiSearchConfig | undefined
  let chapterApiConfig: ApiChapterConfig | undefined

  if (searchMode === 'api') {
    // API rules (sorani / TvTFun) leave searchURL empty and use searchApiConfig
    if (!j.searchApiConfig) {
      throw new Error('API 搜索规则缺少 searchApiConfig')
    }
    searchApiConfig = parseApiSearchConfig(j.searchApiConfig)
  } else if (!searchURL) {
    throw new Error('插件缺少 name / baseURL / searchURL')
  }

  // release-page config (optional)
  let release: ReleaseConfig | undefined
  const r = asObject(j.release)
  if (r) {
    const pageUrl = String(r.pageUrl ?? '').trim()
    if (!pageUrl) {
      throw new Error('release.pageUrl 不能为空')
    }
    const fetchHourRaw = Number(r.fetchHour ?? 2)
    const domainIndexRaw = Number(r.domainIndex ?? 0)
    const fetchHour = Number.isFinite(fetchHourRaw)
      ? Math.max(1, Math.floor(fetchHourRaw))
      : 2
    const domainIndex = Number.isFinite(domainIndexRaw)
      ? Math.max(0, Math.floor(domainIndexRaw))
      : 0
    release = {
      pageUrl,
      fetchHour,
      domainIndex,
      xorKey: String(r.xorKey ?? ''),
      varName: String(r.varName ?? 'sites'),
    }
  }

  if (chapterMode === 'api') {
    if (!j.chapterApiConfig) {
      throw new Error('API 章节规则缺少 chapterApiConfig')
    }
    chapterApiConfig = parseApiChapterConfig(j.chapterApiConfig)
  }

  return {
    api: String(j.api ?? '1'),
    type: String(j.type ?? 'anime'),
    name,
    version: String(j.version ?? ''),
    weight,
    oldAnimePriority,
    titlePreference,
    traditionalChinese,
    stripSymbols,
    muliSources: Boolean(j.muliSources ?? true),
    useWebview: Boolean(j.useWebview ?? true),
    useNativePlayer: Boolean(j.useNativePlayer ?? true),
    usePost: Boolean(j.usePost ?? false),
    useLegacyParser: Boolean(j.useLegacyParser ?? false),
    adBlockerMode: j.adBlockerMode === 'client' || j.adBlockerMode === 'server' ? j.adBlockerMode : 'none',
    userAgent: String(j.userAgent ?? ''),
    baseURL,
    searchURL,
    searchList: String(j.searchList ?? ''),
    searchName: String(j.searchName ?? ''),
    searchResult: String(j.searchResult ?? ''),
    chapterRoads: String(j.chapterRoads ?? ''),
    chapterResult: String(j.chapterResult ?? ''),
    referer: String(j.referer ?? ''),
    requiresFullMediaProxy:
      typeof j.requiresFullMediaProxy === 'boolean'
        ? j.requiresFullMediaProxy
        : undefined,
    searchMode,
    chapterMode,
    searchApiConfig,
    chapterApiConfig,
    release,
  }
}
