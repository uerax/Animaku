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
  matchDanmakuEpisode,
  parseDanmakuXml,
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
  type DanmakuPoolId,
  type DanmakuPools,
  type DanmakuSourceChip,
} from './danmaku-pools'
import type { DanmakuPanelState } from '../player/VideoPlayer'

export type UseDanmakuSessionOpts = {
  /** Bangumi subject id — used for auto-match */
  bangumiId: number
  /** Episode number (1-based) for dandan episode pick */
  episode: number
  /** Primary title for search / status */
  title: string
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

/**
 * Shared danmaku panel + auto-match used by PlayPage and SubjectPage.
 * Keeps pools / search / BV / XML / generation cancel in one place.
 */
export function useDanmakuSession(opts: UseDanmakuSessionOpts): DanmakuSession {
  const {
    bangumiId,
    episode,
    title,
    titleRefs,
    matchKey,
    initialKeyword,
    autoMatch = true,
  } = opts

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
  /** Live title/refs for scoring — avoid re-running match when only display title refines */
  const titleRef = useRef(title)
  titleRef.current = title
  const titleRefsRef = useRef(titleRefs)
  titleRefsRef.current = titleRefs

  /** Cached subject resolution metadata (bangumiId -> animeId + episodes) to avoid re-fetch on episode switch */
  const subjectMetaRef = useRef<SubjectMeta | null>(null)
  const currentBangumiKeyRef = useRef<string>('')
  /** Client-side episode comments in-memory cache to make back-and-forth episode switching instant */
  const commentsCacheRef = useRef<Map<number, { data: DanmakuComment[]; count: number }>>(new Map())

  // Keep keyword in sync when title changes (new subject / deep link)
  useEffect(() => {
    setKeyword(initialKeyword ?? title)
  }, [title, initialKeyword])

  const visibleComments = useMemo(() => flattenEnabledPools(pools), [pools])
  const loadedCount = useMemo(() => totalLoadedCount(pools), [pools])
  const visibleCount = useMemo(() => enabledCount(pools), [pools])
  const chips = useMemo(() => sourceChips(pools), [pools])

  const toggleSource = useCallback((id: DanmakuPoolId) => {
    setPools((p) => togglePool(p, id))
  }, [])

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
    async (epId: number, signal?: AbortSignal) => {
      const cached = commentsCacheRef.current.get(epId)
      if (cached) {
        setPools((p) =>
          writePool(p, 'dandan', cached.data, 'replace', `ep ${epId}`),
        )
        setEpisodeId(epId)
        setStatus(`弹弹 · 已加载 ${cached.count} 条（其它源保留）`)
        return cached
      }

      const comments = await danmakuApi.comments(epId, { signal })
      if (commentsCacheRef.current.size > 100) {
        const firstKey = commentsCacheRef.current.keys().next().value
        if (firstKey !== undefined) commentsCacheRef.current.delete(firstKey)
      }
      commentsCacheRef.current.set(epId, comments)

      setPools((p) =>
        writePool(p, 'dandan', comments.data, 'replace', `ep ${epId}`),
      )
      setEpisodeId(epId)
      setStatus(`弹弹 · 已加载 ${comments.count} 条（其它源保留）`)
      return comments
    },
    [],
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

        // 2. Pick target episode
        if (!meta || (!meta.episodes.length && !meta.animeId)) {
          setStatus('未匹配到弹幕，点「设置」手动搜索或导入')
          return
        }

        let matchedEp = matchDanmakuEpisode(meta.episodes, episode)

        // 3. Fallback: If target episode is missing from cached episodes (e.g. newly aired episode within 12h cache TTL),
        // automatically trigger a bypass-cache refresh from dandan upstream.
        if (!matchedEp && (episode > meta.episodes.length || !meta.episodes.some((e) => matchDanmakuEpisode([e], episode)))) {
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
              matchedEp = matchDanmakuEpisode(refreshedEpisodes, episode)
            }
          } catch {
            /* Keep previous matched attempt */
          }
        }

        if (signal.aborted || gen !== autoMatchGen.current) return

        let matchedEpisodeId = matchedEp?.episodeId || 0

        // Fallback for custom animeId without structured episodes
        if (!matchedEpisodeId && meta.animeId) {
          matchedEpisodeId = Number(
            `${meta.animeId}${String(episode).padStart(4, '0')}`,
          )
        }

        if (!matchedEpisodeId) {
          setStatus('未匹配到弹幕，点「设置」手动搜索或导入')
          return
        }

        await loadCommentsByEpisodeId(matchedEpisodeId, signal)
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
  }, [autoMatch, bangumiId, episode, matchKey, loadCommentsByEpisodeId])

  const handleEpisodeChange = useCallback(
    async (epId: number) => {
      setStatus('加载弹幕中…')
      try {
        await loadCommentsByEpisodeId(epId)
      } catch (e) {
        setStatus(e instanceof Error ? e.message : '弹幕加载失败')
      }
    },
    [loadCommentsByEpisodeId],
  )

  const handleAnimeChange = useCallback(
    async (id: number, list?: DanmakuAnime[]) => {
      setAnimeId(id)
      setStatus('正在搜索剧集…')
      try {
        const info = await danmakuApi.bangumi(id)
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
        const ep = matchDanmakuEpisode(eps, episode) || eps[0]
        if (ep) await handleEpisodeChange(ep.episodeId)
      } catch (e) {
        setStatus(e instanceof Error ? e.message : '剧集加载失败')
      }
    },
    [animes, episode, handleEpisodeChange],
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
    const bvid = extractBvid(bvInput)
    if (!bvid) {
      setStatus('请输入有效 BV 号或视频链接')
      return
    }
    setBilibiliBusy(true)
    setStatus(`拉取 B 站弹幕 ${bvid}…`)
    try {
      const res = await danmakuApi.bilibili(bvid, bvPage)
      const part = res.meta.part ? ` · ${res.meta.part}` : ''
      const meta = `${res.meta.title || bvid}${part}`
      setPools((p) => writePool(p, 'bilibili', res.data, 'append', meta))
      setStatus(`已追加 B站 · ${meta} · +${res.count} 条（默认叠加显示）`)
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
    resetPools,
    panel,
    statusLine: status || poolsStatusLine(pools),
  }
}
