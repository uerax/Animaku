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
import { useQuery } from '@tanstack/react-query'
import {
  buildSearchKeywords,
  rankSearchItems,
  bestTitleSimilarity,
  coverOf,
  comparePluginOrder,
  isOldAnime,
  resolvePluginDefaultKeyword,
  findMatchingEpisodeIndex,
  type BangumiItem,
  type PluginMeta,
  type SearchItem,
  type Road,
  type DanmakuSettings,
  type PlayerSettings,
} from '@animaku/shared'
import { bangumiApi } from './bangumi'
import { pluginApi } from './plugin-api'
import { pickPlaybackSrc, type PlaybackTransit } from './playback-src'
import {
  getCachedPluginSearch,
  setCachedPluginSearch,
} from './plugin-result-cache'
import {
  isFullProxySourceUsable,
  pluginShouldUseProxy,
} from './plugin-capabilities'
import {
  findRoadsForPlay,
  writeRoadsForSource,
  invalidateRoadsCache,
} from './roads-cache'
import {
  fetchServerHealth,
  mediaFullProxyEnabled,
} from './server-capabilities'
import { useDanmakuSession, type DanmakuSession } from './use-danmaku-session'
import { usePluginStore } from '../stores/plugins'
import { useHistoryStore } from '../stores/history'
import { useSettingsStore } from '../stores/settings'
import { useSourceBindingStore } from '../stores/source-bindings'
import { EMPTY_ARRAY, FALLBACK_DANMAKU, FALLBACK_PLAYER } from './stable'
import { useBangumiOpedData, useResolvedOpedSkip, useBangumiEpisodesDuration } from './bangumi-oped'
import { useCustomOpedStore } from './custom-oped-store'

export type SearchRow = {
  plugin: PluginMeta
  items: SearchItem[]
  error?: string
  pending?: boolean
  /** true after user has triggered at least one search for this plugin */
  searched?: boolean
  keyword?: string
}

export type SourceSelection = {
  plugin: PluginMeta
  source: SearchItem
  roads: Road[]
}

export type EpisodePlay = {
  pageUrl: string
  episode: number
  road: number
}

/**
 * Min title similarity before auto-picking the first ranked search hit.
 * Below this, show the list and let the user choose (avoids MacCMS wrong-show).
 */
export const AUTO_PICK_MIN_SIMILARITY = 0.55

/** Seconds of history progress required before continue-play seeks. */
const RESUME_MIN_POSITION = 15

function formatMinutesSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function lookupResumePosition(
  bangumiId: number,
  pluginName: string,
  episode: number,
  road: number,
): number {
  const items = useHistoryStore.getState().items
  const list = Array.isArray(items) ? items : []
  const h = list.find(
    (i) =>
      i.bangumiId === bangumiId &&
      i.pluginName === pluginName &&
      i.episode === episode &&
      i.road === road,
  )
  return h?.position || 0
}

/** Prefer history sourceUrl; fall back to query `source` when present. */
function lookupHistorySourceUrl(
  bangumiId: number,
  pluginName: string,
  pageUrl?: string,
): string {
  const items = useHistoryStore.getState().items
  const list = Array.isArray(items) ? items : []
  const norm = (u: string) => (u || '').replace(/\/+$/, '')
  const target = norm(pageUrl || '')
  if (target) {
    const hit = list.find(
      (i) =>
        i.bangumiId === bangumiId &&
        i.pluginName === pluginName &&
        (norm(i.pageUrl) === target ||
          (i.sourceUrl && norm(i.sourceUrl) === target)),
    )
    if (hit?.sourceUrl) return hit.sourceUrl.trim()
  }
  // Fallback when pageUrl is omitted in URL (e.g. /play/:id?plugin=anime1&ep=1 from history)
  const hitAny = list.find(
    (i) => i.bangumiId === bangumiId && i.pluginName === pluginName && Boolean(i.sourceUrl),
  )
  return (hitAny?.sourceUrl || '').trim()
}

/**
 * First enabled plugin based on user order, falling back to weight > alphabetical name order.
 * This is the default source auto-searched on first visit.
 * When isOldAnime is true, plugins with oldAnimePriority receive +12 weight bonus.
 */
function findDefaultSourcePlugin(
  list: PluginMeta[],
  order: string[],
  isOldAnime = false,
): PluginMeta | undefined {
  if (!list.length) return undefined
  if (order.length) {
    // Find first plugin whose name appears in the user's order
    for (const name of order) {
      const hit = list.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      )
      if (hit) return hit
    }
  }
  // Fallback: weight descending > alphabetical name order.
  return [...list].sort((a, b) => comparePluginOrder(a, b, isOldAnime))[0]
}

/** Sort search rows by stored order (first = top), falling back to weight > alphabetical. */
function orderSearchRows(
  rows: SearchRow[],
  order: string[],
  isOldAnime = false,
): SearchRow[] {
  if (!order.length) {
    return [...rows].sort((a, b) => comparePluginOrder(a.plugin, b.plugin, isOldAnime))
  }
  const rank = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    rank.set(order[i].toLowerCase(), i)
  }
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.plugin.name.toLowerCase()) ?? order.length
    const rb = rank.get(b.plugin.name.toLowerCase()) ?? order.length
    if (ra !== rb) return ra - rb
    return comparePluginOrder(a.plugin, b.plugin, isOldAnime)
  })
}

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
  playbackMode: 'direct' | 'proxy'
  /** direct | playlist-proxy (ad hybrid) | full-proxy — for WatchMeta hint */
  playbackTransit: PlaybackTransit
  playerKey: string
  resumeTime: number
  resolveLoading: boolean
  resolveError: unknown
  diagnostics: string[] | undefined
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
      isManual?: boolean
    },
  ) => Promise<void>
  searchOnePlugin: (
    plugin: PluginMeta,
    keyword: string,
    opts?: {
      clearSelection?: boolean
      autoPickFirst?: boolean
      refresh?: boolean
      isManual?: boolean
    },
  ) => Promise<void>
  reSearchCurrentSource: (keyword: string) => Promise<void>
  switchToPlugin: (plugin: PluginMeta, targetItem?: SearchItem) => Promise<void>
  pickSource: (plugin: PluginMeta, item: SearchItem) => Promise<void>
  pickEpisode: (epIndex: number, roadIndex?: number) => void
  goAdjacentEpisode: (delta: number) => void
  onProgress: (position: number, duration: number) => void
  onMediaAuthExpired: (position: number) => Promise<void>
  onMediaLoadFailed: (args: { position: number }) => void
  refetchResolve: () => void
  refreshChapters: () => Promise<void>
  hudMessage: string | null
  clearHudMessage: () => void
  bgmOpedData?: Map<number, import('./bangumi-oped').BgmOpedEntry> | null
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
      setParams(nextInit, navigateOptions)
    },
    [isWatchPage, setParams],
  )

  const qPlugin = params.get('plugin') || ''
  const qPageUrl = params.get('pageUrl') || ''
  const qEp = Number(params.get('ep') || '0')
  const qRoad = Number(params.get('road') || '0')
  const qTitle = params.get('title') || ''
  const qCover = params.get('cover') || ''

  const ensureDefaults = usePluginStore((s) => s.ensureDefaults)
  const allPlugins = usePluginStore((s) =>
    Array.isArray(s.plugins) ? s.plugins : EMPTY_ARRAY,
  )
  const pluginOrder = usePluginStore((s) =>
    Array.isArray(s.pluginOrder) ? s.pluginOrder : EMPTY_ARRAY as string[],
  )
  const serverCaps = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchServerHealth(signal),
    staleTime: 60_000,
  })
  const mediaFullProxy = mediaFullProxyEnabled(serverCaps.data)
  const proxyTokenRequired = Boolean(serverCaps.data?.proxyTokenRequired)
  const playerSettings = useSettingsStore((s) => s.player ?? FALLBACK_PLAYER)
  const proxyToken = useSettingsStore((s) => s.proxyToken)
  const setPlayer = useSettingsStore((s) => s.setPlayer)
  const isProxyUnlocked = !proxyTokenRequired || Boolean(proxyToken?.trim())
  const serverProxyEnabled =
    mediaFullProxy && Boolean(playerSettings.serverProxy) && isProxyUnlocked

  const subject = useQuery({
    queryKey: ['subject', bangumiId],
    queryFn: ({ signal }) => bangumiApi.subject(bangumiId, { signal }),
    enabled: Number.isFinite(bangumiId) && bangumiId > 0,
    // Public metadata; server subject TTL 6h — keep client shorter to revalidate via HIT
    staleTime: 30 * 60_000,
    gcTime: 6 * 60 * 60_000,
  })
  const item = subject.data?.data
  const isOld = useMemo(() => isOldAnime(item?.airDate), [item?.airDate])

  const plugins = useMemo(() => {
    const list = allPlugins.filter((p) => {
      if (!p || p.enabled === false) return false
      if (
        !isFullProxySourceUsable(
          p,
          mediaFullProxy,
          serverProxyEnabled,
          isProxyUnlocked,
        )
      ) {
        return false
      }
      return true
    })
    if (!pluginOrder.length) {
      return [...list].sort((a, b) => comparePluginOrder(a, b, isOld))
    }
    const rank = new Map<string, number>()
    for (let i = 0; i < pluginOrder.length; i++) {
      rank.set(pluginOrder[i].toLowerCase(), i)
    }
    return [...list].sort((a, b) => {
      const ra = rank.get(a.name.toLowerCase()) ?? pluginOrder.length
      const rb = rank.get(b.name.toLowerCase()) ?? pluginOrder.length
      if (ra !== rb) return ra - rb
      return comparePluginOrder(a, b, isOld)
    })
  }, [allPlugins, mediaFullProxy, serverProxyEnabled, isProxyUnlocked, pluginOrder, isOld])
  const upsertHistory = useHistoryStore((s) => s.upsert)
  const danmakuSettings = useSettingsStore((s) => s.danmaku ?? FALLBACK_DANMAKU)
  const setDanmaku = useSettingsStore((s) => s.setDanmaku)

  const title = item ? item.nameCn || item.name : qTitle || `番剧 ${bangumiId}`
  const cover = item ? coverOf(item) : qCover || ''

  const [searchResults, setSearchResults] = useState<SearchRow[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
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
  const [sessionKeywords, setSessionKeywords] = useState<
    Record<string, string[]>
  >({})
  /** Per-source manual keyword overrides when user explicitly types or selects a keyword */
  const [manualKeywords, setManualKeywords] = useState<Record<string, string>>({})
  const [playerRemount, setPlayerRemount] = useState(0)
  /** Continue-play seek target — state (not ref) so first media mount sees it. */
  const [resumePosition, setResumePosition] = useState(0)

  const resumeDoneFor = useRef<string | null>(null)
  /** Live override after auth/proxy remount (position mid-play). */
  const resumeOverrideRef = useRef<number | null>(null)
  const pluginSearchGen = useRef<Record<string, number>>({})
  /** Abort in-flight search fetch when gen bumps / unmount */
  const pluginSearchAbort = useRef<Record<string, AbortController>>({})
  const chaptersGen = useRef(0)
  const chaptersAbort = useRef<AbortController | null>(null)
  /** Next resolve queryFn uses refresh=1 once (auth expiry / hard media fail). */
  const resolveRefreshOnce = useRef(false)
  const [hudMessage, setHudMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!hudMessage) return
    const timer = setTimeout(() => {
      setHudMessage(null)
    }, 3500)
    return () => clearTimeout(timer)
  }, [hudMessage])

  const clearHudMessage = useCallback(() => setHudMessage(null), [])

  const episodeRef = useRef<EpisodePlay | null>(null)
  episodeRef.current = episode
  const visibleRoadRef = useRef<number>(0)
  visibleRoadRef.current = visibleRoad
  const currentPlaybackPositionRef = useRef<number>(0)

  /** Auto-start default source once per subject (skip resume deep-links). */
  const defaultSearchDoneFor = useRef<number | null>(null)
  /** Avoid auto-picking first hit when user already has a selection / resume. */
  const selectionRef = useRef<SourceSelection | null>(null)
  selectionRef.current = selection
  const keywordTargetPluginRef = useRef<PluginMeta | null>(null)
  keywordTargetPluginRef.current = keywordTargetPlugin
  const paramsRef = useRef(params)
  paramsRef.current = params
  const roadLoadingRef = useRef(roadLoading)
  roadLoadingRef.current = roadLoading

  const titleRefs = useMemo(() => {
    if (!item) return [qTitle].filter(Boolean) as string[]
    return [item.nameCn, item.name, ...(item.alias || [])].filter(Boolean)
  }, [item, qTitle])

  const activeTargetPlugin =
    keywordTargetPlugin ||
    selection?.plugin ||
    findDefaultSourcePlugin(plugins, pluginOrder, isOld)
  const preferOriginal = activeTargetPlugin?.preferOriginalTitle === true

  const keywordCandidates = useMemo(() => {
    if (!item) {
      const t = (qTitle || title || '').trim()
      return t ? [t] : ([] as string[])
    }
    // Full title first for the dropdown; shorter variants remain as fallbacks.
    // Honor the active source's title preference (Japanese/original vs Chinese).
    const primary = (
      preferOriginal
        ? item.name || item.nameCn || ''
        : item.nameCn || item.name || ''
    ).trim()
    const variants = buildSearchKeywords(item.nameCn, item.name, item.alias)
    const seen = new Set<string>()
    const out: string[] = []
    const titleOrder = preferOriginal
      ? [primary, item.name, item.nameCn, ...variants]
      : [primary, item.nameCn, item.name, ...variants]
    for (const k of titleOrder) {
      const t = (k || '').trim()
      if (!t || seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase())
      out.push(t)
    }
    return out
  }, [item, qTitle, title, preferOriginal])

  /** Default search uses the display title, not the shortest stripped variant. */
  const defaultKeyword = useMemo(() => {
    return (
      item?.nameCn ||
      item?.name ||
      qTitle ||
      title ||
      keywordCandidates[0] ||
      ''
    ).trim()
  }, [item, qTitle, title, keywordCandidates])

  /**
   * Resolve keyword for a specific plugin:
   * 1. Per-source manual keyword if user explicitly typed/selected one.
   * 2. Otherwise calculate default keyword according to plugin's preferOriginalTitle.
   */
  const getPluginKeyword = useCallback(
    (plugin: PluginMeta) => {
      if (manualKeywords[plugin.name]) {
        return manualKeywords[plugin.name]
      }
      return resolvePluginDefaultKeyword(
        plugin,
        item,
        (qTitle && !/^番剧\s*\d+$/.test(qTitle) ? qTitle : '') ||
          defaultKeyword ||
          '',
      )
    },
    [manualKeywords, item, qTitle, defaultKeyword],
  )

  const dm = useDanmakuSession({
    bangumiId,
    episode: episode?.episode || qEp || 1,
    title,
    titleRefs,
    matchKey: episode
      ? `${selection?.plugin.name || qPlugin}|${episode.pageUrl}|${episode.episode}`
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
    setSessionKeywords({})
    setManualKeywords({})
    chaptersGen.current += 1
    dmResetPools()
    pluginSearchGen.current = {}
    setSearchKeyword('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on subject id
  }, [bangumiId])

  // Seed / refresh idle plugin rows without wiping in-progress selection.
  // Keep the row order aligned with the user's configured source order.
  useEffect(() => {
    setSearchResults((prev) => {
      const byName = new Map(prev.map((r) => [r.plugin.name, r]))
      const rows = plugins.map((plugin) => {
        const old = byName.get(plugin.name)
        if (old) return { ...old, plugin }
        return {
          plugin,
          items: [],
          pending: false,
          searched: false,
        }
      })
      return orderSearchRows(rows, pluginOrder, isOld)
    })
  }, [plugins, bangumiId, pluginOrder, isOld])

  // Keep default keyword in state for UI once subject loads
  useEffect(() => {
    const target =
      keywordTargetPlugin ||
      selection?.plugin ||
      findDefaultSourcePlugin(plugins, pluginOrder, isOld)
    if (!target) return
    const kw = getPluginKeyword(target)
    if (kw && !searchKeyword) {
      setSearchKeyword(kw)
    }
  }, [
    keywordTargetPlugin,
    selection?.plugin,
    plugins,
    pluginOrder,
    isOld,
    getPluginKeyword,
    searchKeyword,
  ])

  // Pre-select the target source: query plugin if provided, otherwise first source
  useEffect(() => {
    if (!plugins.length) return
    if (selection || manualTargetPluginRef.current) return
    const target =
      (qPlugin &&
        (plugins.find(
          (p) => p.name.toLowerCase() === qPlugin.toLowerCase(),
        ) ||
          usePluginStore.getState().getByName(qPlugin))) ||
      findDefaultSourcePlugin(plugins, pluginOrder, isOld)
    if (target && target.name.toLowerCase() !== keywordTargetPlugin?.name.toLowerCase()) {
      setKeywordTargetPlugin(target)
    }
  }, [plugins, pluginOrder, isOld, keywordTargetPlugin, selection, qPlugin])

  const titleRefsStable = titleRefs
  const keywordCandidatesStable = keywordCandidates

  const rememberSessionKeyword = useCallback(
    (pluginName: string, keyword: string) => {
      const kw = keyword.trim()
      if (!kw) return
      setSessionKeywords((prev) => {
        const list = prev[pluginName] || []
        if (list.includes(kw)) return prev
        return { ...prev, [pluginName]: [kw, ...list].slice(0, 12) }
      })
    },
    [],
  )

  const pickSource = useCallback(
    async (
      plugin: PluginMeta,
      searchItem: SearchItem,
      opts?: { isManual?: boolean },
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
      const prevEpTitle =
        prevRoad?.identifier && prevEpisode?.episode
          ? prevRoad.identifier[prevEpisode.episode - 1] || ''
          : ''
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
        writeRoadsForSource(bangumiId, plugin.name, searchItem.src, roads)
        if (!roads.length || !roads[0]?.data?.length) {
          setRoadError(
            res.data.diagnostics?.slice(0, 2).join('；') || '未解析到分集',
          )
          setSelection(null)
          setPendingSource(null)
          useSourceBindingStore.getState().removeBinding(bangumiId, plugin.name)
          return
        }

        // Silent contamination gatekeeper & persistent binding
        // User manual picks (opts.isManual !== false) are always persisted
        useSourceBindingStore
          .getState()
          .setBinding(
            bangumiId,
            plugin.name,
            { sourceUrl: searchItem.src, title: searchItem.name, isManual: opts?.isManual ?? true },
            titleRefsStable,
            opts?.isManual ?? true,
          )

        // Episode alignment & seamless progress inheritance
        let targetRoadIdx = 0
        let targetEpIdx: number | null = null

        if (prevEpisode && roads[0]?.identifier?.length) {
          const matchIdx = findMatchingEpisodeIndex(
            prevEpTitle || `第${prevEpisode.episode}集`,
            roads[0].identifier,
            prevEpisode.episode - 1,
          )
          if (matchIdx >= 0) {
            targetEpIdx = matchIdx
          } else {
            targetEpIdx = Math.max(
              0,
              Math.min(prevEpisode.episode - 1, (roads[0]?.data?.length || 1) - 1),
            )
          }
        } else if (qEp && qEp > 0) {
          // Explicit deep-link episode specified in URL
          targetEpIdx = Math.max(
            0,
            Math.min(qEp - 1, (roads[0]?.data?.length || 1) - 1),
          )
          if (qRoad && qRoad >= 0 && qRoad < roads.length) {
            targetRoadIdx = qRoad
          }
        }

        setSelection({ plugin, source: searchItem, roads })
        setVisibleRoad(targetRoadIdx)
        setPendingSource(null)
        setRoadError('')

        if (targetEpIdx !== null) {
          const targetEpNum = targetEpIdx + 1
          const targetPageUrl = roads[targetRoadIdx]?.data[targetEpIdx] || ''

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
                )

          resumeOverrideRef.current = effectivePos > 0 ? effectivePos : null
          setResumePosition(effectivePos)

          if (targetPageUrl) {
            setEpisode({
              pageUrl: targetPageUrl,
              episode: targetEpNum,
              road: targetRoadIdx,
            })

            if (prevEpisode) {
              const timeStr =
                inheritPos > 5 ? ` ${formatMinutesSeconds(inheritPos)}` : ''
              setHudMessage(
                `已切换至 ${plugin.name} · 第 ${targetEpNum} 集${timeStr}`,
              )
            }

            const q = new URLSearchParams(paramsRef.current)
            q.set('plugin', plugin.name)
            q.set('ep', String(targetEpNum))
            if (targetRoadIdx > 0) q.set('road', String(targetRoadIdx))
            else q.delete('road')
            // Clean redundant long metadata from address bar
            q.delete('pageUrl')
            q.delete('title')
            q.delete('cover')
            q.delete('source')
            const key = `${bangumiId}|${plugin.name}||${targetEpNum}|${targetRoadIdx}`
            resumeDoneFor.current = key
            safeSetParams(q, { replace: true })
          } else {
            setEpisode(null)
            const q = new URLSearchParams(paramsRef.current)
            q.set('plugin', plugin.name)
            q.delete('pageUrl')
            q.delete('ep')
            q.delete('road')
            q.delete('title')
            q.delete('cover')
            q.delete('source')
            safeSetParams(q, { replace: true })
          }
        } else {
          // Do not auto-request first episode when opening subject page without explicit ?ep
          setEpisode(null)
          setResumePosition(0)
          resumeOverrideRef.current = null
          const q = new URLSearchParams(paramsRef.current)
          q.set('plugin', plugin.name)
          q.delete('pageUrl')
          q.delete('ep')
          q.delete('road')
          q.delete('title')
          q.delete('cover')
          q.delete('source')
          safeSetParams(q, { replace: true })
        }
      } catch (e) {
        if (!isWatchPage()) return
        if (chaptersGen.current !== gen) return
        if (chaptersAc.signal.aborted) return
        const msg = e instanceof Error ? e.message : '获取分集失败'
        if (/取消|aborted|AbortError/i.test(msg)) return
        setRoadError(msg)
        setSelection(null)
        setPendingSource(null)
        const existingBinding = useSourceBindingStore.getState().getBinding(bangumiId, plugin.name)
        if (existingBinding && !existingBinding.isManual) {
          useSourceBindingStore.getState().removeBinding(bangumiId, plugin.name)
        }
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
      titleRefsStable,
    ],
  )

  const searchOnePlugin = useCallback(
    async (
      plugin: PluginMeta,
      keyword: string,
      opts?: {
        clearSelection?: boolean
        autoPickFirst?: boolean
        /** Skip client search cache (and ask server refresh when true). */
        refresh?: boolean
        /** Explicitly manual keyword override */
        isManual?: boolean
      },
    ) => {
      const gen = (pluginSearchGen.current[plugin.name] || 0) + 1
      pluginSearchGen.current[plugin.name] = gen
      try {
        pluginSearchAbort.current[plugin.name]?.abort()
      } catch {
        /* ignore */
      }
      const searchAc = new AbortController()
      pluginSearchAbort.current[plugin.name] = searchAc
      if (opts?.isManual) {
        setManualKeywords((prev) => ({
          ...prev,
          [plugin.name]: keyword.trim(),
        }))
      }
      rememberSessionKeyword(plugin.name, keyword)
      setSearchKeyword(keyword)
      setKeywordTargetPlugin(plugin)

      setSearchResults((prev) => {
        const exists = prev.some((r) => r.plugin.name === plugin.name)
        if (!exists) {
          return orderSearchRows([
            ...prev,
            {
              plugin,
              items: [],
              pending: true,
              searched: true,
              keyword,
            },
          ], pluginOrder)
        }
        return prev.map((row) =>
          row.plugin.name === plugin.name
            ? {
                ...row,
                plugin,
                items: [],
                error: undefined,
                pending: true,
                searched: true,
                keyword,
              }
            : row,
        )
      })

      if (opts?.clearSelection) {
        setSelection((sel) => {
          if (sel?.plugin.name === plugin.name) {
            setEpisode(null)
            return null
          }
          return sel
        })
      }

      let items: SearchItem[] = []
      let error: string | undefined
      try {
        const bypassClient = Boolean(opts?.refresh || opts?.clearSelection)
        const cached = bypassClient
          ? undefined
          : getCachedPluginSearch(plugin, keyword)
        const res = cached
          ? { data: cached }
          : await pluginApi.search(plugin, keyword, {
              signal: searchAc.signal,
              refresh: Boolean(opts?.refresh),
              title,
              bangumiId,
            })
        if (!cached) setCachedPluginSearch(plugin, keyword, res.data)
        if (pluginSearchGen.current[plugin.name] !== gen) return

        const seen = new Set<string>()
        const raw: SearchItem[] = []
        for (const it of res.data.items || []) {
          if (!it?.src || seen.has(it.src)) continue
          seen.add(it.src)
          raw.push(it)
        }
        items = rankSearchItems(raw, [
          ...titleRefsStable,
          keyword,
          ...keywordCandidatesStable,
        ])
        if (!items.length) {
          // Show first non-meta diagnostic (skip "关键词变体" style prefatory lines)
          // so users see actionable error info: timeout, 403, no results, etc.
          const diag = (res.data.diagnostics || []).filter(Boolean)
          const useful = diag.find(
            (d) =>
              !d.startsWith('关键词变体') &&
              !d.startsWith('关键词回退'),
          )
          error = useful || diag[0] || '无结果 — 可换关键词'
        }
      } catch (e) {
        if (pluginSearchGen.current[plugin.name] !== gen) return
        if (searchAc.signal.aborted) return
        const msg = e instanceof Error ? e.message : '搜索失败'
        if (/取消|aborted|AbortError/i.test(msg)) return
        error = /504|timeout|超时|无法访问/i.test(msg)
          ? '源站超时，请稍后重试'
          : /502|源站返回/i.test(msg)
            ? '源站暂时不可用'
            : msg
      }

      if (pluginSearchGen.current[plugin.name] !== gen) return
      setSearchResults((prev) =>
        prev.map((row) =>
          row.plugin.name === plugin.name
            ? {
                plugin,
                items,
                error,
                pending: false,
                searched: true,
                keyword,
              }
            : row,
        ),
      )

      // Auto-select first ranked hit only when title is close enough.
      // Prevents MacCMS “first card” wrong-show on weak keyword matches.
      const isDefault =
        plugin.name.toLowerCase() === (findDefaultSourcePlugin(plugins, pluginOrder, isOld)?.name || '').toLowerCase()
      const shouldAutoPick =
        Boolean(items[0]) &&
        (opts?.autoPickFirst ||
          ((isDefault || opts?.clearSelection) &&
            (opts?.clearSelection || !selectionRef.current)))
      if (shouldAutoPick && items[0]) {
        // Guard against background search race conditions:
        // Do not allow an in-flight background search of plugin A to clobber
        // when the user has already selected or targeted a different plugin B.
        if (
          !opts?.clearSelection &&
          selectionRef.current &&
          selectionRef.current.plugin.name.toLowerCase() !== plugin.name.toLowerCase()
        ) {
          return
        }
        if (
          !opts?.clearSelection &&
          keywordTargetPluginRef.current &&
          keywordTargetPluginRef.current.name.toLowerCase() !== plugin.name.toLowerCase()
        ) {
          return
        }
        const score = bestTitleSimilarity(items[0].name, [
          ...titleRefsStable,
          keyword,
          ...keywordCandidatesStable,
        ])
        if (score >= AUTO_PICK_MIN_SIMILARITY) {
          await pickSource(plugin, items[0])
        } else if (!error) {
          // Keep results visible; surface why we didn't auto-enter episodes
          setSearchResults((prev) =>
            prev.map((row) =>
              row.plugin.name === plugin.name
                ? {
                    ...row,
                    error: '未自动选择（标题不够相近，请点选一条）',
                  }
                : row,
            ),
          )
        }
      }
    },
    [
      titleRefsStable,
      keywordCandidatesStable,
      rememberSessionKeyword,
      pickSource,
      plugins,
      pluginOrder,
      isOld,
    ],
  )

  const openPluginSearch = useCallback(
    async (
      plugin: PluginMeta,
      keyword?: string,
      opts?: {
        clearSelection?: boolean
        autoPickFirst?: boolean
        refresh?: boolean
        isManual?: boolean
      },
    ) => {
      const isManual = Boolean(keyword?.trim() || opts?.isManual)
      if (isManual && keyword?.trim()) {
        setManualKeywords((prev) => ({
          ...prev,
          [plugin.name]: keyword.trim(),
        }))
      }
      const kw = (
        keyword ||
        getPluginKeyword(plugin) ||
        searchKeyword ||
        defaultKeyword ||
        ''
      ).trim()
      if (!kw) return
      await searchOnePlugin(plugin, kw, { ...opts, isManual })
    },
    [searchOnePlugin, getPluginKeyword, searchKeyword, defaultKeyword],
  )

  const switchToPlugin = useCallback(
    async (plugin: PluginMeta, targetItem?: SearchItem) => {
      setKeywordTargetPlugin(plugin)
      if (episodeRef.current) {
        setHudMessage(`正在切换至 ${plugin.name}…`)
      }
      if (targetItem) {
        await pickSource(plugin, targetItem, { isManual: true })
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
          }, { isManual: Boolean(binding.isManual) })
          return
        } catch {
          if (!binding.isManual) {
            useSourceBindingStore.getState().removeBinding(bangumiId, plugin.name)
          }
        }
      }

      await openPluginSearch(plugin, undefined, {
        clearSelection: true,
        autoPickFirst: true,
      })
    },
    [bangumiId, pickSource, openPluginSearch],
  )

  // First visit (not history resume): check persistent binding for default source first (0ms),
  // otherwise search the first enabled source and auto-pick the first hit.
  useEffect(() => {
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) return
    if (defaultSearchDoneFor.current === bangumiId) return
    // If entered with a specific plugin or a selection already exists, mark default search done and skip
    if (qPlugin || selectionRef.current || paramsRef.current.get('plugin')) {
      defaultSearchDoneFor.current = bangumiId
      const target =
        qPlugin &&
        (plugins.find(
          (p) => p.name.toLowerCase() === qPlugin.toLowerCase(),
        ) ||
          usePluginStore.getState().getByName(qPlugin))
      if (target && !keywordTargetPluginRef.current) {
        setKeywordTargetPlugin(target)
      }
      return
    }
    if (!plugins.length) return

    const preferred = findDefaultSourcePlugin(plugins, pluginOrder, isOld)
    if (!preferred) return

    // Check persistent binding first!
    const binding = useSourceBindingStore
      .getState()
      .getBinding(bangumiId, preferred.name)

    if (binding?.sourceUrl) {
      defaultSearchDoneFor.current = bangumiId
      setKeywordTargetPlugin(preferred)
      void pickSource(preferred, {
        name: binding.title || preferred.name,
        src: binding.sourceUrl,
      }).catch(() => {
        // Failed binding, remove and fallback to search
        useSourceBindingStore.getState().removeBinding(bangumiId, preferred.name)
        const kw = (
          resolvePluginDefaultKeyword(
            preferred,
            item,
            (qTitle && !/^番剧\s*\d+$/.test(qTitle) ? qTitle : '') ||
              defaultKeyword,
          ) || ''
        ).trim()
        if (kw && !/^番剧\s*\d+$/.test(kw)) {
          setSearchKeyword(kw)
          void openPluginSearch(preferred, kw, { autoPickFirst: true })
        }
      })
      return
    }

    // Prefer full subject title matching the default source's title preference.
    const kw = (
      resolvePluginDefaultKeyword(
        preferred,
        item,
        (qTitle && !/^番剧\s*\d+$/.test(qTitle) ? qTitle : '') || defaultKeyword,
      ) || ''
    ).trim()
    if (!kw || /^番剧\s*\d+$/.test(kw)) return

    defaultSearchDoneFor.current = bangumiId
    setKeywordTargetPlugin(preferred)
    setSearchKeyword(kw)
    void openPluginSearch(preferred, kw, { autoPickFirst: true })
  }, [
    bangumiId,
    qPlugin,
    plugins,
    pluginOrder,
    item,
    qTitle,
    defaultKeyword,
    openPluginSearch,
    pickSource,
  ])

  // Resume from deep-link query (history / home / shared clean link)
  useEffect(() => {
    if (!Number.isFinite(bangumiId) || !qPlugin || (!qPageUrl && !qEp)) return
    const key = `${bangumiId}|${qPlugin}|${qPageUrl}|${qEp}|${qRoad}`
    if (resumeDoneFor.current === key) return

    // If selection already matches target plugin and has loaded roads, sync state instantly without refetching
    const currentSel = selectionRef.current
    if (
      currentSel &&
      currentSel.plugin.name.toLowerCase() === qPlugin.toLowerCase() &&
      currentSel.roads.length > 0
    ) {
      resumeDoneFor.current = key
      setRoadError('')
      const roadIdx = Math.max(0, Math.min(qRoad, currentSel.roads.length - 1))
      const epIdx = Math.max(0, (qEp || 1) - 1)
      const targetPageUrl = currentSel.roads[roadIdx]?.data[epIdx] || qPageUrl
      const epNum = epIdx + 1
      if (
        episodeRef.current?.episode !== epNum ||
        episodeRef.current?.road !== roadIdx ||
        episodeRef.current?.pageUrl !== targetPageUrl
      ) {
        const pos = lookupResumePosition(bangumiId, qPlugin, epNum, roadIdx)
        resumeOverrideRef.current = null
        setResumePosition(pos)
        setVisibleRoad(roadIdx)
        setEpisode({
          pageUrl: targetPageUrl,
          episode: epNum,
          road: roadIdx,
        })
      }
      return
    }

    // Resolve plugin from store so array identity churn doesn't cancel mid-flight
    const plugin =
      usePluginStore.getState().getByName(qPlugin) ||
      plugins.find((p) => p.name === qPlugin)
    if (
      !plugin ||
      plugin.enabled === false ||
      !isFullProxySourceUsable(
        plugin,
        mediaFullProxy,
        serverProxyEnabled,
        isProxyUnlocked,
      )
    )
      return

    let cancelled = false
    // Do NOT mark done until success — cancel/plugins churn must retry

    ;(async () => {
      setKeywordTargetPlugin(plugin)
      setRoadLoading(true)
      setRoadError('')
      try {
        const boundItem = useSourceBindingStore.getState().getBinding(bangumiId, qPlugin)
        let sourceUrl =
          boundItem?.sourceUrl ||
          paramsRef.current.get('source') ||
          lookupHistorySourceUrl(bangumiId, qPlugin, qPageUrl) ||
          ''
        let sourceTitle = boundItem?.title || qTitle || title || qPlugin

        // If not bound on this device yet (e.g. shared link), auto-search and bind best match
        if (!sourceUrl) {
          const kw = (
            resolvePluginDefaultKeyword(
              plugin,
              item,
              (qTitle && !/^番剧\s*\d+$/.test(qTitle) ? qTitle : '') || defaultKeyword,
            ) || ''
          ).trim()
          // Wait for Bangumi subject metadata if we only have placeholder title
          if (!kw || /^番剧\s*\d+$/.test(kw)) {
            setRoadLoading(false)
            return
          }
          const searchRes = await pluginApi.search(plugin, kw, {
            title,
            bangumiId,
          })
          if (cancelled) return
          if (searchRes.data?.items?.length) {
            const ranked = rankSearchItems(searchRes.data.items, titleRefsStable)
            const matched = ranked[0]
            if (matched) {
              sourceUrl = matched.src
              sourceTitle = matched.name
            }
          }
        }

        let roads = sourceUrl
          ? findRoadsForPlay({
              bangumiId,
              pluginName: qPlugin,
              pageUrl: qPageUrl,
              sourceUrl: sourceUrl || undefined,
            }) || []
          : []

        if (!roads.length && (sourceUrl || qPageUrl)) {
          // Chapters need the detail/source URL, not the episode play page.
          // Try sourceUrl first; only fall back to pageUrl for legacy rows.
          const chapterSrc = sourceUrl || qPageUrl
          const res = await pluginApi.chapters(plugin, chapterSrc, {
            title: sourceTitle || title,
            bangumiId,
          })
          if (cancelled) return
          roads = res.data.roads || []
          if (roads.length && (sourceUrl || chapterSrc)) {
            writeRoadsForSource(
              bangumiId,
              qPlugin,
              sourceUrl || chapterSrc,
              roads,
            )
          }
        }
        if (cancelled) return

        if (!roads.length) {
          setRoadError('续播：未解析到分集，请点击视频源重新选')
          setRoadLoading(false)
          // Allow retry (e.g. after user re-searches) by not locking the key forever
          return
        }

        const source: SearchItem = {
          name: sourceTitle,
          src: sourceUrl || qPageUrl,
        }
        let roadIdx = Math.max(0, qRoad)
        let epIdx = Math.max(0, (qEp || 1) - 1)
        if (qPageUrl) {
          for (let ri = 0; ri < roads.length; ri++) {
            const r = roads[ri]
            const found = r.data.findIndex(
              (u) =>
                u === qPageUrl ||
                u.replace(/\/$/, '') === qPageUrl.replace(/\/$/, ''),
            )
            if (found >= 0) {
              roadIdx = ri
              epIdx = found
              break
            }
          }
        }

        const epNum = epIdx + 1
        // Sync resume before episode/selection commit so first player mount seeks
        const pos = lookupResumePosition(bangumiId, qPlugin, epNum, roadIdx)
        resumeOverrideRef.current = null
        setResumePosition(pos)

        if (!isWatchPage()) return
        if (cancelled) return

        const targetPageUrl = roads[roadIdx]?.data[epIdx] || qPageUrl
        setSelection({ plugin, source, roads })
        setVisibleRoad(roadIdx)
        setRoadError('')
        setEpisode({
          pageUrl: targetPageUrl,
          episode: epNum,
          road: roadIdx,
        })

        if (source.src) {
          useSourceBindingStore
            .getState()
            .setBinding(
              bangumiId,
              qPlugin,
              { sourceUrl: source.src, title: source.name, isManual: true },
              titleRefsStable,
              true,
            )
        }
        const q = new URLSearchParams(paramsRef.current)
        q.set('plugin', qPlugin)
        q.set('ep', String(epNum))
        if (roadIdx > 0) q.set('road', String(roadIdx))
        else q.delete('road')
        // Clean legacy / bloated URL params from address bar
        q.delete('pageUrl')
        q.delete('title')
        q.delete('cover')
        q.delete('source')
        safeSetParams(q, { replace: true })
        // Only lock after a successful attach
        if (!cancelled) resumeDoneFor.current = key
      } catch (e) {
        if (!cancelled) {
          setRoadError(e instanceof Error ? e.message : '续播加载失败')
        }
      } finally {
        if (!cancelled) setRoadLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // plugins length/names & item only — avoid identity thrash from ensureDefaults
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bangumiId, qPlugin, qPageUrl, qEp, qRoad, plugins.length, item])

  const resolve = useQuery({
    queryKey: [
      'resolve',
      bangumiId,
      selection?.plugin.name,
      selection?.plugin.version,
      episode?.pageUrl,
    ],
    queryFn: ({ signal }) => {
      if (!selection || !episode) throw new Error('未选择分集')
      const refresh = resolveRefreshOnce.current
      resolveRefreshOnce.current = false
      return pluginApi.resolve(selection.plugin, episode.pageUrl, {
        signal,
        refresh,
        title,
        episode: episode.episode,
        bangumiId,
      })
    },
    enabled: Boolean(selection?.plugin && episode?.pageUrl),
    retry: 1,
    // Server classifies resolve TTL; client keeps short freshness for UI
    staleTime: 60_000,
    gcTime: 10 * 60_000,
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

  function pickEpisode(epIndex: number, roadIndex = visibleRoad) {
    if (!selection) return
    const road = selection.roads[roadIndex]
    const pageUrl = road?.data[epIndex]
    if (!pageUrl) return
    if (roadIndex !== visibleRoad) setVisibleRoad(roadIndex)
    const epNum = epIndex + 1
    // Synchronous history read so VideoPlayer first mount gets correct initialTime
    const pos = lookupResumePosition(
      bangumiId,
      selection.plugin.name,
      epNum,
      roadIndex,
    )
    resumeOverrideRef.current = null
    setResumePosition(pos)
    setEpisode({
      pageUrl,
      road: roadIndex,
      episode: epNum,
    })
    const q = new URLSearchParams(paramsRef.current)
    q.set('plugin', selection.plugin.name)
    q.set('ep', String(epNum))
    if (roadIndex > 0) q.set('road', String(roadIndex))
    else q.delete('road')
    // Clean redundant metadata parameters
    q.delete('pageUrl')
    q.delete('title')
    q.delete('cover')
    q.delete('source')
    safeSetParams(q, { replace: true })
  }

  function goAdjacentEpisode(delta: number) {
    if (!selection || !episode) return
    const roadIndex = episode.road
    const road = selection.roads[roadIndex]
    if (!road?.data?.length) return
    const nextIdx = episode.episode - 1 + delta
    if (nextIdx < 0 || nextIdx >= road.data.length) return
    pickEpisode(nextIdx, roadIndex)
  }

  const onProgress = useCallback(
    (position: number, duration: number) => {
      currentPlaybackPositionRef.current = position
      if (!selection || !episode) return
      upsertHistory({
        bangumiId,
        title,
        cover,
        episode: episode.episode,
        road: episode.road,
        pluginName: selection.plugin.name,
        pageUrl: episode.pageUrl,
        sourceUrl: selection.source.src || undefined,
        playUrl: resolve.data?.data.playUrl,
        position,
        duration,
      })
    },
    [
      selection,
      episode,
      upsertHistory,
      bangumiId,
      title,
      cover,
      resolve.data?.data.playUrl,
    ],
  )

  async function reResolveFresh() {
    resolveRefreshOnce.current = true
    await resolve.refetch()
    setPlayerRemount((n) => n + 1)
  }

  async function onMediaAuthExpired(position: number) {
    if (position > 5) {
      resumeOverrideRef.current = position
      setResumePosition(position)
    }
    await reResolveFresh()
  }

  const proxyUrl = episode ? resolve.data?.data.proxyUrl : undefined
  const playUrl = episode ? resolve.data?.data.playUrl : undefined
  const forceAdFilter = Boolean(playerSettings.forceAdBlocker)
  // Per-source proxy decision: plugin's own toggle, gated by master switches.
  const currentPluginForProxy = selection?.plugin ?? null
  const preferMediaProxy = currentPluginForProxy
    ? pluginShouldUseProxy(
        currentPluginForProxy,
        mediaFullProxy,
        serverProxyEnabled,
        isProxyUnlocked,
      )
    : false
  const playback = useMemo(
    () =>
      pickPlaybackSrc({
        playUrl,
        proxyUrl,
        forceProxy: preferMediaProxy,
        forceAdFilter,
        proxyToken,
      }),
    [playUrl, proxyUrl, preferMediaProxy, forceAdFilter, proxyToken],
  )
  const mediaSrc = episode ? playback.src : ''
  const effectiveResume =
    resumeOverrideRef.current != null
      ? resumeOverrideRef.current
      : resumePosition
  const resumeTime =
    playerSettings.continuePlay && effectiveResume > RESUME_MIN_POSITION
      ? effectiveResume
      : 0

  function onMediaLoadFailed({ position }: { position: number }) {
    if (position > 5) {
      resumeOverrideRef.current = position
      setResumePosition(position)
    }
    // Mark next resolve to bypass cache and fetch fresh stream
    resolveRefreshOnce.current = true
    // Fast-fail: directly prompt user to switch source without wasteful re-resolves on dead links
    setHudMessage('视频源连接失败，建议点击右侧切换视频源')
  }

  async function reSearchCurrentSource(keyword: string) {
    const plugin = keywordTargetPlugin || selection?.plugin
    if (!plugin) return
    const kw = keyword.trim()
    if (!kw) return
    // Custom keyword search: keep manual selection, do NOT auto-pick first.
    // Dropdown keyword select uses searchOnePlugin directly with autoPickFirst.
    await searchOnePlugin(plugin, kw, {
      clearSelection: true,
      autoPickFirst: false,
      refresh: true,
      isManual: true,
    })
  }

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
        // Align currently active episode url if still in bounds
        if (episodeRef.current) {
          const curEp = episodeRef.current
          const road = roads[curEp.road] || roads[0]
          const targetEpIdx = curEp.episode - 1
          if (road?.data[targetEpIdx]) {
            setEpisode({
              pageUrl: road.data[targetEpIdx],
              episode: curEp.episode,
              road: curEp.road,
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

  // ── bangumi-oped: per-show OP/ED timestamps ──────────────────────────
  const preferBangumiOped = Boolean(playerSettings.preferBangumiOped)
  const bgmOpedQuery = useBangumiOpedData(bangumiId, preferBangumiOped)
  const episodeDurationMap = useBangumiEpisodesDuration(bangumiId, preferBangumiOped)
  const currentEp = episode?.episode ?? 0
  const localMark = useCustomOpedStore((s) =>
    bangumiId > 0 && currentEp > 0
      ? s.subjects[bangumiId]?.episodes[currentEp]
      : undefined,
  )
  const episodeDurationSeconds = useMemo(() => {
    if (!episodeDurationMap || currentEp <= 0) return undefined
    return episodeDurationMap.get(currentEp)
  }, [episodeDurationMap, currentEp])
  const opedSkip = useResolvedOpedSkip(
    preferBangumiOped ? bgmOpedQuery.data : null,
    currentEp,
    playerSettings.skipOp,
    playerSettings.skipEd,
    episodeDurationSeconds,
    preferBangumiOped,
    localMark,
  )
  const resolvedPlayerSettings = useMemo(
    () => ({
      ...playerSettings,
      ...opedSkip,
    }),
    [playerSettings, opedSkip],
  )

  return {
    bangumiId,
    title,
    cover,
    bangumiItem: item,
    subjectLoading: subject.isLoading,
    subjectError: subject.error,
    keywordCandidates,
    titleRefs,
    sessionKeywords,
    searchResults,
    searchKeyword,
    defaultKeyword,
    defaultSourceName: findDefaultSourcePlugin(plugins, pluginOrder, isOld)?.name || plugins[0]?.name || '',
    selection,
    episode,
    visibleRoad,
    setVisibleRoad,
    roadLoading,
    roadError,
    pendingSource,
    keywordTargetPlugin,
    setKeywordTargetPlugin: setManualKeywordTargetPlugin,
    mediaSrc,
    playbackMode: playback.mode,
    /** direct | playlist-proxy (ad hybrid) | full-proxy — for WatchMeta hint */
    playbackTransit: playback.transit,
    // Include resume bucket so late history hydrate / auth remount re-seeks
    playerKey: `${mediaSrc}#${playerRemount}#${playback.mode}#r${Math.floor(resumeTime)}`,
    resumeTime,
    resolveLoading: Boolean(selection && episode && resolve.isLoading),
    resolveError: resolve.error,
    diagnostics: resolve.data?.data.diagnostics,
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
    pickEpisode,
    goAdjacentEpisode,
    onProgress,
    onMediaAuthExpired,
    onMediaLoadFailed,
    refetchResolve: () => {
      resolveRefreshOnce.current = true
      void resolve.refetch()
    },
    refreshChapters,
    hudMessage,
    clearHudMessage,
    bgmOpedData: bgmOpedQuery.data,
    pageUrl: episode?.pageUrl || qPageUrl,
    pluginName: selection?.plugin.name || qPlugin,
  }
}

export { bestTitleSimilarity }
