import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  bestTitleSimilarity,
  extractBvid,
  parseBilibiliInput,
  matchDanmakuEpisode,
  parseEpisodeNumber,
  parseDanmakuXml,
  deduplicateDanmakuIncremental,
  titleSimilarity,
  type DanmakuAnime,
  type DanmakuComment,
  type DanmakuEpisode,
} from '@animaku/shared'
import { danmakuApi } from './plugin-api'
import {
  emptyDanmakuPools,
  enabledCount,
  flattenEnabledPools,
  poolsStatusLine,
  sourceChips,
  totalLoadedCount,
  togglePool,
  writePool,
  setPoolOffset as updatePoolOffset,
  type DanmakuPoolId,
  type DanmakuPools,
  type DanmakuSourceChip,
} from './danmaku-pools'
import type { DanmakuPanelState } from '../player/types'
import { useSourceBindingStore } from '../stores/source-bindings'

export type UseDanmakuSessionOpts = {
  /** Bangumi subject id — used for auto-match */
  bangumiId: number
  /** Episode number (0-based or 1-based) for dandan episode pick */
  episode: number
  /** Primary title for search / status */
  title: string
  /** Video source plugin name to isolate danmakuOffset per source */
  pluginName?: string
  /**
   * Extra title refs for ranking (nameCn / name / aliases).
   * When set, uses bestTitleSimilarity; otherwise titleSimilarity(title).
   */
  titleRefs?: Array<string | null | undefined>
  /**
   * Auto-match dependency extras (e.g. pageUrl / plugin name) so switching
   * source re-runs match without changing bangumiId/episode/title.
   */
  matchKey?: string | number | null
  /** Initial search box text (default: title) */
  initialKeyword?: string
  /** When false, skip auto-match effect (still allows manual panel ops) */
  autoMatch?: boolean
}

export type DanmakuSession = {
  pools: DanmakuPools
  setPools: Dispatch<SetStateAction<DanmakuPools>>
  status: string
  setStatus: (s: string) => void
  visibleComments: DanmakuComment[]
  loadedCount: number
  visibleCount: number
  chips: DanmakuSourceChip[]
  toggleSource: (id: DanmakuPoolId) => void
  setPoolOffset: (id: DanmakuPoolId, offset: number) => void
  resetPools: () => void
  /** Props bag for VideoPlayer `danmakuPanel` */
  panel: DanmakuPanelState
  /** status line for side UI */
  statusLine: string
}

type SubjectMeta = {
  bangumiId: number
  animeId: number
  episodes: DanmakuEpisode[]
}

type CachedCommentsPayload = {
  dandan: DanmakuComment[]
  dandanCount: number
  bili: DanmakuComment[]
  biliCount: number
  biliPart: string
}

/**
 * Shared danmaku panel + auto-match used by PlayPage and SubjectPage.
 * Keeps pools / search / BV / XML / generation cancel in one place.
 */
export function useDanmakuSession(opts: UseDanmakuSessionOpts): DanmakuSession {
  const {
    bangumiId,
    episode,
    title,
    pluginName = '',
    titleRefs,
    matchKey,
    initialKeyword,
    autoMatch = true,
  } = opts

  const storedBinding = useSourceBindingStore(
    (s) => (bangumiId && pluginName ? s.getBinding(bangumiId, pluginName) : undefined),
  )
  const danmakuOffset = storedBinding?.danmakuOffset ?? 0
  const setStoreDanmakuOffset = useSourceBindingStore((s) => s.setDanmakuOffset)

  const [pools, setPools] = useState<DanmakuPools>(emptyDanmakuPools)
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState(initialKeyword ?? title)
  const [animes, setAnimes] = useState<DanmakuAnime[]>([])
  const [episodes, setEpisodes] = useState<DanmakuEpisode[]>([])
  const [animeId, setAnimeId] = useState<number | ''>('')
  const [episodeId, setEpisodeId] = useState<number | ''>('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [bvInput, setBvInput] = useState('')
  const [bvPage, setBvPage] = useState(1)
  const [bilibiliBusy, setBilibiliBusy] = useState(false)
  const autoMatchGen = useRef(0)
  const autoMatchAbort = useRef<AbortController | null>(null)
  const manualOpGen = useRef(0)
  /** Live title/refs for scoring — avoid re-running match when only display title refines */
  const titleRef = useRef(title)
  titleRef.current = title
  const titleRefsRef = useRef(titleRefs)
  titleRefsRef.current = titleRefs

  /** Cached subject resolution metadata (bangumiId -> animeId + episodes) to avoid re-fetch on episode switch */
  const subjectMetaRef = useRef<SubjectMeta | null>(null)
  const currentBangumiKeyRef = useRef<string>('')
  /** Client-side episode comments in-memory cache to make back-and-forth episode switching instant (0ms) */
  const commentsCacheRef = useRef<Map<string, CachedCommentsPayload>>(new Map())

  // Keep keyword in sync when title changes (new subject / deep link)
  useEffect(() => {
    setKeyword(initialKeyword ?? title)
  }, [title, initialKeyword])

  const visibleComments = useMemo(() => flattenEnabledPools(pools), [pools])
  const loadedCount = useMemo(() => totalLoadedCount(pools), [pools])
  const visibleCount = useMemo(() => visibleComments.length, [visibleComments])
  const chips = useMemo(() => sourceChips(pools), [pools])

  const toggleSource = useCallback((id: DanmakuPoolId) => {
    setPools((p) => togglePool(p, id))
  }, [])

  const setPoolOffset = useCallback((id: DanmakuPoolId, offset: number) => {
    setPools((p) => updatePoolOffset(p, id, offset))
  }, [])

  const poolOffsets = useMemo(
    () => ({
      dandan: pools.dandan.timeOffset ?? 0,
      bilibili_auto: pools.bilibili_auto.timeOffset ?? 0,
      bilibili_manual: pools.bilibili_manual.timeOffset ?? 0,
      upload: pools.upload.timeOffset ?? 0,
    }),
    [pools],
  )

  const resetPools = useCallback(() => {
    subjectMetaRef.current = null
    currentBangumiKeyRef.current = ''
    commentsCacheRef.current.clear()
    setPools(emptyDanmakuPools())
    setStatus('')
    setAnimes([])
    setEpisodes([])
    setAnimeId('')
    setEpisodeId('')
  }, [])

  const loadCommentsByEpisodeId = useCallback(
    async (
      epId: number,
      opts?:
        | {
            targetEpNum?: number
            targetBgmId?: number
            signal?: AbortSignal
            refresh?: boolean
          }
        | AbortSignal,
    ) => {
      let signal: AbortSignal | undefined
      let targetEpNum = Math.max(0, episode + danmakuOffset)
      let targetBgmId = bangumiId
      let bypassClient = false

      if (opts instanceof AbortSignal) {
        signal = opts
      } else if (opts) {
        signal = opts.signal
        if (opts.targetEpNum !== undefined) targetEpNum = opts.targetEpNum
        if (opts.targetBgmId !== undefined) targetBgmId = opts.targetBgmId
        if (opts.refresh) bypassClient = true
      }
      if (targetEpNum < 0) targetEpNum = 0

      const cacheKey = `${targetBgmId}:${epId}:${targetEpNum}`
      const cached = !bypassClient ? commentsCacheRef.current.get(cacheKey) : undefined

      let dandanComments: DanmakuComment[] = []
      let dandanCount = 0
      let biliComments: DanmakuComment[] = []
      let biliCount = 0
      let biliPart = ''

      if (cached) {
        dandanComments = cached.dandan
        dandanCount = cached.dandanCount
        biliComments = cached.bili
        biliCount = cached.biliCount
        biliPart = cached.biliPart
      } else {
        // 1. Fetch Dandan comments and Bilibili auto comments in parallel
        const [dandanSettled, biliSettled] = await Promise.allSettled([
          danmakuApi.comments(epId, { signal, refresh: bypassClient }),
          targetBgmId > 0
            ? danmakuApi.bilibili(`bgm${targetBgmId}`, targetEpNum, { signal, refresh: bypassClient })
            : Promise.resolve(null),
        ])

        if (dandanSettled.status === 'fulfilled') {
          dandanComments = dandanSettled.value.data || []
          dandanCount = dandanSettled.value.count || dandanComments.length
        }

        if (biliSettled.status === 'fulfilled' && biliSettled.value?.data) {
          biliComments = biliSettled.value.data || []
          biliCount = biliSettled.value.count || biliComments.length
          biliPart = biliSettled.value.meta?.part || `P${targetEpNum}`
        }

        // Cache in client-side memory for instant back-and-forth switching
        commentsCacheRef.current.set(cacheKey, {
          dandan: dandanComments,
          dandanCount,
          bili: biliComments,
          biliCount,
          biliPart,
        })
      }

      // 2. Perform O(1) deduplication
      const { incremental } = deduplicateDanmakuIncremental(
        dandanComments,
        biliComments,
      )

      setPools((p) => {
        let next = writePool(
          p,
          'dandan',
          dandanComments,
          'replace',
          `ep ${epId}`,
          true,
        )
        if (biliComments.length > 0) {
          next = writePool(
            next,
            'bilibili_auto',
            biliComments,
            'replace',
            biliPart,
            true,
          )
        }
        return next
      })

      setEpisodeId(epId)

      const offsetLabel =
        danmakuOffset !== 0
          ? ` · 偏移 (${danmakuOffset > 0 ? `+${danmakuOffset}` : danmakuOffset})`
          : ''

      if (biliComments.length > 0 && incremental.length > 0) {
        setStatus(
          `弹弹 (${dandanCount}) + B站 (+${incremental.length}) 已启用${offsetLabel}`,
        )
      } else if (biliComments.length > 0) {
        setStatus(
          `弹弹 (${dandanCount}) + B站 (已去重) 已启用${offsetLabel}`,
        )
      } else {
        setStatus(`弹弹 · 已加载 ${dandanCount} 条${offsetLabel}`)
      }

      return {
        dandanCount,
        biliCount,
        incrementalCount: incremental.length,
      }
    },
    [episode, danmakuOffset, bangumiId],
  )

  function scoreAnimeLive(animeTitle: string): number {
    const refs = titleRefsRef.current
    if (refs?.length) return bestTitleSimilarity(animeTitle, refs)
    return titleSimilarity(animeTitle, titleRef.current)
  }

  // Auto-match (never blocks video resolve).
  // Deps: bangumiId + episode + matchKey only — title/titleRefs read from refs
  // so subject rename after load does not re-fan-out dandan traffic.
  useEffect(() => {
    if (!autoMatch || !bangumiId) return
    const gen = ++autoMatchGen.current
    try {
      autoMatchAbort.current?.abort()
    } catch {
      /* ignore */
    }
    const ac = new AbortController()
    autoMatchAbort.current = ac
    const { signal } = ac

    const subjectKey = `${bangumiId}:${matchKey ?? ''}`
    const isSameSubject = currentBangumiKeyRef.current === subjectKey && subjectMetaRef.current !== null

    async function loadDanmaku() {
      setStatus('匹配弹幕…')

      try {
        let meta = subjectMetaRef.current

        // 1. If subject changed, resolve anime & episodes metadata
        if (!isSameSubject || !meta) {
          currentBangumiKeyRef.current = subjectKey
          subjectMetaRef.current = null
          commentsCacheRef.current.clear()
          setAnimes([])
          setEpisodes([])
          setAnimeId('')
          setEpisodeId('')

          let resolvedEpisodes: DanmakuEpisode[] = []
          let resolvedAnimeId = 0

          // Step 1: Try BGM ID mapping directly (fast & accurate)
          try {
            const mapped = await danmakuApi.bangumiByBgm(bangumiId, { signal })
            if (mapped.data?.episodes?.length) {
              resolvedEpisodes = mapped.data.episodes
              resolvedAnimeId = mapped.data.bangumiId || 0
            }
          } catch {
            /* Fallback to search */
          }

          if (signal.aborted || gen !== autoMatchGen.current) return

          // Step 2: If BGM ID missed, fallback to title search & similarity match
          if (!resolvedEpisodes.length) {
            const searchTitle = titleRef.current
            try {
              const searchResult = await danmakuApi.search(searchTitle, { signal })
              if (searchResult.data?.length) {
                setAnimes(searchResult.data)
                let bestId = 0
                let bestScore = 0
                for (const a of searchResult.data) {
                  if (a.animeId >= 100000 || a.animeId < 2) continue
                  const score = scoreAnimeLive(a.animeTitle)
                  if (score > bestScore) {
                    bestScore = score
                    bestId = a.animeId
                  }
                }
                if (bestId && bestScore >= 0.3) {
                  resolvedAnimeId = bestId
                  const info = await danmakuApi.bangumi(bestId, { signal })
                  if (info.data?.episodes?.length) {
                    resolvedEpisodes = info.data.episodes
                  }
                }
              }
            } catch {
              /* Ignore */
            }
          }

          if (signal.aborted || gen !== autoMatchGen.current) return

          if (resolvedEpisodes.length || resolvedAnimeId) {
            meta = {
              bangumiId,
              animeId: resolvedAnimeId,
              episodes: resolvedEpisodes,
            }
            subjectMetaRef.current = meta
            setEpisodes(resolvedEpisodes)
            setAnimeId(resolvedAnimeId || '')
          }
        }

        if (signal.aborted || gen !== autoMatchGen.current) return

        // 2. Pick target episode with offset & bounds check
        if (!meta || (!meta.episodes.length && !meta.animeId)) {
          setStatus('未匹配到弹幕，点「设置」手动搜索或导入')
          return
        }

        const parsedNums = (meta.episodes || [])
          .map((e) => parseEpisodeNumber(e.episodeTitle).epNum)
          .filter((n): n is number => n !== null && Number.isFinite(n))
        const maxKnownEp = parsedNums.length > 0 ? Math.max(...parsedNums) : (meta.episodes.length || 999)

        const rawTargetEp = episode + danmakuOffset
        const effectiveTargetEp = Math.max(0, Math.min(maxKnownEp, rawTargetEp))

        let matchedEp = matchDanmakuEpisode(meta.episodes, effectiveTargetEp)

        // 3. Fallback: If target episode is missing from cached episodes (e.g. newly aired episode within 12h cache TTL),
        // automatically trigger a bypass-cache refresh from dandan upstream.
        if (!matchedEp && (effectiveTargetEp > meta.episodes.length || !meta.episodes.some((e) => matchDanmakuEpisode([e], effectiveTargetEp)))) {
          try {
            let refreshedEpisodes: DanmakuEpisode[] = []
            if (bangumiId) {
              const res = await danmakuApi.bangumiByBgm(bangumiId, { refresh: true, signal })
              if (res.data?.episodes?.length) {
                refreshedEpisodes = res.data.episodes
                meta.animeId = res.data.bangumiId || meta.animeId
              }
            } else if (meta.animeId) {
              const res = await danmakuApi.bangumi(meta.animeId, { refresh: true, signal })
              if (res.data?.episodes?.length) {
                refreshedEpisodes = res.data.episodes
              }
            }
            if (refreshedEpisodes.length) {
              meta.episodes = refreshedEpisodes
              subjectMetaRef.current = meta
              setEpisodes(refreshedEpisodes)
              matchedEp = matchDanmakuEpisode(refreshedEpisodes, effectiveTargetEp)
            }
          } catch {
            /* Keep previous matched attempt */
          }
        }

        if (signal.aborted || gen !== autoMatchGen.current) return

        const matchedEpisodeId = matchedEp?.episodeId || 0

        if (!matchedEpisodeId) {
          setStatus('未匹配到弹幕，点「设置」手动搜索或导入')
          return
        }

        await loadCommentsByEpisodeId(matchedEpisodeId, {
          targetEpNum: effectiveTargetEp,
          targetBgmId: bangumiId,
          signal,
        })
        if (signal.aborted || gen !== autoMatchGen.current) return
      } catch (e) {
        if (signal.aborted || gen !== autoMatchGen.current) return
        const msg = e instanceof Error ? e.message : '弹幕加载失败'
        if (/取消|aborted|AbortError/i.test(msg)) return
        setStatus(msg)
      }
    }

    void loadDanmaku()
    return () => {
      try {
        ac.abort()
      } catch {
        /* ignore */
      }
    }
  }, [autoMatch, bangumiId, episode, danmakuOffset, matchKey, loadCommentsByEpisodeId])

  const handleEpisodeChange = useCallback(
    async (epId: number) => {
      const gen = ++manualOpGen.current
      setStatus('加载弹幕中…')
      try {
        const targetEpObj = episodes.find((e) => e.episodeId === epId)
        let resolvedTargetNum: number | undefined
        if (targetEpObj) {
          const parsed = parseEpisodeNumber(targetEpObj.episodeTitle)
          if (parsed.epNum !== null && Number.isFinite(parsed.epNum)) {
            resolvedTargetNum = parsed.epNum
            if (bangumiId && pluginName) {
              const newOffset = parsed.epNum - episode
              setStoreDanmakuOffset(bangumiId, pluginName, newOffset)
            }
          }
        }
        await loadCommentsByEpisodeId(epId, {
          targetEpNum: resolvedTargetNum ?? Math.max(0, episode + danmakuOffset),
          targetBgmId: bangumiId,
        })
        if (gen !== manualOpGen.current) return
      } catch (e) {
        if (gen !== manualOpGen.current) return
        setStatus(e instanceof Error ? e.message : '弹幕加载失败')
      }
    },
    [episodes, episode, danmakuOffset, bangumiId, pluginName, setStoreDanmakuOffset, loadCommentsByEpisodeId],
  )

  const handleResetOffset = useCallback(async () => {
    const gen = ++manualOpGen.current
    if (bangumiId && pluginName) {
      setStoreDanmakuOffset(bangumiId, pluginName, 0)
      setStatus('已重置弹幕偏移')
      const meta = subjectMetaRef.current
      if (meta?.episodes?.length) {
        const parsedNums = meta.episodes
          .map((e) => parseEpisodeNumber(e.episodeTitle).epNum)
          .filter((n): n is number => n !== null && Number.isFinite(n))
        const maxKnownEp = parsedNums.length > 0 ? Math.max(...parsedNums) : meta.episodes.length
        const targetEp = Math.max(0, Math.min(maxKnownEp, episode))
        const ep = matchDanmakuEpisode(meta.episodes, targetEp)
        if (ep) {
          await loadCommentsByEpisodeId(ep.episodeId, {
            targetEpNum: targetEp,
            targetBgmId: bangumiId,
          })
          if (gen !== manualOpGen.current) return
        }
      }
    }
  }, [bangumiId, pluginName, episode, setStoreDanmakuOffset, loadCommentsByEpisodeId])

  const handleAnimeChange = useCallback(
    async (id: number, list?: DanmakuAnime[]) => {
      const gen = ++manualOpGen.current
      setAnimeId(id)
      setStatus('正在搜索剧集…')
      try {
        const info = await danmakuApi.bangumi(id)
        if (gen !== manualOpGen.current) return
        const eps = info.data.episodes || []
        setEpisodes(eps)
        subjectMetaRef.current = {
          bangumiId: 0,
          animeId: id,
          episodes: eps,
        }
        const name =
          (list || animes).find((a) => a.animeId === id)?.animeTitle || ''
        setStatus(
          name
            ? `${name} · ${eps.length} 集`
            : `找到 ${eps.length} 集`,
        )
        const parsedNums = eps
          .map((e) => parseEpisodeNumber(e.episodeTitle).epNum)
          .filter((n): n is number => n !== null && Number.isFinite(n))
        const maxKnownEp = parsedNums.length > 0 ? Math.max(...parsedNums) : eps.length
        const effectiveTargetEp = Math.max(0, Math.min(maxKnownEp, episode + danmakuOffset))
        const ep = matchDanmakuEpisode(eps, effectiveTargetEp) || eps[0]
        if (ep) await handleEpisodeChange(ep.episodeId)
      } catch (e) {
        if (gen !== manualOpGen.current) return
        setStatus(e instanceof Error ? e.message : '剧集加载失败')
      }
    },
    [animes, episode, danmakuOffset, handleEpisodeChange],
  )

  const handleSearch = useCallback(async () => {
    const kw = keyword.trim()
    if (kw.length < 2) {
      setStatus('番剧名称不少于 2 个字')
      return
    }
    setSearchBusy(true)
    setStatus('正在搜索番剧…')
    try {
      const search = await danmakuApi.search(kw)
      setAnimes(search.data)
      setEpisodes([])
      setAnimeId('')
      setEpisodeId('')
      if (!search.data.length) {
        setStatus('无搜索结果')
        return
      }
      setStatus(`找到 ${search.data.length} 部番剧`)
      await handleAnimeChange(search.data[0].animeId, search.data)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : '搜索失败')
    } finally {
      setSearchBusy(false)
    }
  }, [keyword, handleAnimeChange])

  const handleLoadBilibili = useCallback(async () => {
    const target = parseBilibiliInput(bvInput)
    if (!target) {
      setStatus(
        '请输入有效 B 站链接（支持 BV号 / ep番剧 / ss季度 / av号 / b23短链）',
      )
      return
    }
    const effectivePage =
      target.page && target.page > 0 ? target.page : bvPage
    if (target.page && target.page > 0 && target.page !== bvPage) {
      setBvPage(target.page)
    }

    const displayId =
      target.type === 'ep'
        ? `ep${target.epId}`
        : target.type === 'ss'
          ? `ss${target.seasonId}`
          : target.type === 'bv'
            ? target.bvid
            : target.type === 'av'
              ? `av${target.aid}`
              : '链接'

    setBilibiliBusy(true)
    setStatus(`拉取 B 站弹幕 ${displayId}…`)
    try {
      const res = await danmakuApi.bilibili(bvInput.trim(), effectivePage)
      const part = res.meta.part ? ` · ${res.meta.part}` : ''
      const meta = `${res.meta.title || displayId}${part}`
      setPools((p) => writePool(p, 'bilibili_manual', res.data, 'append', meta, true))
      setStatus(`已追加 bilibili · ${meta} · +${res.count} 条（默认叠加显示）`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'B 站弹幕拉取失败')
    } finally {
      setBilibiliBusy(false)
    }
  }, [bvInput, bvPage])

  const handleLoadXmlFile = useCallback(async (file: File) => {
    setStatus(`解析 ${file.name}…`)
    try {
      const text = await file.text()
      const list = parseDanmakuXml(text)
      if (!list.length) {
        setStatus('XML 中未找到弹幕（需 bilibili / pakku 格式）')
        return
      }
      setPools((p) => writePool(p, 'upload', list, 'append', file.name))
      setStatus(
        `已追加 用户上传 · ${file.name} · +${list.length} 条（默认叠加显示）`,
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'XML 解析失败')
    }
  }, [])

  const panel: DanmakuPanelState = useMemo(
    () => ({
      status: status || poolsStatusLine(pools),
      commentsCount: loadedCount,
      visibleCount,
      keyword,
      onKeywordChange: setKeyword,
      onSearch: () => void handleSearch(),
      searchBusy,
      animes,
      episodes,
      animeId,
      episodeId,
      onAnimeChange: (id: number) => void handleAnimeChange(id),
      onEpisodeChange: (id: number) => void handleEpisodeChange(id),
      bvInput,
      onBvInputChange: setBvInput,
      bvPage,
      onBvPageChange: setBvPage,
      onLoadBilibili: () => void handleLoadBilibili(),
      bilibiliBusy,
      onLoadXmlFile: (f: File) => void handleLoadXmlFile(f),
      sources: chips,
      onToggleSource: toggleSource,
      poolOffsets,
      onSetPoolOffset: setPoolOffset,
      danmakuOffset,
      onResetOffset: () => void handleResetOffset(),
    }),
    [
      status,
      pools,
      loadedCount,
      visibleCount,
      keyword,
      searchBusy,
      animes,
      episodes,
      animeId,
      episodeId,
      bvInput,
      bvPage,
      bilibiliBusy,
      chips,
      handleSearch,
      handleAnimeChange,
      handleEpisodeChange,
      handleLoadBilibili,
      handleLoadXmlFile,
      toggleSource,
      poolOffsets,
      setPoolOffset,
      danmakuOffset,
      handleResetOffset,
    ],
  )

  return {
    pools,
    setPools,
    status,
    setStatus,
    visibleComments,
    loadedCount,
    visibleCount,
    chips,
    toggleSource,
    setPoolOffset,
    resetPools,
    panel,
    statusLine: status || poolsStatusLine(pools),
  }
}
