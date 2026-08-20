import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BangumiItem,
  type PluginMeta,
  type SearchItem,
  bestTitleSimilarity,
  rankSearchItems,
  resolvePluginDefaultKeyword,
} from '@animaku/shared'
import { pluginApi } from './plugin-api'
import { getCachedPluginSearch, setCachedPluginSearch } from './plugin-result-cache'
import { useSourceBindingStore, type SourceBindingEntry } from '../stores/source-bindings'
import { AUTO_PICK_MIN_SIMILARITY, type SourceSelection } from './use-watch-session'

export type SourceProbeStatus =
  | 'idle'
  | 'probing'
  | 'ready' // 🟢 Emerald
  | 'needs_pick' // 🟡 Amber
  | 'empty' // 🔴 Gray / 未收录
  | 'error' // 🔴 Rose / 超时

export interface AggregatedSourceState {
  plugin: PluginMeta
  status: SourceProbeStatus
  binding?: SourceBindingEntry
  items: SearchItem[]
  matchedItem?: SearchItem
  errorMsg?: string
  searched: boolean
  keyword?: string
}

export interface UseSourceAggregatorOptions {
  bangumiId: number
  plugins: PluginMeta[]
  pluginOrder: string[]
  titleRefs: string[]
  item?: BangumiItem | null
  defaultKeyword: string
  isOpen: boolean
  activePluginName?: string
  selection?: SourceSelection | null
}

const CONCURRENCY_LIMIT = 2
const PROBE_TIMEOUT_MS = 5000
/** Limit automatic background probing to top N priority sources when board opens */
export const AUTO_PROBE_LIMIT = 6

export function useSourceAggregator({
  bangumiId,
  plugins,
  pluginOrder,
  titleRefs,
  item,
  defaultKeyword,
  isOpen,
  activePluginName,
  selection,
}: UseSourceAggregatorOptions) {
  const [sources, setSources] = useState<Record<string, AggregatedSourceState>>({})
  const activeJobsRef = useRef<number>(0)
  const queueRef = useRef<string[]>([])
  const abortControllersRef = useRef<Record<string, AbortController>>({})
  const probeDoneRef = useRef<Record<string, boolean>>({})
  const customKeywordsRef = useRef<Record<string, string>>({})
  const activeAutoJobsRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Abort all on unmount
      for (const key of Object.keys(abortControllersRef.current)) {
        try {
          abortControllersRef.current[key]?.abort()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  // Reset when bangumiId changes
  useEffect(() => {
    for (const key of Object.keys(abortControllersRef.current)) {
      try {
        abortControllersRef.current[key]?.abort()
      } catch {
        /* ignore */
      }
    }
    abortControllersRef.current = {}
    probeDoneRef.current = {}
    customKeywordsRef.current = {}
    activeAutoJobsRef.current.clear()
    queueRef.current = []
    activeJobsRef.current = 0
    setSources({})
  }, [bangumiId])

  // Sync / initialize plugin state list
  useEffect(() => {
    if (!plugins.length || !Number.isFinite(bangumiId) || bangumiId <= 0) return

    setSources((prev) => {
      const next = { ...prev }
      const bindingStore = useSourceBindingStore.getState()

      for (const p of plugins) {
        const isCurrentActive =
          (selection && selection.plugin.name.toLowerCase() === p.name.toLowerCase()) ||
          (activePluginName && p.name.toLowerCase() === activePluginName.toLowerCase())

        if (isCurrentActive && selection?.source && selection.roads?.length) {
          if (!next[p.name] || (!next[p.name].searched && next[p.name].status === 'idle')) {
            probeDoneRef.current[p.name] = true
            next[p.name] = {
              plugin: p,
              status: 'ready',
              items: [selection.source],
              matchedItem: selection.source,
              searched: true,
            }
          } else {
            next[p.name] = {
              ...next[p.name],
              plugin: p,
            }
          }
        } else if (!next[p.name]) {
          const binding = bindingStore.getBinding(bangumiId, p.name)
          if (binding?.sourceUrl) {
            probeDoneRef.current[p.name] = true
            next[p.name] = {
              plugin: p,
              status: 'ready',
              binding,
              items: [{ name: binding.title || p.name, src: binding.sourceUrl }],
              matchedItem: { name: binding.title || p.name, src: binding.sourceUrl },
              searched: true,
            }
          } else {
            next[p.name] = {
              plugin: p,
              status: 'idle',
              items: [],
              searched: false,
            }
          }
        } else {
          // Update plugin metadata if changed
          next[p.name] = {
            ...next[p.name],
            plugin: p,
          }
        }
      }
      return next
    })
  }, [plugins, bangumiId, selection, activePluginName])

  // When selection is active and has valid roads, keep its status synchronized as ready
  const prevSelectionKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selection?.plugin || !selection.roads?.length) return
    const key = `${selection.plugin.name}::${selection.source.src}`
    if (prevSelectionKeyRef.current === key) return
    prevSelectionKeyRef.current = key

    const name = selection.plugin.name
    probeDoneRef.current[name] = true
    setSources((prev) => ({
      ...prev,
      [name]: {
        plugin: selection.plugin,
        status: 'ready',
        items: prev[name]?.items?.length ? prev[name].items : [selection.source],
        matchedItem: selection.source,
        searched: true,
        keyword: prev[name]?.keyword,
      },
    }))
  }, [selection])

  const processQueue = useCallback(async () => {
    if (!mountedRef.current || !isOpen) return

    while (activeJobsRef.current < CONCURRENCY_LIMIT && queueRef.current.length > 0) {
      const pluginName = queueRef.current.shift()
      if (!pluginName) break

      const plugin = plugins.find((p) => p.name === pluginName)
      if (!plugin || probeDoneRef.current[pluginName]) continue

      activeJobsRef.current++
      probeDoneRef.current[pluginName] = true

      const customKw = customKeywordsRef.current[pluginName]
      const isManual = Boolean(customKw)
      if (!isManual) {
        activeAutoJobsRef.current.add(pluginName)
      } else {
        activeAutoJobsRef.current.delete(pluginName)
      }

      const kw = (
        customKw ||
        resolvePluginDefaultKeyword(plugin, item, defaultKeyword) ||
        ''
      ).trim()

      setSources((prev) => ({
        ...prev,
        [pluginName]: {
          ...(prev[pluginName] || { plugin, items: [] }),
          status: 'probing',
          searched: true,
          keyword: kw,
        },
      }))

      const ac = new AbortController()
      abortControllersRef.current[pluginName] = ac
      const timeoutId = setTimeout(() => {
        ac.abort(new Error('timeout'))
      }, PROBE_TIMEOUT_MS)

      ;(async () => {
        if (!kw || /^番剧\s*\d+$/.test(kw)) {
          clearTimeout(timeoutId)
          if (mountedRef.current) {
            activeAutoJobsRef.current.delete(pluginName)
            setSources((prev) => ({
              ...prev,
              [pluginName]: {
                plugin,
                status: 'empty',
                items: [],
                searched: true,
                keyword: kw,
              },
            }))
            activeJobsRef.current--
            void processQueue()
          }
          return
        }

        try {
          const bypassCache = Boolean(customKw)
          const cached = bypassCache ? undefined : getCachedPluginSearch(plugin, kw)
          const res = cached
            ? { data: cached }
            : await pluginApi.search(plugin, kw, { signal: ac.signal, refresh: bypassCache })
          clearTimeout(timeoutId)

          if (!cached) {
            setCachedPluginSearch(plugin, kw, res.data)
          }

          if (!mountedRef.current) return

          const raw = res.data.items || []
          const ranked = rankSearchItems(raw, [...titleRefs, kw])

          if (!ranked.length) {
            setSources((prev) => ({
              ...prev,
              [pluginName]: {
                plugin,
                status: 'empty',
                items: [],
                searched: true,
                keyword: kw,
              },
            }))
          } else {
            const top = ranked[0]
            const score = bestTitleSimilarity(top.name, [...titleRefs, kw])

            if (score >= AUTO_PICK_MIN_SIMILARITY) {
              setSources((prev) => ({
                ...prev,
                [pluginName]: {
                  plugin,
                  status: 'ready',
                  items: ranked,
                  matchedItem: top,
                  searched: true,
                  keyword: kw,
                },
              }))
            } else {
              setSources((prev) => ({
                ...prev,
                [pluginName]: {
                  plugin,
                  status: 'needs_pick',
                  items: ranked,
                  searched: true,
                  keyword: kw,
                },
              }))
            }
          }
        } catch (err: unknown) {
          clearTimeout(timeoutId)
          if (!mountedRef.current) return
          const isTimeout =
            ac.signal.aborted ||
            (err instanceof Error && /timeout|超时/i.test(err.message))
          setSources((prev) => ({
            ...prev,
            [pluginName]: {
              plugin,
              status: 'error',
              errorMsg: isTimeout ? '源站超时 (5s)' : '源站响应异常',
              items: [],
              searched: true,
              keyword: kw,
            },
          }))
        } finally {
          if (mountedRef.current) {
            activeJobsRef.current--
            activeAutoJobsRef.current.delete(pluginName)
            delete abortControllersRef.current[pluginName]
            void processQueue()
          }
        }
      })()
    }
  }, [isOpen, plugins, bangumiId, item, defaultKeyword, titleRefs])

  // Trigger streaming probe when panel is opened
  useEffect(() => {
    if (!isOpen || !plugins.length || !Number.isFinite(bangumiId) || bangumiId <= 0) {
      return
    }

    const unprobed: string[] = []
    for (const p of plugins) {
      if (!probeDoneRef.current[p.name] && p.name.toLowerCase() !== activePluginName?.toLowerCase()) {
        unprobed.push(p.name)
      }
    }

    if (unprobed.length > 0) {
      // Prioritize sources in user order
      const ordered = [...unprobed].sort((a, b) => {
        const ia = pluginOrder.indexOf(a)
        const ib = pluginOrder.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return 0
      })

      // Auto-probe top N sources by priority (AUTO_PROBE_LIMIT = 6); rest remain idle until on-demand click
      const autoProbed = ordered.slice(0, AUTO_PROBE_LIMIT)
      queueRef.current = Array.from(new Set([...queueRef.current, ...autoProbed]))
      void processQueue()
    }
  }, [isOpen, plugins, pluginOrder, bangumiId, activePluginName, processQueue])

  // Preemption: User clicks a specific source card -> jump to front of queue
  const prioritizePlugin = useCallback(
    (pluginName: string, isManual = true) => {
      if (abortControllersRef.current[pluginName]) {
        try {
          abortControllersRef.current[pluginName].abort()
        } catch {
          /* ignore */
        }
        delete abortControllersRef.current[pluginName]
      }
      probeDoneRef.current[pluginName] = false

      // Preempt background auto-job if concurrency is full and user made a manual action
      if (isManual && activeJobsRef.current >= CONCURRENCY_LIMIT) {
        for (const autoJobName of activeAutoJobsRef.current) {
          if (autoJobName !== pluginName && abortControllersRef.current[autoJobName]) {
            try {
              abortControllersRef.current[autoJobName].abort()
            } catch {
              /* ignore */
            }
            delete abortControllersRef.current[autoJobName]
            activeAutoJobsRef.current.delete(autoJobName)
            probeDoneRef.current[autoJobName] = false
            queueRef.current.push(autoJobName)
            break
          }
        }
      }

      // Remove from current queue and insert at head
      queueRef.current = [
        pluginName,
        ...queueRef.current.filter((name) => name !== pluginName),
      ]
      void processQueue()
    },
    [processQueue],
  )

  const reProbePlugin = useCallback(
    (pluginName: string, customKeyword?: string) => {
      const kw = customKeyword?.trim()
      if (kw) {
        customKeywordsRef.current[pluginName] = kw
      }
      // Instant visual feedback: set status to 'probing' immediately
      setSources((prev) => {
        const p = plugins.find((item) => item.name === pluginName)
        if (!p && !prev[pluginName]) return prev
        return {
          ...prev,
          [pluginName]: {
            ...(prev[pluginName] || { plugin: p!, items: [] }),
            status: 'probing',
            keyword: kw || prev[pluginName]?.keyword,
            searched: true,
          },
        }
      })
      prioritizePlugin(pluginName, true)
    },
    [plugins, prioritizePlugin],
  )

  return {
    sources,
    prioritizePlugin,
    reProbePlugin,
  }
}
