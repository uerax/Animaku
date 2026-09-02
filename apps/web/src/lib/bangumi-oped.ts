/**
 * bangumi-oped 数据获取与解析
 *
 * 从 https://github.com/uerax/bangumi-oped 获取按 Bangumi Subject ID
 * 组织的 OP/ED 时间戳数据，供播放器自动跳过片头片尾。
 *
 * 通过 jsDelivr CDN 获取 GitHub 原始文件，确保国内用户可访问。
 *
 * 数据格式：ep;opStart;opEnd;edStart;edEnd
 * -1 表示该集无对应片段（哨兵值）
 */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { SkipSegment } from '@animaku/shared'
import { bangumiApi } from './bangumi'
import type { EpisodeMark } from './custom-oped-store'

// ── Types ──────────────────────────────────────────────────────────────────

export interface BgmOpedEntry {
  episode: number
  /** [op_start, op_end] in seconds, or null if no OP for this episode */
  op: [number, number] | null
  /** [ed_start, ed_end] in seconds, or null if no ED for this episode */
  ed: [number, number] | null
}

export interface BgmOpedSkip {
  skipOp: SkipSegment | null
  skipEd: SkipSegment | null
}

// ── Constants ──────────────────────────────────────────────────────────────

/** jsDelivr CDN proxy for GitHub raw files — accessible from mainland China */
const BANGUMI_OPED_BASE =
  'https://cdn.jsdelivr.net/gh/uerax/bangumi-oped@data'

const BANGUMI_OPED_STALE_MS = 30 * 60_000 // 30 min — data rarely changes

/**
 * Max allowed overshoot (seconds) between bangumi-oped timestamps
 * and the episode's actual duration from Bangumi metadata.
 * OP/ED timestamps that end past `duration_seconds + DURATION_MISMATCH_THRESHOLD_S`
 * are considered stale/mismatched and silently ignored.
 */
export const DURATION_MISMATCH_THRESHOLD_S = 4

// ── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse one line: `ep;opStart;opEnd;edStart;edEnd`
 * Returns null on malformed / empty lines.
 */
function parseOpedLine(line: string): BgmOpedEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const parts = trimmed.split(';')
  if (parts.length !== 5) return null

  const nums = parts.map((p) => {
    const n = Number(p)
    return Number.isFinite(n) ? Math.floor(n) : NaN
  })
  if (nums.some((n) => Number.isNaN(n))) return null

  const [ep, opStart, opEnd, edStart, edEnd] = nums
  if (ep < 1) return null

  return {
    episode: ep,
    op: opStart >= 0 && opEnd > opStart ? [opStart, opEnd] : null,
    ed: edStart >= 0 && edEnd > edStart ? [edStart, edEnd] : null,
  }
}

/**
 * Parse the complete data file text.
 * Returns a Map of episode → entry. Duplicate episodes: first occurrence wins.
 */
export function parseBgmOpedData(text: string): Map<number, BgmOpedEntry> {
  const map = new Map<number, BgmOpedEntry>()
  for (const line of text.split('\n')) {
    const entry = parseOpedLine(line)
    if (!entry) continue
    // First occurrence wins for duplicates (spec §4.2)
    if (!map.has(entry.episode)) {
      map.set(entry.episode, entry)
    }
  }
  return map
}

/**
 * Convert a parsed [start, end] pair into a SkipSegment.
 * null → { enabled: false, start: 0, duration: 0 } (no skip).
 */
export function toSkipSegment(
  range: [number, number] | null,
): SkipSegment {
  if (!range) return { enabled: false, start: 0, duration: 0 }
  const [start, end] = range
  return { enabled: true, start, duration: end - start }
}

/**
 * Extract skipOp / skipEd for a specific episode from parsed data.
 */
export function getSkipForEpisode(
  data: Map<number, BgmOpedEntry>,
  episode: number,
): BgmOpedSkip {
  const entry = data.get(episode)
  if (!entry) return { skipOp: null, skipEd: null }
  return {
    skipOp: entry.op ? toSkipSegment(entry.op) : null,
    skipEd: entry.ed ? toSkipSegment(entry.ed) : null,
  }
}

// ── Fetcher ────────────────────────────────────────────────────────────────

export interface BgmOpedRemoteDetail {
  /** 远端仓库中是否存在该文件 (200 OK 为 true, 404 为 false，包含空占位文件) */
  exists: boolean
  /** 远端解析出的 OP/ED 条目映射 (若为空占位文件或格式不匹配则 size 为 0) */
  data: Map<number, BgmOpedEntry>
  /** 远端原始文本 */
  rawText: string
}

/**
 * 获取指定 Bangumi Subject 的远端 OP/ED 详细信息与文件存在性
 * 精准区分「404 文件不存在」与「200 文件存在但为空占位文件/0字节」
 */
export async function fetchBangumiOpedDetail(
  subjectId: number,
  signal?: AbortSignal,
): Promise<BgmOpedRemoteDetail> {
  const url = `${BANGUMI_OPED_BASE}/${subjectId}/${subjectId}.txt`
  try {
    const res = await fetch(url, { signal })
    if (res.status === 404) {
      return { exists: false, data: new Map(), rawText: '' }
    }
    if (res.ok) {
      const rawText = await res.text()
      const data = parseBgmOpedData(rawText)
      return { exists: true, data, rawText }
    }
  } catch {
    // network or abort error
  }
  return { exists: false, data: new Map(), rawText: '' }
}

/**
 * Fetch and parse the OP/ED data file for a given Bangumi Subject ID.
 * Returns parsed Map or null on any failure (404, network, empty file, parse error).
 */
export async function fetchBangumiOpedData(
  subjectId: number,
  signal?: AbortSignal,
): Promise<Map<number, BgmOpedEntry> | null> {
  const detail = await fetchBangumiOpedDetail(subjectId, signal)
  return detail.exists && detail.data.size > 0 ? detail.data : null
}

// ── React Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch bangumi-oped data for a subject (React Query).
 * Cache key: ['bangumi-oped', subjectId]
 * Only fires when `enabled` is true and subjectId > 0.
 */
export function useBangumiOpedData(
  subjectId: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['bangumi-oped', subjectId],
    queryFn: ({ signal }) => fetchBangumiOpedData(subjectId, signal),
    staleTime: BANGUMI_OPED_STALE_MS,
    gcTime: BANGUMI_OPED_STALE_MS * 2,
    enabled: enabled && Number.isFinite(subjectId) && subjectId > 0,
  })
}

/**
 * Derive effective skipOp/skipEd by merging bangumi-oped data
 * with manual PlayerSettings.
 *
 *   If bangumi-oped data exists for this episode's segment → use it
 *     (unless timestamps exceed episode duration_seconds by >4s → fall back).
 *   Otherwise → fall back to manual settings.
 *
 * @param episodeDurationSeconds Bangumi metadata duration for this episode;
 *   when missing (0/NaN) the check is skipped and bangumi-oped data is trusted.
 */
export function useResolvedOpedSkip(
  data: Map<number, BgmOpedEntry> | null | undefined,
  episode: number,
  _manualSkipOp: SkipSegment,
  _manualSkipEd: SkipSegment,
  episodeDurationSeconds?: number,
  preferBangumiOped = true,
  localMark?: EpisodeMark,
): { skipOp: SkipSegment; skipEd: SkipSegment } {
  return useMemo(() => {
    // If bangumi-oped option is turned off by user, completely disable OP/ED skip
    if (!preferBangumiOped) {
      return {
        skipOp: { enabled: false, start: 0, duration: 0 },
        skipEd: { enabled: false, start: 0, duration: 0 },
      }
    }

    // 1. 本地打标覆盖具有最高优先级 (Full Local Override)
    let localSkipOp: SkipSegment | null = null
    let localSkipEd: SkipSegment | null = null

    if (localMark) {
      if (localMark.noOp) {
        localSkipOp = { enabled: false, start: 0, duration: 0 }
      } else if (localMark.op) {
        localSkipOp = toSkipSegment(localMark.op)
      }

      if (localMark.noEd) {
        localSkipEd = { enabled: false, start: 0, duration: 0 }
      } else if (localMark.ed) {
        localSkipEd = toSkipSegment(localMark.ed)
      }
    }

    // 2. 远程官方数据
    const resolved = data ? getSkipForEpisode(data, episode) : { skipOp: null, skipEd: null }
    const validDuration =
      Number.isFinite(episodeDurationSeconds) &&
      (episodeDurationSeconds ?? 0) > 0
        ? episodeDurationSeconds!
        : 0

    // OP: 本地若有打标则直接使用本地，否则使用官方数据
    let skipOp: SkipSegment | null = localSkipOp ?? resolved.skipOp
    if (
      skipOp &&
      validDuration &&
      skipOp.start + skipOp.duration - validDuration >
        DURATION_MISMATCH_THRESHOLD_S
    ) {
      skipOp = null
    }

    // ED: 本地若有打标则直接使用本地，否则使用官方数据
    let skipEd: SkipSegment | null = localSkipEd ?? resolved.skipEd
    if (
      skipEd &&
      validDuration &&
      skipEd.start + skipEd.duration - validDuration >
        DURATION_MISMATCH_THRESHOLD_S
    ) {
      skipEd = null
    }

    return {
      skipOp: skipOp ?? { enabled: false, start: 0, duration: 0 },
      skipEd: skipEd ?? { enabled: false, start: 0, duration: 0 },
    }
  }, [data, episode, episodeDurationSeconds, preferBangumiOped, localMark])
}

/**
 * Fetch Bangumi episode metadata for a subject and build a Map of
 * episode number → duration_seconds.
 *
 * Only fires when `enabled` is true.  Returns undefined while loading,
 * null on failure, and the Map on success.
 */
export function useBangumiEpisodesDuration(
  subjectId: number,
  enabled: boolean,
): Map<number, number> | undefined {
  const query = useQuery({
    queryKey: ['bangumi-episodes-duration', subjectId],
    queryFn: async ({ signal }) => {
      const res = await bangumiApi.episodes(subjectId, { signal })
      const episodes = res.data ?? []
      const map = new Map<number, number>()
      for (const ep of episodes) {
        const n = ep.ep ?? ep.sort
        if (n > 0 && ep.duration_seconds > 0) {
          // First occurrence wins (may have SP/OP/ED rows mixed in)
          if (!map.has(n)) map.set(n, ep.duration_seconds)
        }
      }
      return map
    },
    staleTime: 60 * 60_000, // 1h — episode metadata rarely changes
    gcTime: 6 * 60 * 60_000,
    enabled: enabled && Number.isFinite(subjectId) && subjectId > 0,
  })
  return query.data
}