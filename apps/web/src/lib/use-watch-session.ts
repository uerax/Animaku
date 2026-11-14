import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  useLocation,
  useSearchParams,
  type NavigateOptions,
  type URLSearchParamsInit,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  bestTitleSimilarity,
  coverOf,
  comparePluginOrder,
  isOldAnime,
  findMatchingEpisodeIndex,
  parseEpisodeNumber,
  alignSourceToOfficial,
  resolveAlignedEpisodeNumber,
  buildPlayableSlots,
  resolveTargetSlot,
  findDefaultSourcePlugin,
  resolveTargetSourcePlugin,
  resolveBoostedPluginNames,
  type PlayableSlot,
  type BangumiItem,
  type BangumiSeed,
  type BangumiEpisode,
  type PluginMeta,
  type SearchItem,
  type Road,
  type DanmakuSettings,
  type PlayerSettings,
  type ResolvePlayResult,
  AnimeTagFilter,
} from '@animaku/shared'
import { bangumiApi } from './bangumi'
import { pluginApi } from './plugin-api'
import type { PlaybackTransit } from './playback-src'
import {
  writeRoadsForSource,
  invalidateRoadsCache,
} from './roads-cache'
import { useDanmakuSession, type DanmakuSession } from './use-danmaku-session'
import { usePluginStore, mergeOrderWithNewPlugins } from '../stores/plugins'
import { useHistoryStore } from '../stores/history'
import { useSettingsStore } from '../stores/settings'
import { useSourceBindingStore } from '../stores/source-bindings'
import { useSiteConfigStore } from '../stores/site-config'
import { EMPTY_ARRAY, FALLBACK_DANMAKU, FALLBACK_PLAYER } from './stable'
import { perfMetrics } from './performance-metrics'
import { useWatchOpedSettings } from './use-watch-oped-settings'
import {
  findCurrentSlotIndex,
  getAdjacentEpisodeSlot,
} from './watch-episode-boundaries'
import {
  RESUME_MIN_POSITION,
  formatMinutesSeconds,
  lookupResumePosition,
  lookupHistorySourceUrl,
  lookupHistoryEntryEp,
} from './watch-resume'
import {
  deriveTitleRefs,
  deriveKeywordCandidates,
  deriveDefaultKeyword,
  resolveKeywordForPlugin,
  orderSearchRows,
} from './watch-keywords'
import { useWatchHud } from './use-watch-hud'
import { useWatchNextPrefetch } from './use-watch-next-prefetch'
import { useWatchStreamResolve } from './use-watch-stream-resolve'
import { useWatchSourceSearch } from './use-watch-source-search'
import { useWatchSourceLauncher } from './use-watch-source-launcher'

export type SearchRow = {
  plugin: PluginMeta
  items: SearchItem[]
  error?: string
  pending?: boolean
  /** true after user has triggered at least one search for this plugin */
  searched?: boolean
  keyword?: string
  /** 触发频控时的倒计时解封时间戳 (ms) */
  rateLimitedUntil?: number
}

export type SourceSelection = {
  plugin: PluginMeta
  source: SearchItem
  roads: Road[]
}

export type EpisodePlay = {
  pageUrl: string
  episode: number
  entryEp?: number
  road: number
  sourceIndex?: number
  officialTitle?: string
  displayTitle?: string
  sourceTitle?: string
  isLayer2?: boolean
}

/**
 * Min title similarity before auto-picking the first ranked search hit.
 * Below this, show the list and let the user choose (avoids MacCMS wrong-show).
 */
export const AUTO_PICK_MIN_SIMILARITY = 0.55

export { findDefaultSourcePlugin, resolveTargetSourcePlugin }

export type WatchSession = {
  bangumiId: number
  title: string
  cover: string
  bangumiItem: BangumiItem | undefined
  subjectLoading: boolean
  subjectError: unknown
  keywordCandidates: string[]
  titleRefs: string[]
  sessionKeywords: Record<string, string[]>
  searchResults: SearchRow[]
  searchKeyword: string
  defaultKeyword: string
  defaultSearchEmpty: boolean
  /** Default / auto-started rule name based on user order and capability. */
  defaultSourceName: string
  selection: SourceSelection | null
  episode: EpisodePlay | null
  visibleRoad: number
  setVisibleRoad: (n: number) => void
  roadLoading: boolean
  roadError: string
  pendingSource: { pluginName: string; src: string } | null
  keywordTargetPlugin: PluginMeta | null
  setKeywordTargetPlugin: (p: PluginMeta | null) => void
  mediaSrc: string
  formatHint?: 'hls' | 'mp4'
  adBlockerMode?: import('@animaku/shared').AdBlockerMode
  playbackMode: 'direct' | 'proxy'
  /** direct | playlist-proxy (ad hybrid) | full-proxy — for WatchMeta hint */
  playbackTransit: PlaybackTransit
  playerKey: string
  resumeTime: number
  resolveLoading: boolean
  resolveError: unknown
  diagnostics: string[] | undefined
  subtitle?: import('@animaku/shared').SubtitleBundle
  subtitles?: import('@animaku/shared').SubtitleTrack[]
  fonts?: string[]
  danmakuSettings: DanmakuSettings
  playerSettings: PlayerSettings
  setDanmaku: (p: Partial<DanmakuSettings>) => void
  setPlayer: (p: Partial<PlayerSettings>) => void
  dm: DanmakuSession
  enabledPlugins: PluginMeta[]
  /**
   * Click a rule → search that plugin only (no fan-out).
   * Uses defaultKeyword when keyword omitted.
   */
  openPluginSearch: (
    plugin: PluginMeta,
    keyword?: string,
    opts?: {
      clearSelection?: boolean
      autoPickFirst?: boolean
      refresh?: boolean
      manualKeyword?: boolean
      background?: boolean
    },
  ) => Promise<void>
  searchOnePlugin: (
    plugin: PluginMeta,
    keyword: string,
    opts?: {
      clearSelection?: boolean
      autoPickFirst?: boolean
      refresh?: boolean
      manualKeyword?: boolean
      background?: boolean
    },
  ) => Promise<void>
  reSearchCurrentSource: (keyword: string) => Promise<void>
  switchToPlugin: (
    plugin: PluginMeta,
    targetItem?: SearchItem,
    opts?: { hudMessage?: string; autoFallback?: boolean },
  ) => Promise<void>
  pickSource: (plugin: PluginMeta, item: SearchItem) => Promise<void>
  slots: PlayableSlot[]
  pickSlot: (slot: PlayableSlot, roadIndex?: number) => void
  pickEpisode: (epIndex: number, roadIndex?: number) => void
  hasPrevEpisode: boolean
  hasNextEpisode: boolean
  goAdjacentEpisode: (delta: number) => void
  prefetchNextEpisode: () => void
  onProgress: (position: number, duration: number) => void
  onMediaAuthExpired: (position: number) => Promise<void>
  onMediaLoadFailed: (args: { position: number }) => void
  refetchSubject: () => void
  refetchResolve: () => void
  refreshChapters: () => Promise<void>
  hudMessage: string | null
  clearHudMessage: () => void
  bgmOpedData?: Map<number, import('./bangumi-oped').BgmOpedEntry> | null
  expectedDurationSeconds?: number
  pageUrl: string
  pluginName: string
}

/**
 * Unified cinema session on subject/play.
 * Plugin list is idle until user clicks a source — no auto fan-out.
 */
export function useWatchSession(bangumiId: number): WatchSession {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const isWatchPage = useCallback(() => {
    if (!mountedRef.current) return false
    const path = location.pathname
    return path.startsWith('/subject/') || path.startsWith('/play/')
  }, [location.pathname])

  const safeSetParams = useCallback(
    (nextInit: URLSearchParamsInit, navigateOptions?: NavigateOptions) => {
      if (!isWatchPage()) return
      let nextStr = ''
      if (nextInit instanceof URLSearchParams) {
        nextStr = nextInit.toString()
      } else if (typeof nextInit === 'string') {
        nextStr = nextInit.replace(/^\?/, '')
      } else {
        try {
          nextStr = new URLSearchParams(nextInit as any).toString()
        } catch {
          // fallback
        }
      }
      const currentStr = location.search.replace(/^\?/, '')
      if (nextStr === currentStr) return
      setParams(nextInit, navigateOptions)
    },
    [isWatchPage, location.search, setParams],
  )

  const qPlugin = params.get('plugin') || ''
  const qPageUrl = params.get('pageUrl') || ''
  const rawQEp = params.get('ep')
  const qEp =
    rawQEp !== null && rawQEp !== '' && !Number.isNaN(Number(rawQEp))
      ? Number(rawQEp)
      : undefined
  const rawQRoad = params.get('road')
  const qRoad =
    rawQRoad !== null && rawQRoad !== '' && !Number.isNaN(Number(rawQRoad))
      ? Number(rawQRoad)
      : 0

  const ensureDefaults = usePluginStore((s) => s.ensureDefaults)
  const allPlugins = usePluginStore((s) =>
    Array.isArray(s.plugins) ? s.plugins : EMPTY_ARRAY,
  )
  const pluginOrder = usePluginStore((s) =>
    Array.isArray(s.pluginOrder) ? s.pluginOrder : EMPTY_ARRAY as string[],
  )
  const playerSettings = useSettingsStore((s) => s.player ?? FALLBACK_PLAYER)
  const setPlayer = useSettingsStore((s) => s.setPlayer)

  const rawSeed = (location.state as { seed?: BangumiSeed } | null)?.seed
  const validSeed =
    rawSeed && Number(rawSeed.id) === bangumiId ? rawSeed : undefined

  const subject = useQuery({
    queryKey: ['subject', bangumiId],
    queryFn: ({ signal }) => bangumiApi.subject(bangumiId, { signal }),
    enabled: Number.isFinite(bangumiId) && bangumiId > 0,
    // Public metadata; server subject TTL 6h — keep client shorter to revalidate via HIT
    staleTime: 30 * 60_000,
    gcTime: 6 * 60 * 60_000,
  })
  const fullItem = subject.data?.data
  const resolvedItem = fullItem ?? (validSeed as unknown as BangumiItem | undefined)
  const isOld = useMemo(() => isOldAnime(resolvedItem?.airDate), [resolvedItem?.airDate])

  const bgmEpisodesQuery = useQuery({
    queryKey: ['bangumi-episodes', bangumiId],
    queryFn: ({ signal }) => bangumiApi.episodes(bangumiId, { signal }),
    enabled: Number.isFinite(bangumiId) && bangumiId > 0,
    staleTime: 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
  })

  const resolveSourceEpisodeNumber = useCallback(
    (
      roads: Array<{ data: string[]; identifier?: string[] }>,
      roadIndex: number,
      epIndex: number,
    ): number => {
      // Layer 2 fallback: pure 1-based index (no brittle number parsing)
      let epNum = epIndex + 1

      // Layer 1: Authoritative Bangumi Positional Alignment
      const bgmEps = bgmEpisodesQuery.data?.data
      const road = roads[roadIndex] || roads[0]
      const identifiers = road?.identifier
      if (bgmEps?.length && identifiers?.length) {
        const aligned = alignSourceToOfficial(identifiers, bgmEps)
        const match = resolveAlignedEpisodeNumber(aligned, epIndex)
        if (match !== null) {
          epNum = match
        }
      }
      return epNum
    },
    [bgmEpisodesQuery.data?.data],
  )

  const sourceBangumiIds = useSiteConfigStore((s) => s.defaultSettings?.sourceBangumiIds)
  const siteDefaultOrder = useSiteConfigStore((s) => s.defaultSettings?.pluginOrder)
  const boostedPluginNames = useMemo(
    () => resolveBoostedPluginNames(bangumiId, sourceBangumiIds),
    [bangumiId, sourceBangumiIds],
  )

  const effectivePluginOrder = useMemo(() => {
    if (pluginOrder.length > 0) {
      return mergeOrderWithNewPlugins(pluginOrder, allPlugins)
    }
    if (siteDefaultOrder && Array.isArray(siteDefaultOrder) && siteDefaultOrder.length > 0) {
      return mergeOrderWithNewPlugins(siteDefaultOrder, allPlugins)
    }
    return EMPTY_ARRAY as string[]
  }, [pluginOrder, siteDefaultOrder, allPlugins])

  const plugins = useMemo(() => {
    const list = allPlugins.filter((p) => Boolean(p && p.enabled !== false))
    if (!effectivePluginOrder.length) {
      return [...list].sort((a, b) => comparePluginOrder(a, b, isOld, boostedPluginNames))
    }
    const isBoosted = (name: string) => {
      const key = (name || '').toLowerCase()
      return boostedPluginNames.has(key)
    }
    const rank = new Map<string, number>()
    for (let i = 0; i < effectivePluginOrder.length; i++) {
      rank.set(effectivePluginOrder[i].toLowerCase(), i)
    }
    return [...list].sort((a, b) => {
      const hitA = isBoosted(a.name) ? 1 : 0
      const hitB = isBoosted(b.name) ? 1 : 0
      if (hitA !== hitB) return hitB - hitA
      const inOrderA = rank.has(a.name.toLowerCase())
      const inOrderB = rank.has(b.name.toLowerCase())
      if (inOrderA && inOrderB) {
        return (rank.get(a.name.toLowerCase())!) - (rank.get(b.name.toLowerCase())!)
      }
      // 某一方不在排序列表时，有效权重优先，防止新加入的高权重源被沉底
      const weightDiff = comparePluginOrder(a, b, isOld, boostedPluginNames)
      if (weightDiff !== 0) return weightDiff
      const ra = rank.get(a.name.toLowerCase()) ?? effectivePluginOrder.length
      const rb = rank.get(b.name.toLowerCase()) ?? effectivePluginOrder.length
      return ra - rb
    })
  }, [allPlugins, effectivePluginOrder, isOld, boostedPluginNames])
  const queryClient = useQueryClient()
  const upsertHistory = useHistoryStore((s) => s.upsert)
  const danmakuSettings = useSettingsStore((s) => s.danmaku ?? FALLBACK_DANMAKU)
  const setDanmaku = useSettingsStore((s) => s.setDanmaku)

  const title = resolvedItem ? resolvedItem.nameCn || resolvedItem.name || '' : ''
  const cover = resolvedItem ? coverOf(resolvedItem) : ''
  const genres = useMemo(() => {
    if (!resolvedItem?.tags || resolvedItem.tags.length === 0) return undefined
    const valid = resolvedItem.tags
      .map((t) => t.name.trim())
      .filter((t) => AnimeTagFilter.isAllowedGenre(t))
    return valid.length > 0 ? valid : undefined
  }, [resolvedItem?.tags])

  const [roadLoading, setRoadLoading] = useState(false)
  const [roadError, setRoadError] = useState('')
  const [selection, setSelection] = useState<SourceSelection | null>(null)
  const [episode, setEpisode] = useState<EpisodePlay | null>(null)
  const [visibleRoad, setVisibleRoad] = useState(0)
  const [pendingSource, setPendingSource] = useState<{
    pluginName: string
    src: string
  } | null>(null)
  const [keywordTargetPlugin, setKeywordTargetPlugin] =
    useState<PluginMeta | null>(null)
  const manualTargetPluginRef = useRef(false)
  const setManualKeywordTargetPlugin = useCallback((p: PluginMeta | null) => {
    manualTargetPluginRef.current = p !== null
    setKeywordTargetPlugin(p)
  }, [])
  /** Continue-play seek target — state (not ref) so first media mount sees it. */
  const [resumePosition, setResumePosition] = useState(0)

  const resumeDoneFor = useRef<string | null>(null)
  /** Live override after auth/proxy remount (position mid-play). */
  const resumeOverrideRef = useRef<number | null>(null)
  const chaptersGen = useRef(0)
  const chaptersAbort = useRef<AbortController | null>(null)
  const { hudMessage, setHudMessage, clearHudMessage } = useWatchHud()
  const pickSourceRef = useRef<((plugin: PluginMeta, item: SearchItem) => Promise<void>) | null>(null)

  const episodeRef = useRef<EpisodePlay | null>(null)
  episodeRef.current = episode
  const visibleRoadRef = useRef<number>(0)
  visibleRoadRef.current = visibleRoad
  const currentPlaybackPositionRef = useRef<number>(0)
  const selectionRef = useRef<SourceSelection | null>(null)

  /** Subject generation tracker to prevent stale selection/searchResults leakage on transition */
  const activeSubjectIdRef = useRef(bangumiId)
  const isSubjectTransition = activeSubjectIdRef.current !== bangumiId
  if (isSubjectTransition) {
    activeSubjectIdRef.current = bangumiId
    selectionRef.current = null
    episodeRef.current = null
  } else {
    selectionRef.current = selection
  }

  /** Auto-start default source once per subject (skip resume deep-links). */
  const defaultSearchDoneFor = useRef<number | null>(null)
  const keywordTargetPluginRef = useRef<PluginMeta | null>(null)
  keywordTargetPluginRef.current = keywordTargetPlugin
  const paramsRef = useRef(params)
  paramsRef.current = params
  const roadLoadingRef = useRef(roadLoading)
  roadLoadingRef.current = roadLoading

  const streamResolve = useWatchStreamResolve({
    bangumiId,
    title,
    selection,
    selectionRef,
    episode,
    episodeRef,
    resumePosition,
    setResumePosition,
    resumeOverrideRef,
    setHudMessage,
    continuePlay: playerSettings.continuePlay,
  })

  const titleRefs = useMemo(
    () => deriveTitleRefs(resolvedItem),
    [resolvedItem],
  )

  const activeTargetPlugin =
    keywordTargetPlugin ||
    selection?.plugin ||
    findDefaultSourcePlugin(plugins, effectivePluginOrder, isOld, boostedPluginNames)
  const preferOriginal = activeTargetPlugin?.titlePreference === 'original'

  const keywordCandidates = useMemo(
    () => deriveKeywordCandidates(resolvedItem, activeTargetPlugin, preferOriginal),
    [resolvedItem, activeTargetPlugin, preferOriginal],
  )

  /** Default search uses the display title, not the shortest stripped variant. */
  const defaultKeyword = useMemo(
    () => deriveDefaultKeyword(resolvedItem, keywordCandidates),
    [resolvedItem, keywordCandidates],
  )

  const sourceSearch = useWatchSourceSearch({
    bangumiId,
    title,
    resolvedItem,
    titleRefs,
    keywordCandidates,
    defaultKeyword,
    plugins,
    pluginOrder: effectivePluginOrder,
    isOld,
    boostedPluginNames,
    keywordTargetPlugin,
    setKeywordTargetPlugin,
    keywordTargetPluginRef,
    selection,
    selectionRef,
    setSelection,
    setEpisode,
    setRoadError,
    setHudMessage,
    pickSourceRef,
  })

  const {
    searchResults,
    searchKeyword,
    setSearchKeyword,
    sessionKeywords,
    defaultSearchEmpty,
    setDefaultSearchEmpty,
    getPluginKeyword,
    searchOnePlugin,
    openPluginSearch,
    reSearchCurrentSource,
    resetSearchState,
  } = sourceSearch

  const effectiveEntryEp =
    episode?.entryEp ??
    (episode?.sourceIndex !== undefined
      ? episode.sourceIndex + 1
      : (episode?.episode ?? (qEp !== undefined && qEp >= 0 ? qEp : 1)))

  const dm = useDanmakuSession({
    bangumiId,
    episode: effectiveEntryEp,
    title,
    pluginName: selection?.plugin.name || qPlugin || undefined,
    titleRefs,
    matchKey: episode
      ? `${selection?.plugin.name || qPlugin}|${episode.pageUrl}|${effectiveEntryEp}`
      : null,
    autoMatch: Boolean(
      (selection || qPlugin) && (episode || qPageUrl) && bangumiId && title,
    ),
  })
  const dmResetPools = dm.resetPools

  useEffect(() => {
    ensureDefaults()
  }, [ensureDefaults])

  // Full reset when bangumi changes
  useEffect(() => {
    resumeDoneFor.current = null
    defaultSearchDoneFor.current = null
    setSelection(null)
    setEpisode(null)
    setResumePosition(0)
    resumeOverrideRef.current = null
    setVisibleRoad(0)
    setRoadError('')
    setPendingSource(null)
    setRoadLoading(false)
    manualTargetPluginRef.current = false
    setKeywordTargetPlugin(null)
    resetSearchState()
    chaptersGen.current += 1
    dmResetPools()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on subject id
  }, [bangumiId])

  // Pre-select the target source: query plugin if provided, otherwise first source
  useEffect(() => {
    if (!plugins.length) return
    if (selection || manualTargetPluginRef.current) return
    const target = resolveTargetSourcePlugin(
      qPlugin,
      plugins,
      pluginOrder,
      isOld,
      (name) => usePluginStore.getState().getByName(name),
      boostedPluginNames,
    )
    if (target && target.name.toLowerCase() !== keywordTargetPlugin?.name.toLowerCase()) {
      setKeywordTargetPlugin(target)
    }
  }, [plugins, pluginOrder, isOld, boostedPluginNames, keywordTargetPlugin, selection, qPlugin])

  const pickSource = useCallback(
    async (
      plugin: PluginMeta,
      searchItem: SearchItem,
    ) => {
      if (
        !roadLoadingRef.current &&
        selectionRef.current?.plugin.name === plugin.name &&
        selectionRef.current?.source.src === searchItem.src
      ) {
        setKeywordTargetPlugin(plugin)
        return
      }

      // Capture previous playback context before resetting
      const prevEpisode = episodeRef.current
      const prevSelection = selectionRef.current
      const prevRoad = prevSelection?.roads[visibleRoadRef.current]
      const prevIdx =
        prevRoad?.data && prevEpisode?.pageUrl
          ? prevRoad.data.indexOf(prevEpisode.pageUrl)
          : prevEpisode?.sourceIndex ?? -1
      const prevEpTitle =
        prevRoad?.identifier && prevIdx >= 0
          ? prevRoad.identifier[prevIdx] || ''
          : prevEpisode?.displayTitle || ''
      const currentPosition =
        currentPlaybackPositionRef.current || resumePosition || 0

      if (prevEpisode) {
        setHudMessage(`正在切换至 ${plugin.name}…`)
      }

      const gen = ++chaptersGen.current
      try {
        chaptersAbort.current?.abort()
      } catch {
        /* ignore */
      }
      const chaptersAc = new AbortController()
      chaptersAbort.current = chaptersAc
      roadLoadingRef.current = true
      setRoadLoading(true)
      setRoadError('')
      setEpisode(null)
      setResumePosition(0)
      resumeOverrideRef.current = null
      streamResolve.resetRecoveryTracker()
      setVisibleRoad(0)
      setSelection(null)
      setPendingSource({ pluginName: plugin.name, src: searchItem.src })
      setKeywordTargetPlugin(plugin)
      dmResetPools()
      try {
        const res = await pluginApi.chapters(plugin, searchItem.src, {
          signal: chaptersAc.signal,
          title: searchItem.name || title,
          bangumiId,
        })
        if (!isWatchPage()) return
        if (chaptersGen.current !== gen) return
        const roads = res.data.roads
        if (!roads.length || !roads[0]?.data?.length) {
          invalidateRoadsCache(bangumiId, plugin.name, searchItem.src)
          const errorMsg =
            res.data.diagnostics?.slice(0, 2).join('；') || '未解析到分集'
          setRoadError(errorMsg)
          setSelection(null)
          setPendingSource(null)
          useSourceBindingStore.getState().removeBinding(bangumiId, plugin.name)
          throw new Error(errorMsg)
        }
        writeRoadsForSource(bangumiId, plugin.name, searchItem.src, roads)

        // Persistent binding
        useSourceBindingStore
          .getState()
          .setBinding(
            bangumiId,
            plugin.name,
            { sourceUrl: searchItem.src, title: searchItem.name },
            titleRefs,
          )

        // Episode alignment & seamless progress inheritance via PlayableSlot
        let targetRoadIdx = 0
        if (qRoad && qRoad >= 0 && qRoad < roads.length) {
          targetRoadIdx = qRoad
        }

        const targetRoad = roads[targetRoadIdx] || roads[0]
        const bgmEps = bgmEpisodesQuery.data?.data
        const roadSlots = buildPlayableSlots(targetRoad, bgmEps)
        let targetSlot: PlayableSlot | null = null

        if (prevEpisode) {
          // 1. Try matching by canonicalEp first (100% immune to title & index differences)
          targetSlot = roadSlots.find((s) => s.canonicalEp === prevEpisode.episode) ?? null

          // 2. Fallback to title matching if canonicalEp missed
          if (!targetSlot && prevEpTitle) {
            const matchIdx = findMatchingEpisodeIndex(
              prevEpTitle,
              targetRoad?.identifier || [],
              -1,
            )
            if (matchIdx >= 0) {
              targetSlot = roadSlots.find((s) => s.sourceIndex === matchIdx) ?? null
            }
          }

          // 3. Fallback to physical index within bounds
          if (!targetSlot && roadSlots.length > 0) {
            const prevPhysical =
              prevEpisode.sourceIndex ??
              (prevEpisode.episode === 0 ? 0 : Math.max(0, prevEpisode.episode - 1))
            const fallbackIdx = Math.max(0, Math.min(prevPhysical, roadSlots.length - 1))
            targetSlot = roadSlots[fallbackIdx] || roadSlots[0]
          }
        } else if (qEp !== undefined && qEp >= 0) {
          // Explicit deep-link episode specified in URL (e.g. ?ep=0 or ?ep=1)
          const entryEpHint = lookupHistoryEntryEp(bangumiId, qEp)
          targetSlot = resolveTargetSlot(roadSlots, qEp, entryEpHint, bgmEps) ?? null
        }

        setSelection({ plugin, source: searchItem, roads })
        setDefaultSearchEmpty(false)
        setVisibleRoad(targetRoadIdx)
        setPendingSource(null)
        setRoadError('')

        if (targetSlot) {
          const targetEpNum = targetSlot.canonicalEp
          const targetPageUrl = targetSlot.pageUrl

          const inheritPos =
            prevEpisode && currentPosition > 5 ? currentPosition : 0
          const effectivePos =
            inheritPos > 0
              ? inheritPos
              : lookupResumePosition(
                  bangumiId,
                  plugin.name,
                  targetEpNum,
                  targetRoadIdx,
                  targetSlot.entryEp,
                )

          resumeOverrideRef.current = effectivePos > 0 ? effectivePos : null
          setResumePosition(effectivePos)

          if (targetPageUrl) {
            setEpisode({
              pageUrl: targetPageUrl,
              episode: targetEpNum,
              entryEp: targetSlot.entryEp,
              road: targetRoadIdx,
              sourceIndex: targetSlot.sourceIndex,
              officialTitle: targetSlot.officialTitle,
              displayTitle: targetSlot.displayTitle,
              sourceTitle: targetSlot.sourceTitle,
              isLayer2: targetSlot.isLayer2,
            })

            if (prevEpisode) {
              const timeStr =
                inheritPos > 5 ? ` ${formatMinutesSeconds(inheritPos)}` : ''
              setHudMessage(
                `已切换至 ${plugin.name} · 第 ${targetEpNum} 集${timeStr}`,
              )
            }

            const q = new URLSearchParams(paramsRef.current)
            if (paramsRef.current.has('plugin')) {
              q.set('plugin', plugin.name)
            }
            q.set('ep', String(targetEpNum))
            if (targetRoadIdx > 0) q.set('road', String(targetRoadIdx))
            else q.delete('road')
            // Clean redundant long metadata from address bar
            q.delete('pageUrl')
            q.delete('source')
            const key = `${bangumiId}|${plugin.name}||${targetEpNum}|${targetRoadIdx}`
            resumeDoneFor.current = key
            safeSetParams(q, { replace: true })
          } else {
            setEpisode(null)
            const q = new URLSearchParams(paramsRef.current)
            if (paramsRef.current.has('plugin')) {
              q.set('plugin', plugin.name)
            }
            q.delete('pageUrl')
            q.delete('ep')
            q.delete('road')
            q.delete('source')
            safeSetParams(q, { replace: true })
          }
        } else {
          // Do not auto-request first episode when opening subject page without explicit ?ep
          setEpisode(null)
          setResumePosition(0)
          resumeOverrideRef.current = null
          const q = new URLSearchParams(paramsRef.current)
          if (paramsRef.current.has('plugin')) {
            q.set('plugin', plugin.name)
          }
          q.delete('pageUrl')
          q.delete('ep')
          q.delete('road')
          q.delete('source')
          safeSetParams(q, { replace: true })
        }
      } catch (e) {
        if (!isWatchPage()) return
        if (chaptersGen.current !== gen) return
        if (chaptersAc.signal.aborted) return
        invalidateRoadsCache(bangumiId, plugin.name, searchItem.src)
        const msg = e instanceof Error ? e.message : '获取分集失败'
        if (/取消|aborted|AbortError/i.test(msg)) return
        setRoadError(msg)
        setSelection(null)
        setPendingSource(null)
        throw e
      } finally {
        if (mountedRef.current && chaptersGen.current === gen) {
          roadLoadingRef.current = false
          setRoadLoading(false)
        }
      }
    },
    [
      bangumiId,
      cover,
      dmResetPools,
      isWatchPage,
      resumePosition,
      safeSetParams,
      title,
      titleRefs,
    ],
  )
  pickSourceRef.current = pickSource

  const switchToPlugin = useCallback(
    async (
      plugin: PluginMeta,
      targetItem?: SearchItem,
      opts?: { hudMessage?: string; autoFallback?: boolean },
    ) => {
      setKeywordTargetPlugin(plugin)
      if (opts?.hudMessage) {
        setHudMessage(opts.hudMessage)
      } else if (opts?.autoFallback) {
        setHudMessage(`默认源未收录，已为你切换至 ${plugin.name}`)
      } else if (episodeRef.current) {
        setHudMessage(`正在切换至 ${plugin.name}…`)
      }
      if (targetItem) {
        try {
          await pickSource(plugin, targetItem)
        } catch {
          /* pickSource already set roadError and cleaned state */
        }
        return
      }

      const binding = useSourceBindingStore
        .getState()
        .getBinding(bangumiId, plugin.name)
      if (binding?.sourceUrl) {
        try {
          await pickSource(plugin, {
            name: binding.title || plugin.name,
            src: binding.sourceUrl,
          })
          return
        } catch {
          // Binding failed (0 episodes or dead URL): remove stale binding and smoothly fallback to search below
          useSourceBindingStore.getState().removeBinding(bangumiId, plugin.name)
        }
      }

      await openPluginSearch(plugin, undefined, {
        clearSelection: true,
        autoPickFirst: true,
      })
    },
    [bangumiId, pickSource, openPluginSearch],
  )

  useWatchSourceLauncher({
    bangumiId,
    title,
    titleRefs,
    resolvedItem,
    defaultKeyword,
    plugins,
    pluginOrder: effectivePluginOrder,
    isOld,
    boostedPluginNames,
    qPlugin,
    qPageUrl,
    qEp,
    qRoad,
    paramsRef,
    selectionRef,
    episodeRef,
    keywordTargetPluginRef,
    setKeywordTargetPlugin,
    setSelection,
    setEpisode,
    setVisibleRoad,
    setResumePosition,
    resumeOverrideRef,
    setRoadLoading,
    setRoadError,
    setHudMessage,
    setSearchKeyword,
    bgmEpisodes: bgmEpisodesQuery.data?.data,
    isWatchPage,
    safeSetParams,
    pickSource,
    openPluginSearch,
    resumeDoneFor,
    defaultSearchDoneFor,
  })

  // Keep resumePosition in sync when selection/episode changes without pickEpisode
  // (e.g. auto-pick → user later picks ep). pickEpisode also sets this synchronously.
  useEffect(() => {
    if (!selection || !episode) {
      setResumePosition(0)
      resumeOverrideRef.current = null
      return
    }
    if (resumeOverrideRef.current != null) return
    const pos = lookupResumePosition(
      bangumiId,
      selection.plugin.name,
      episode.episode,
      episode.road,
    )
    setResumePosition(pos)
  }, [selection, episode, bangumiId])

  const pickSlot = useCallback(
    (slot: PlayableSlot, roadIndex = visibleRoad) => {
      if (!selection) return
      const road = selection.roads[roadIndex]
      if (!road?.data?.length) return
      if (roadIndex !== visibleRoad) setVisibleRoad(roadIndex)

      const epNum = slot.canonicalEp
      // Synchronous history read so VideoPlayer first mount gets correct initialTime
      const pos = lookupResumePosition(
        bangumiId,
        selection.plugin.name,
        epNum,
        roadIndex,
        slot.entryEp,
      )
      resumeOverrideRef.current = null
      streamResolve.resetRecoveryTracker()
      setResumePosition(pos)
      setEpisode({
        pageUrl: slot.pageUrl,
        road: roadIndex,
        episode: epNum,
        sourceIndex: slot.sourceIndex,
        officialTitle: slot.officialTitle,
        displayTitle: slot.displayTitle,
        sourceTitle: slot.sourceTitle,
        isLayer2: slot.isLayer2,
      })

      // Lock resume key synchronously so deep-link query watcher doesn't clobber the user's pick
      const key = `${bangumiId}|${selection.plugin.name}||${epNum}|${roadIndex}`
      resumeDoneFor.current = key

      const q = new URLSearchParams(paramsRef.current)
      if (paramsRef.current.has('plugin')) {
        q.set('plugin', selection.plugin.name)
      }
      q.set('ep', String(epNum))
      if (roadIndex > 0) q.set('road', String(roadIndex))
      else q.delete('road')
      // Clean redundant metadata parameters
      q.delete('pageUrl')
      q.delete('source')
      safeSetParams(q, { replace: true })
    },
    [selection, visibleRoad, bangumiId, safeSetParams],
  )

  const pickEpisode = useCallback(
    (epIndex: number, roadIndex = visibleRoad) => {
      if (!selection) return
      const road = selection.roads[roadIndex]
      if (!road?.data?.length) return
      const slots = buildPlayableSlots(road, bgmEpisodesQuery.data?.data)
      const slot =
        slots.find((s) => s.sourceIndex === epIndex) ||
        slots[epIndex] ||
        slots[0]
      if (slot) {
        pickSlot(slot, roadIndex)
      }
    },
    [selection, visibleRoad, bgmEpisodesQuery.data?.data, pickSlot],
  )

  // Auto-sync episode metadata when authoritative Bangumi episodes finish loading
  useEffect(() => {
    if (!selection || !episode) return
    const road = selection.roads[episode.road]
    if (!road?.data?.length || !bgmEpisodesQuery.data?.data?.length) return
    const slots = buildPlayableSlots(road, bgmEpisodesQuery.data.data)
    if (!slots.length) return

    // Find current slot by pageUrl or sourceIndex
    const currentSlot =
      slots.find((s) => s.pageUrl === episode.pageUrl) ||
      (episode.sourceIndex !== undefined
        ? slots.find((s) => s.sourceIndex === episode.sourceIndex)
        : undefined)

    if (
      currentSlot &&
      (currentSlot.canonicalEp !== episode.episode ||
        episode.isLayer2 ||
        !episode.officialTitle)
    ) {
      setEpisode({
        pageUrl: currentSlot.pageUrl,
        episode: currentSlot.canonicalEp,
        entryEp: currentSlot.entryEp,
        road: episode.road,
        sourceIndex: currentSlot.sourceIndex,
        officialTitle: currentSlot.officialTitle,
        displayTitle: currentSlot.displayTitle,
        sourceTitle: currentSlot.sourceTitle,
        isLayer2: currentSlot.isLayer2,
      })
      const key = `${bangumiId}|${selection.plugin.name}||${currentSlot.canonicalEp}|${episode.road}`
      resumeDoneFor.current = key
      const q = new URLSearchParams(paramsRef.current)
      q.set('ep', String(currentSlot.canonicalEp))
      safeSetParams(q, { replace: true })
    }
  }, [
    bgmEpisodesQuery.data?.data,
    selection,
    episode?.road,
    episode?.pageUrl,
    episode?.episode,
    episode?.sourceIndex,
    episode?.isLayer2,
    episode?.officialTitle,
    safeSetParams,
    bangumiId,
  ])

  // 基于当前播放集所在线路精确计算可播放 slots，避免受抽屉 visibleRoad 切换干扰
  const currentEpisodeSlots = useMemo(() => {
    if (!selection || !episode) return []
    const road = selection.roads[episode.road]
    if (!road?.data?.length) return []
    return buildPlayableSlots(road, bgmEpisodesQuery.data?.data)
  }, [selection, episode?.road, bgmEpisodesQuery.data?.data])

  // 精准定位当前集在当前线路 slots 中的绝对索引位置
  const currentSlotIndex = useMemo(
    () => findCurrentSlotIndex(episode, currentEpisodeSlots),
    [episode, currentEpisodeSlots],
  )

  const hasPrevEpisode = currentSlotIndex > 0
  const hasNextEpisode =
    currentSlotIndex >= 0 && currentSlotIndex < currentEpisodeSlots.length - 1

  function goAdjacentEpisode(delta: number) {
    if (!selection || !episode) return
    const roadIndex = episode.road
    const road = selection.roads[roadIndex]
    if (!road?.data?.length) return
    const slots = currentEpisodeSlots.length
      ? currentEpisodeSlots
      : buildPlayableSlots(road, bgmEpisodesQuery.data?.data)
    if (!slots.length) return

    const curIdx =
      currentSlotIndex >= 0
        ? currentSlotIndex
        : findCurrentSlotIndex(episode, slots)
    if (curIdx < 0) return
    const nextSlot = getAdjacentEpisodeSlot(slots, curIdx, delta)
    if (nextSlot) {
      pickSlot(nextSlot, roadIndex)
    }
  }

  const nextPlayableSlot =
    hasNextEpisode && currentSlotIndex >= 0
      ? currentEpisodeSlots[currentSlotIndex + 1]
      : undefined

  const { prefetchNextEpisode, maybePrefetchOnProgress } = useWatchNextPrefetch({
    bangumiId,
    title,
    plugin: selection?.plugin,
    hasNextEpisode,
    nextSlot: nextPlayableSlot,
  })

  const onProgress = useCallback(
    (position: number, duration: number) => {
      currentPlaybackPositionRef.current = position
      if (!selection || !episode) return

      maybePrefetchOnProgress(position, duration)

      const effectiveEntryEp =
        episode.entryEp ??
        (episode.sourceIndex !== undefined
          ? episode.sourceIndex + 1
          : episode.episode)

      upsertHistory({
        bangumiId,
        title,
        cover,
        episode: episode.episode,
        entryEp: effectiveEntryEp,
        road: episode.road,
        pluginName: selection.plugin.name,
        pageUrl: episode.pageUrl,
        sourceUrl: selection.source.src || undefined,
        playUrl: streamResolve.playUrl,
        position,
        duration,
        genres,
      })
    },
    [
      selection,
      episode,
      maybePrefetchOnProgress,
      upsertHistory,
      bangumiId,
      title,
      cover,
      genres,
      streamResolve.playUrl,
    ],
  )

  async function refreshChapters() {
    const sel = selectionRef.current
    if (!sel?.source?.src || !sel?.plugin) return
    const { plugin, source } = sel
    invalidateRoadsCache(bangumiId, plugin.name, source.src)
    roadLoadingRef.current = true
    setRoadLoading(true)
    setRoadError('')
    setHudMessage(`正在刷新 ${plugin.name} 选集…`)
    try {
      const res = await pluginApi.chapters(plugin, source.src, {
        refresh: true,
        title: source.name || title,
        bangumiId,
      })
      const roads = res.data?.roads || []
      if (roads.length && roads[0]?.data?.length) {
        writeRoadsForSource(bangumiId, plugin.name, source.src, roads)
        setSelection((prev) => (prev ? { ...prev, roads } : null))
        // Align currently active episode url via PlayableSlot (100% immune to ep0 / index shift)
        if (episodeRef.current) {
          const curEp = episodeRef.current
          const road = roads[curEp.road] || roads[0]
          const newSlots = buildPlayableSlots(road, bgmEpisodesQuery.data?.data)
          const targetSlot =
            newSlots.find((s) => s.pageUrl === curEp.pageUrl) ||
            newSlots.find((s) => s.canonicalEp === curEp.episode) ||
            (curEp.sourceIndex !== undefined
              ? newSlots.find((s) => s.sourceIndex === curEp.sourceIndex)
              : undefined) ||
            newSlots[0]

          if (targetSlot) {
            setEpisode({
              pageUrl: targetSlot.pageUrl,
              episode: targetSlot.canonicalEp,
              entryEp: targetSlot.entryEp,
              road: curEp.road,
              sourceIndex: targetSlot.sourceIndex,
              officialTitle: targetSlot.officialTitle,
              displayTitle: targetSlot.displayTitle,
              sourceTitle: targetSlot.sourceTitle,
              isLayer2: targetSlot.isLayer2,
            })
          }
        }
        setHudMessage(`已刷新 ${plugin.name} 选集列表`)
      } else {
        setRoadError(
          res.data?.diagnostics?.slice(0, 2).join('；') || '刷新后未解析到有效分集',
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '刷新选集失败'
      setRoadError(msg)
    } finally {
      roadLoadingRef.current = false
      setRoadLoading(false)
    }
  }

  useEffect(() => {
    if (selection?.plugin) setKeywordTargetPlugin(selection.plugin)
  }, [selection?.plugin])

  // ── bangumi-oped: per-show OP/ED timestamps & player settings ───────
  const activePluginName =
    selection?.plugin.name || qPlugin || activeTargetPlugin?.name || ''
  const effectiveEntryEpForOped =
    episode?.entryEp ??
    (episode?.sourceIndex !== undefined
      ? episode.sourceIndex + 1
      : (episode?.episode ?? (qEp !== undefined && qEp >= 0 ? qEp : 0)))

  const { resolvedPlayerSettings, bgmOpedData, expectedDurationSeconds } =
    useWatchOpedSettings({
      bangumiId,
      activePluginName,
      episodeNumber: effectiveEntryEpForOped,
      playerSettings,
    })

  const activeRoadForSlots = selection?.roads[visibleRoad]
  const slots = useMemo(() => {
    if (!activeRoadForSlots) return []
    return buildPlayableSlots(activeRoadForSlots, bgmEpisodesQuery.data?.data)
  }, [activeRoadForSlots, bgmEpisodesQuery.data?.data])

  return {
    bangumiId,
    title,
    cover,
    bangumiItem: (fullItem ?? validSeed) as BangumiItem | undefined,
    subjectLoading: subject.isLoading && !resolvedItem,
    subjectError: subject.error,
    keywordCandidates,
    titleRefs,
    sessionKeywords,
    searchResults: isSubjectTransition
      ? orderSearchRows(
          plugins.map((plugin) => ({
            plugin,
            items: [],
            pending: false,
            searched: false,
          })),
          effectivePluginOrder,
          isOld,
          boostedPluginNames,
        )
      : searchResults,
    searchKeyword,
    defaultKeyword,
    defaultSearchEmpty: isSubjectTransition ? false : defaultSearchEmpty,
    defaultSourceName: findDefaultSourcePlugin(plugins, effectivePluginOrder, isOld, boostedPluginNames)?.name || plugins[0]?.name || '',
    selection: isSubjectTransition ? null : selection,
    episode: isSubjectTransition ? null : episode,
    slots: isSubjectTransition ? EMPTY_ARRAY : slots,
    visibleRoad,
    setVisibleRoad,
    roadLoading,
    roadError,
    pendingSource,
    keywordTargetPlugin,
    setKeywordTargetPlugin: setManualKeywordTargetPlugin,
    mediaSrc: streamResolve.mediaSrc,
    formatHint: streamResolve.formatHint,
    adBlockerMode: streamResolve.adBlockerMode,
    playbackMode: streamResolve.playbackMode,
    /** direct | playlist-proxy (ad hybrid) | full-proxy — for WatchMeta hint */
    playbackTransit: streamResolve.playbackTransit,
    // playerKey uniquely represents physical media stream channel and transit mode;
    // in-place seek handles late resume without destructive player DOM remounts.
    playerKey: streamResolve.playerKey,
    resumeTime: streamResolve.resumeTime,
    resolveLoading: streamResolve.resolveLoading,
    resolveError: streamResolve.resolveError,
    diagnostics: streamResolve.diagnostics,
    subtitle: streamResolve.subtitle,
    subtitles: streamResolve.subtitles,
    fonts: streamResolve.fonts,
    danmakuSettings,
    playerSettings: resolvedPlayerSettings,
    setDanmaku,
    setPlayer,
    dm,
    enabledPlugins: plugins,
    openPluginSearch,
    searchOnePlugin,
    reSearchCurrentSource,
    switchToPlugin,
    pickSource,
    pickSlot,
    pickEpisode,
    hasPrevEpisode,
    hasNextEpisode,
    goAdjacentEpisode,
    prefetchNextEpisode,
    onProgress,
    onMediaAuthExpired: streamResolve.onMediaAuthExpired,
    onMediaLoadFailed: streamResolve.onMediaLoadFailed,
    refetchSubject: () => {
      void subject.refetch()
    },
    refetchResolve: streamResolve.refetchResolve,
    refreshChapters,
    hudMessage,
    clearHudMessage,
    bgmOpedData,
    expectedDurationSeconds,
    pageUrl: episode?.pageUrl || qPageUrl,
    pluginName: isSubjectTransition ? (qPlugin || '') : (selection?.plugin.name || qPlugin),
  }
}

export { bestTitleSimilarity }
