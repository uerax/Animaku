import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bestTitleSimilarity,
  findDefaultSourcePlugin,
  rankSearchItems,
  type PluginMeta,
  type SearchItem,
} from '@animaku/shared'
import { pluginApi } from './plugin-api'
import {
  getCachedPluginSearch,
  setCachedPluginSearch,
} from './plugin-result-cache'
import { useSourceBindingStore } from '../stores/source-bindings'
import {
  orderSearchRows,
  resolveKeywordForPlugin,
  type BangumiItemLike,
} from './watch-keywords'
import type { EpisodePlay, SearchRow, SourceSelection } from './use-watch-session'

export const AUTO_PICK_MIN_SIMILARITY = 0.55

export interface UseWatchSourceSearchOptions {
  bangumiId: number
  title: string
  resolvedItem?: BangumiItemLike
  titleRefs: string[]
  keywordCandidates: string[]
  defaultKeyword: string
  plugins: PluginMeta[]
  pluginOrder: string[]
  isOld: boolean
  boostedPluginNames: Set<string>
  keywordTargetPlugin: PluginMeta | null
  setKeywordTargetPlugin: (p: PluginMeta | null) => void
  keywordTargetPluginRef: React.MutableRefObject<PluginMeta | null>
  selection: SourceSelection | null
  selectionRef: React.MutableRefObject<SourceSelection | null>
  setSelection: React.Dispatch<React.SetStateAction<SourceSelection | null>>
  setEpisode: React.Dispatch<React.SetStateAction<EpisodePlay | null>>
  setRoadError: (err: string) => void
  setHudMessage: (msg: string | null) => void
  pickSourceRef: React.MutableRefObject<
    ((plugin: PluginMeta, item: SearchItem) => Promise<void>) | null
  >
}

export interface UseWatchSourceSearchResult {
  searchResults: SearchRow[]
  setSearchResults: React.Dispatch<React.SetStateAction<SearchRow[]>>
  searchKeyword: string
  setSearchKeyword: (kw: string) => void
  sessionKeywords: Record<string, string[]>
  manualKeywords: Record<string, string>
  setManualKeywords: React.Dispatch<React.SetStateAction<Record<string, string>>>
  defaultSearchEmpty: boolean
  setDefaultSearchEmpty: (empty: boolean) => void
  getPluginKeyword: (plugin: PluginMeta) => string
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
  reSearchCurrentSource: (keyword: string) => Promise<void>
  rememberSessionKeyword: (pluginName: string, keyword: string) => void
  resetSearchState: () => void
}

/**
 * 视频源多源并发检索与候选状态机子 Hook：
 * 负责各视频源插件的搜索请求生命周期（生成计数器、请求中止 AbortController、本地缓存）、
 * 标题相似度安全筛选（Auto Pick）、无结果自愈提权以及用户分源自定义搜索词持久记忆。
 */
export function useWatchSourceSearch({
  bangumiId,
  title,
  resolvedItem,
  titleRefs,
  keywordCandidates,
  defaultKeyword,
  plugins,
  pluginOrder,
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
}: UseWatchSourceSearchOptions): UseWatchSourceSearchResult {
  const [searchResults, setSearchResults] = useState<SearchRow[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [sessionKeywords, setSessionKeywords] = useState<Record<string, string[]>>({})
  const [manualKeywords, setManualKeywords] = useState<Record<string, string>>({})
  const [defaultSearchEmpty, setDefaultSearchEmpty] = useState(false)

  const pluginSearchGen = useRef<Record<string, number>>({})
  const pluginSearchAbort = useRef<Record<string, AbortController>>({})
  const prevBangumiIdRef = useRef(bangumiId)

  const getPluginKeyword = useCallback(
    (plugin: PluginMeta) =>
      resolveKeywordForPlugin(plugin, resolvedItem, defaultKeyword, manualKeywords),
    [manualKeywords, resolvedItem, defaultKeyword],
  )

  const resetSearchState = useCallback(() => {
    setSessionKeywords({})
    setManualKeywords({})
    pluginSearchGen.current = {}
    setSearchKeyword('')
    setDefaultSearchEmpty(false)
  }, [])

  // Seed / refresh idle plugin rows without wiping in-progress selection.
  // Keep the row order aligned with the user's configured source order.
  useEffect(() => {
    const isNewSubject = prevBangumiIdRef.current !== bangumiId
    prevBangumiIdRef.current = bangumiId

    setSearchResults((prev) => {
      const byName = isNewSubject ? new Map() : new Map(prev.map((r) => [r.plugin.name, r]))
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
      return orderSearchRows(rows, pluginOrder, isOld, boostedPluginNames)
    })
  }, [plugins, bangumiId, pluginOrder, isOld, boostedPluginNames])

  // Keep default keyword in state for UI once subject loads
  useEffect(() => {
    const target =
      keywordTargetPlugin ||
      selection?.plugin ||
      findDefaultSourcePlugin(plugins, pluginOrder, isOld, boostedPluginNames)
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
    boostedPluginNames,
    getPluginKeyword,
    searchKeyword,
  ])

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
        manualKeyword?: boolean
        /** Silent background preload: does not mutate active keyword or target plugin in UI */
        background?: boolean
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
      if (opts?.manualKeyword) {
        setManualKeywords((prev) => ({
          ...prev,
          [plugin.name]: keyword.trim(),
        }))
      }
      rememberSessionKeyword(plugin.name, keyword)
      if (!opts?.background) {
        setSearchKeyword(keyword)
        setKeywordTargetPlugin(plugin)
      }

      setSearchResults((prev) => {
        const exists = prev.some((r) => r.plugin.name === plugin.name)
        if (!exists) {
          return orderSearchRows(
            [
              ...prev,
              {
                plugin,
                items: [],
                pending: true,
                searched: true,
                keyword,
              },
            ],
            pluginOrder,
          )
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
        const cached = bypassClient ? undefined : getCachedPluginSearch(plugin, keyword)
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
        items = rankSearchItems(raw, [...titleRefs, keyword, ...keywordCandidates])
        if (!items.length) {
          if (!opts?.manualKeyword) {
            useSourceBindingStore.getState().removeBinding(bangumiId, plugin.name)
          }
          const diag = (res.data.diagnostics || []).filter(Boolean)
          const useful = diag.find(
            (d) => !d.startsWith('关键词变体') && !d.startsWith('关键词回退'),
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
      const isDefault =
        plugin.name.toLowerCase() ===
        (
          findDefaultSourcePlugin(plugins, pluginOrder, isOld, boostedPluginNames)?.name || ''
        ).toLowerCase()
      const shouldAutoPick =
        !opts?.background &&
        Boolean(items[0]) &&
        (opts?.autoPickFirst ||
          ((isDefault || opts?.clearSelection) &&
            (opts?.clearSelection || !selectionRef.current)))

      if (!items.length) {
        if (opts?.autoPickFirst && !selectionRef.current) {
          setDefaultSearchEmpty(true)
          setRoadError(`${plugin.name} 未搜到该番剧资源，请点击上方「视频源」选择其他播放源`)
          setHudMessage(`${plugin.name} 未搜到该番剧，请切换视频源`)
        }
      } else if (shouldAutoPick && items[0]) {
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
          ...titleRefs,
          keyword,
          ...keywordCandidates,
        ])
        if (score >= AUTO_PICK_MIN_SIMILARITY) {
          try {
            await pickSourceRef.current?.(plugin, items[0])
          } catch {
            /* pickSource already set roadError and cleaned state */
          }
        } else {
          if (opts?.autoPickFirst && !selectionRef.current) {
            setRoadError(`${plugin.name} 搜索结果与当前番剧标题不够相近，请在「视频源」中确认或点选`)
            setHudMessage(`${plugin.name} 未自动匹配，请在视频源中点选`)
          }
          if (!error) {
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
      }
    },
    [
      title,
      bangumiId,
      titleRefs,
      keywordCandidates,
      rememberSessionKeyword,
      pickSourceRef,
      plugins,
      pluginOrder,
      isOld,
      boostedPluginNames,
      setKeywordTargetPlugin,
      setSelection,
      setEpisode,
      selectionRef,
      keywordTargetPluginRef,
      setRoadError,
      setHudMessage,
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
        manualKeyword?: boolean
        background?: boolean
      },
    ) => {
      const isCustomKw = Boolean(keyword?.trim() || opts?.manualKeyword)
      if (isCustomKw && keyword?.trim()) {
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
      await searchOnePlugin(plugin, kw, { ...opts, manualKeyword: isCustomKw })
    },
    [searchOnePlugin, getPluginKeyword, searchKeyword, defaultKeyword],
  )

  const reSearchCurrentSource = useCallback(
    async (keyword: string) => {
      const plugin = keywordTargetPlugin || selection?.plugin
      if (!plugin) return
      const kw = keyword.trim()
      if (!kw) return
      await searchOnePlugin(plugin, kw, {
        clearSelection: true,
        autoPickFirst: false,
        refresh: true,
        manualKeyword: true,
      })
    },
    [keywordTargetPlugin, selection?.plugin, searchOnePlugin],
  )

  return {
    searchResults,
    setSearchResults,
    searchKeyword,
    setSearchKeyword,
    sessionKeywords,
    manualKeywords,
    setManualKeywords,
    defaultSearchEmpty,
    setDefaultSearchEmpty,
    getPluginKeyword,
    searchOnePlugin,
    openPluginSearch,
    reSearchCurrentSource,
    rememberSessionKeyword,
    resetSearchState,
  }
}
