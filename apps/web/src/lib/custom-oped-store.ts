/**
 * 本地 OP/ED 打标持久化与合并管理
 *
 * 核心机制：
 * 1. 本地打标数据持久化在 localStorage ('animaku:custom-oped-marks')；
 * 2. 本地数据对该集具有绝对最高优先级，直接覆盖官方旧数据或补全新集数；
 * 3. 支持 90s 默认推算与二次校准、泡面番 30s/60s 预设、毫秒级微调；
 * 4. 内置安全长度检测，0 Token 依赖直达 GitHub PR 或一键复制。
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BgmOpedEntry } from './bangumi-oped'

export interface EpisodeMark {
  /** [op_start, op_end] in seconds, or null */
  op: [number, number] | null
  /** [ed_start, ed_end] in seconds, or null */
  ed: [number, number] | null
  /** true 表示确定无 OP (-1;-1) */
  noOp?: boolean
  /** true 表示确定无 ED (-1;-1) */
  noEd?: boolean
  /** 上次更新时间戳 */
  updatedAt?: number
}

export interface SubjectCustomOped {
  subjectId: number
  subjectName?: string
  totalEpisodes?: number
  /** 默认推算时长（默认 90 秒，泡面番可设为 30/45/60 等） */
  defaultDuration?: number
  episodes: Record<number, EpisodeMark>
  updatedAt: number
}

interface CustomOpedState {
  subjects: Record<number, SubjectCustomOped>
  /** 获取某番剧的所有标记 */
  getSubjectMarks: (subjectId: number) => SubjectCustomOped | undefined
  /** 获取某集标记 */
  getEpisodeMark: (subjectId: number, episode: number) => EpisodeMark | undefined
  /** 标记 OP 开始（自动预设 +defaultDuration） */
  markOpStart: (
    subjectId: number,
    episode: number,
    currentTime: number,
    duration?: number,
    subjectName?: string,
    totalEpisodes?: number,
  ) => void
  /** 标记 OP 结束（二次校准终点） */
  markOpEnd: (subjectId: number, episode: number, currentTime: number) => void
  /** 标记 ED 开始（自动预设 +defaultDuration） */
  markEdStart: (
    subjectId: number,
    episode: number,
    currentTime: number,
    duration?: number,
    subjectName?: string,
    totalEpisodes?: number,
  ) => void
  /** 标记 ED 结束（二次校准终点） */
  markEdEnd: (subjectId: number, episode: number, currentTime: number) => void
  /** 手动直接设置 OP 区间 */
  setOpRange: (subjectId: number, episode: number, op: [number, number] | null) => void
  /** 手动直接设置 ED 区间 */
  setEdRange: (subjectId: number, episode: number, ed: [number, number] | null) => void
  /** 标记本集无 OP */
  setNoOp: (subjectId: number, episode: number, noOp: boolean) => void
  /** 标记本集无 ED */
  setNoEd: (subjectId: number, episode: number, noEd: boolean) => void
  /** 微调 OP 时间 */
  nudgeOp: (
    subjectId: number,
    episode: number,
    target: 'start' | 'end' | 'both',
    delta: number,
  ) => void
  /** 微调 ED 时间 */
  nudgeEd: (
    subjectId: number,
    episode: number,
    target: 'start' | 'end' | 'both',
    delta: number,
  ) => void
  /** 设置番剧级默认推算时长 */
  setSubjectDefaultDuration: (subjectId: number, duration: number) => void
  /** 清除单集打标 */
  clearEpisodeMark: (subjectId: number, episode: number) => void
  /** 清除单番全部打标 */
  clearSubjectMarks: (subjectId: number) => void
  /** 清除所有本地打标 */
  clearAllMarks: () => void
}

export const useCustomOpedStore = create<CustomOpedState>()(
  persist(
    (set, get) => ({
      subjects: {},

      getSubjectMarks: (subjectId) => {
        return get().subjects[subjectId]
      },

      getEpisodeMark: (subjectId, episode) => {
        return get().subjects[subjectId]?.episodes[episode]
      },

      markOpStart: (
        subjectId,
        episode,
        currentTime,
        duration,
        subjectName,
        totalEpisodes,
      ) => {
        const start = Math.max(0, Math.round(currentTime))
        const sub = get().subjects[subjectId]
        const dur = duration ?? sub?.defaultDuration ?? 90
        const end = start + dur

        set((state) => {
          const currentSub = state.subjects[subjectId] ?? {
            subjectId,
            subjectName: subjectName || '',
            totalEpisodes: totalEpisodes || 0,
            defaultDuration: 90,
            episodes: {},
            updatedAt: Date.now(),
          }

          const currentEp = currentSub.episodes[episode] ?? {
            op: null,
            ed: null,
          }

          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...currentSub,
                subjectName: subjectName || currentSub.subjectName,
                totalEpisodes: totalEpisodes || currentSub.totalEpisodes,
                updatedAt: Date.now(),
                episodes: {
                  ...currentSub.episodes,
                  [episode]: {
                    ...currentEp,
                    op: [start, end],
                    noOp: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      markOpEnd: (subjectId, episode, currentTime) => {
        const end = Math.max(0, Math.round(currentTime))
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode]
          if (!ep || !ep.op) return state

          const start = ep.op[0]
          if (end <= start) return state

          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    op: [start, end],
                    noOp: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      markEdStart: (
        subjectId,
        episode,
        currentTime,
        duration,
        subjectName,
        totalEpisodes,
      ) => {
        const start = Math.max(0, Math.round(currentTime))
        const sub = get().subjects[subjectId]
        const dur = duration ?? sub?.defaultDuration ?? 90
        const end = start + dur

        set((state) => {
          const currentSub = state.subjects[subjectId] ?? {
            subjectId,
            subjectName: subjectName || '',
            totalEpisodes: totalEpisodes || 0,
            defaultDuration: 90,
            episodes: {},
            updatedAt: Date.now(),
          }

          const currentEp = currentSub.episodes[episode] ?? {
            op: null,
            ed: null,
          }

          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...currentSub,
                subjectName: subjectName || currentSub.subjectName,
                totalEpisodes: totalEpisodes || currentSub.totalEpisodes,
                updatedAt: Date.now(),
                episodes: {
                  ...currentSub.episodes,
                  [episode]: {
                    ...currentEp,
                    ed: [start, end],
                    noEd: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      markEdEnd: (subjectId, episode, currentTime) => {
        const end = Math.max(0, Math.round(currentTime))
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode]
          if (!ep || !ep.ed) return state

          const start = ep.ed[0]
          if (end <= start) return state

          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    ed: [start, end],
                    noEd: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      setOpRange: (subjectId, episode, op) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode] ?? { op: null, ed: null }
          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    op,
                    noOp: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      setEdRange: (subjectId, episode, ed) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode] ?? { op: null, ed: null }
          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    ed,
                    noEd: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      setNoOp: (subjectId, episode, noOp) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode] ?? { op: null, ed: null }
          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    noOp,
                    op: noOp ? null : ep.op,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      setNoEd: (subjectId, episode, noEd) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode] ?? { op: null, ed: null }
          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    noEd,
                    ed: noEd ? null : ep.ed,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      nudgeOp: (subjectId, episode, target, delta) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode]
          if (!ep || !ep.op) return state

          let [start, end] = ep.op
          if (target === 'start') {
            start = Math.max(0, start + delta)
          } else if (target === 'end') {
            end = Math.max(start + 1, end + delta)
          } else {
            start = Math.max(0, start + delta)
            end = Math.max(start + 1, end + delta)
          }

          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    op: [start, end],
                    noOp: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      nudgeEd: (subjectId, episode, target, delta) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const ep = sub.episodes[episode]
          if (!ep || !ep.ed) return state

          let [start, end] = ep.ed
          if (target === 'start') {
            start = Math.max(0, start + delta)
          } else if (target === 'end') {
            end = Math.max(start + 1, end + delta)
          } else {
            start = Math.max(0, start + delta)
            end = Math.max(start + 1, end + delta)
          }

          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                updatedAt: Date.now(),
                episodes: {
                  ...sub.episodes,
                  [episode]: {
                    ...ep,
                    ed: [start, end],
                    noEd: false,
                    updatedAt: Date.now(),
                  },
                },
              },
            },
          }
        })
      },

      setSubjectDefaultDuration: (subjectId, duration) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                defaultDuration: duration,
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      clearEpisodeMark: (subjectId, episode) => {
        set((state) => {
          const sub = state.subjects[subjectId]
          if (!sub) return state
          const rest = { ...sub.episodes }
          delete rest[episode]
          return {
            subjects: {
              ...state.subjects,
              [subjectId]: {
                ...sub,
                episodes: rest,
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      clearSubjectMarks: (subjectId) => {
        set((state) => {
          const rest = { ...state.subjects }
          delete rest[subjectId]
          return { subjects: rest }
        })
      },

      clearAllMarks: () => {
        set({ subjects: {} })
      },
    }),
    {
      name: 'animaku:custom-oped-marks',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

// ── 工具函数与 Diff 分析器 ──────────────────────────────────────────────────

export type EpisodeSourceType =
  | 'official' // 官方原有数据（未被本地修改）
  | 'user-new' // 用户本地新增的集数
  | 'user-override' // 用户本地修改/纠错的集数
  | 'unmarked' // 尚未打标

export interface EpisodeDiffInfo {
  episode: number
  source: EpisodeSourceType
  opFormatted: string
  edFormatted: string
  detail: string
  isChanged: boolean
}

export interface SubjectDiffResult {
  addedEpisodes: number[]
  modifiedEpisodes: number[]
  unchangedEpisodes: number[]
  diffMap: Record<number, EpisodeDiffInfo>
  commitMessage: string
  prSummaryText: string
  totalChangedCount: number
}

function formatRangeList(eps: number[]): string {
  if (eps.length === 0) return ''
  const sorted = [...eps].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let prev = sorted[0]

  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
    } else {
      if (start === prev) {
        ranges.push(String(start))
      } else {
        ranges.push(`${start}-${prev}`)
      }
      start = cur
      prev = cur
    }
  }
  return ranges.join(', ')
}

/**
 * 深度对比官方数据与本地打标数据，识别出新增、修正与官方未改集数
 */
export function diffSubjectOped(
  subjectId: number,
  officialData: Map<number, BgmOpedEntry> | null | undefined,
  localMarks: Record<number, EpisodeMark> | undefined,
  totalEpisodes = 12,
): SubjectDiffResult {
  const addedEpisodes: number[] = []
  const modifiedEpisodes: number[] = []
  const unchangedEpisodes: number[] = []
  const diffMap: Record<number, EpisodeDiffInfo> = {}

  let maxEp = totalEpisodes
  if (officialData) {
    for (const ep of officialData.keys()) maxEp = Math.max(maxEp, ep)
  }
  if (localMarks) {
    for (const ep of Object.keys(localMarks)) maxEp = Math.max(maxEp, Number(ep))
  }

  for (let ep = 1; ep <= maxEp; ep++) {
    const official = officialData?.get(ep)
    const local = localMarks?.[ep]

    const hasLocal = Boolean(
      local && (local.op || local.ed || local.noOp || local.noEd),
    )
    const hasOfficial = Boolean(official && (official.op || official.ed))

    if (!hasLocal && !hasOfficial) {
      diffMap[ep] = {
        episode: ep,
        source: 'unmarked',
        opFormatted: '--',
        edFormatted: '--',
        detail: '未打标',
        isChanged: false,
      }
      continue
    }

    if (hasLocal && !hasOfficial) {
      // 官方无，本地新增
      addedEpisodes.push(ep)
      diffMap[ep] = {
        episode: ep,
        source: 'user-new',
        opFormatted: local?.noOp ? '无' : local?.op ? `${local.op[0]}s~${local.op[1]}s` : '--',
        edFormatted: local?.noEd ? '无' : local?.ed ? `${local.ed[0]}s~${local.ed[1]}s` : '--',
        detail: '本地新增',
        isChanged: true,
      }
      continue
    }

    if (!hasLocal && hasOfficial) {
      // 本地未动，沿用官方
      unchangedEpisodes.push(ep)
      diffMap[ep] = {
        episode: ep,
        source: 'official',
        opFormatted: official?.op ? `${official.op[0]}s~${official.op[1]}s` : '无',
        edFormatted: official?.ed ? `${official.ed[0]}s~${official.ed[1]}s` : '无',
        detail: '官方数据',
        isChanged: false,
      }
      continue
    }

    // 两者均存在，比对是否有差异
    const opEqual =
      (local?.noOp && !official?.op) ||
      (!local?.noOp &&
        !local?.op &&
        !official?.op) ||
      (local?.op &&
        official?.op &&
        local.op[0] === official.op[0] &&
        local.op[1] === official.op[1])

    const edEqual =
      (local?.noEd && !official?.ed) ||
      (!local?.noEd &&
        !local?.ed &&
        !official?.ed) ||
      (local?.ed &&
        official?.ed &&
        local.ed[0] === official.ed[0] &&
        local.ed[1] === official.ed[1])

    if (opEqual && edEqual) {
      unchangedEpisodes.push(ep)
      diffMap[ep] = {
        episode: ep,
        source: 'official',
        opFormatted: official?.op ? `${official.op[0]}s~${official.op[1]}s` : '无',
        edFormatted: official?.ed ? `${official.ed[0]}s~${official.ed[1]}s` : '无',
        detail: '与官方一致',
        isChanged: false,
      }
    } else {
      modifiedEpisodes.push(ep)
      diffMap[ep] = {
        episode: ep,
        source: 'user-override',
        opFormatted: local?.noOp ? '无' : local?.op ? `${local.op[0]}s~${local.op[1]}s` : '--',
        edFormatted: local?.noEd ? '无' : local?.ed ? `${local.ed[0]}s~${local.ed[1]}s` : '--',
        detail: '本地修正',
        isChanged: true,
      }
    }
  }

  // 构造语义化 Commit Message 与 PR 摘要
  let commitMessage = `feat(data): update OP/ED for subject ${subjectId}`
  const summaryParts: string[] = []

  if (addedEpisodes.length > 0 && modifiedEpisodes.length === 0) {
    commitMessage = `feat(data): add OP/ED for subject ${subjectId} (ep ${formatRangeList(addedEpisodes)})`
    summaryParts.push(`新增集数: ${formatRangeList(addedEpisodes)}`)
  } else if (modifiedEpisodes.length > 0 && addedEpisodes.length === 0) {
    commitMessage = `fix(data): correct OP/ED for subject ${subjectId} (ep ${formatRangeList(modifiedEpisodes)})`
    summaryParts.push(`修正集数: ${formatRangeList(modifiedEpisodes)}`)
  } else if (addedEpisodes.length > 0 && modifiedEpisodes.length > 0) {
    commitMessage = `feat(data): update OP/ED for subject ${subjectId} (+ep ${formatRangeList(addedEpisodes)}, ~ep ${formatRangeList(modifiedEpisodes)})`
    summaryParts.push(
      `新增集数: ${formatRangeList(addedEpisodes)}`,
      `修正集数: ${formatRangeList(modifiedEpisodes)}`,
    )
  } else {
    summaryParts.push('未检测到实质性变更')
  }

  return {
    addedEpisodes,
    modifiedEpisodes,
    unchangedEpisodes,
    diffMap,
    commitMessage,
    prSummaryText: summaryParts.join('；'),
    totalChangedCount: addedEpisodes.length + modifiedEpisodes.length,
  }
}

/**
 * 合并官方数据与本地打标数据（本地直接覆盖），生成标准 bangumi-oped txt 格式
 * 保证遍历官方与本地所有集数的并集，每集 OP/ED 优先采用本地最新标记，未修改项平滑保留官方数据
 * 每行格式：ep;opStart;opEnd;edStart;edEnd
 */
export function buildBangumiOpedContent(
  officialData: Map<number, BgmOpedEntry> | null | undefined,
  localMarks: Record<number, EpisodeMark> | undefined,
): string {
  const allEps = new Set<number>()
  if (officialData) {
    for (const ep of officialData.keys()) {
      if (Number.isFinite(ep) && ep > 0) allEps.add(ep)
    }
  }
  if (localMarks) {
    for (const epStr of Object.keys(localMarks)) {
      const ep = Number(epStr)
      if (Number.isFinite(ep) && ep > 0) allEps.add(ep)
    }
  }

  const sortedEps = Array.from(allEps).sort((a, b) => a - b)
  return sortedEps
    .map((ep) => {
      const official = officialData?.get(ep)
      const local = localMarks?.[ep]

      // OP: 优先本地标记（含 noOp: true 明确无 OP）；本地未操作则保留官方
      let op: [number, number] | null = null
      if (local?.noOp) {
        op = null
      } else if (local?.op) {
        op = local.op
      } else if (official?.op) {
        op = official.op
      }

      // ED: 优先本地标记（含 noEd: true 明确无 ED）；本地未操作则保留官方
      let ed: [number, number] | null = null
      if (local?.noEd) {
        ed = null
      } else if (local?.ed) {
        ed = local.ed
      } else if (official?.ed) {
        ed = official.ed
      }

      const opStart = op ? Math.round(op[0]) : -1
      const opEnd = op ? Math.round(op[1]) : -1
      const edStart = ed ? Math.round(ed[0]) : -1
      const edEnd = ed ? Math.round(ed[1]) : -1
      return `${ep};${opStart};${opEnd};${edStart};${edEnd}`
    })
    .join('\n')
}

/**
 * 单番提交至 GitHub
 *
 * 核心机制注意：
 * 1. 新建文件 (/new/data?filename=...&value=...)：GitHub 原生支持从 value 参数预填文件内容；
 * 2. 编辑已有文件 (/edit/data/...)：GitHub 出于版本一致性，会强制从远端拉取原有内容，忽略 URL 中的 value 参数。
 *    因此在编辑模式下，前端自动将最新的全量合并数据（如 1~6 集）写入剪贴板，引导用户在打开的编辑页 Ctrl+A + Ctrl+V 粘贴覆盖后提交。
 */
export async function submitSingleSubjectToGithub(
  subjectId: number,
  content: string,
  existsOnRemote: boolean,
  customCommitMsg?: string,
): Promise<{ method: 'new_file' | 'edit_file_clipboard' }> {
  const filename = `${subjectId}/${subjectId}.txt`
  const encodedContent = encodeURIComponent(content)
  const commitMsg = encodeURIComponent(
    customCommitMsg || `feat(data): update OP/ED timestamps for subject ${subjectId}`,
  )

  // 1. 始终先自动将最新的全量数据写入剪贴板
  try {
    await navigator.clipboard.writeText(content)
  } catch {
    /* ignore clipboard write errors */
  }

  // 2. 如果是新建文件：GitHub /new/ 支持 ?value= 参数预填
  if (!existsOnRemote) {
    const isSafeLength = encodedContent.length < 1500
    const targetUrl = isSafeLength
      ? `https://github.com/uerax/bangumi-oped/new/data?filename=${filename}&value=${encodedContent}&message=${commitMsg}`
      : `https://github.com/uerax/bangumi-oped/new/data?filename=${filename}&message=${commitMsg}`
    window.open(targetUrl, '_blank')
    return { method: 'new_file' }
  }

  // 3. 如果是已有文件：GitHub /edit/ 不支持 ?value=，打开编辑页并由用户粘贴
  const targetUrl = `https://github.com/uerax/bangumi-oped/edit/data/${filename}?message=${commitMsg}`
  window.open(targetUrl, '_blank')
  return { method: 'edit_file_clipboard' }
}

/**
 * 纯前端极简无依赖 ZIP 文件生成器 (Store 模式，支持创建标准 data/{subjectId}/{subjectId}.txt)
 */
export function createOpedZipBlob(
  files: { path: string; content: string }[],
): Blob {
  const parts: Uint8Array[] = []
  const centralDirectoryEntries: Uint8Array[] = []
  let offset = 0

  const encoder = new TextEncoder()

  // CRC32 Table
  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    crcTable[i] = c
  }

  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  for (const file of files) {
    const fileBytes = encoder.encode(file.content)
    const nameBytes = encoder.encode(file.path)
    const crc = crc32(fileBytes)
    const size = fileBytes.length

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true) // Local file header signature
    lv.setUint16(4, 20, true) // Version needed to extract
    lv.setUint16(6, 0, true) // General purpose bit flag
    lv.setUint16(8, 0, true) // Compression method: 0 = Store
    lv.setUint16(10, 0, true) // Last mod file time
    lv.setUint16(12, 0, true) // Last mod file date
    lv.setUint32(14, crc, true) // CRC-32
    lv.setUint32(18, size, true) // Compressed size
    lv.setUint32(22, size, true) // Uncompressed size
    lv.setUint16(26, nameBytes.length, true) // File name length
    lv.setUint16(28, 0, true) // Extra field length
    localHeader.set(nameBytes, 30)

    parts.push(localHeader)
    parts.push(fileBytes)

    // Central directory header (46 bytes + name)
    const cdHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cdHeader.buffer)
    cv.setUint32(0, 0x02014b50, true) // Central directory header signature
    cv.setUint16(4, 20, true) // Version made by
    cv.setUint16(6, 20, true) // Version needed to extract
    cv.setUint16(8, 0, true) // General purpose bit flag
    cv.setUint16(10, 0, true) // Compression method: 0 = Store
    cv.setUint16(12, 0, true) // Last mod file time
    cv.setUint16(14, 0, true) // Last mod file date
    cv.setUint32(16, crc, true) // CRC-32
    cv.setUint32(20, size, true) // Compressed size
    cv.setUint32(24, size, true) // Uncompressed size
    cv.setUint16(28, nameBytes.length, true) // File name length
    cv.setUint16(30, 0, true) // Extra field length
    cv.setUint16(32, 0, true) // File comment length
    cv.setUint16(34, 0, true) // Disk number start
    cv.setUint16(36, 0, true) // Internal file attributes
    cv.setUint32(38, 0, true) // External file attributes
    cv.setUint32(42, offset, true) // Relative offset of local header
    cdHeader.set(nameBytes, 46)

    centralDirectoryEntries.push(cdHeader)
    offset += localHeader.length + fileBytes.length
  }

  const cdOffset = offset
  let cdSize = 0
  for (const cde of centralDirectoryEntries) {
    parts.push(cde)
    cdSize += cde.length
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // EOCD signature
  ev.setUint16(4, 0, true) // Number of this disk
  ev.setUint16(6, 0, true) // Disk where central directory starts
  ev.setUint16(8, files.length, true) // Number of central directory records on this disk
  ev.setUint16(10, files.length, true) // Total number of central directory records
  ev.setUint32(12, cdSize, true) // Size of central directory
  ev.setUint32(16, cdOffset, true) // Offset of start of central directory
  ev.setUint16(20, 0, true) // ZIP comment length

  parts.push(eocd)
  return new Blob(parts as unknown as BlobPart[], { type: 'application/zip' })
}
