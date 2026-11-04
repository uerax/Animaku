import { useEffect } from 'react'
import type { NavigateOptions, URLSearchParamsInit } from 'react-router-dom'
import {
  buildPlayableSlots,
  rankSearchItems,
  resolvePluginDefaultKeyword,
  resolveTargetSourcePlugin,
  type BangumiEpisode,
  type PlayableSlot,
  type PluginMeta,
  type SearchItem,
} from '@animaku/shared'
import { pluginApi } from './plugin-api'
import { findRoadsForPlay, writeRoadsForSource } from './roads-cache'
import { usePluginStore } from '../stores/plugins'
import { useSourceBindingStore } from '../stores/source-bindings'
import { lookupHistorySourceUrl, lookupResumePosition } from './watch-resume'
import type { BangumiItemLike } from './watch-keywords'
import type { EpisodePlay, SourceSelection } from './use-watch-session'

export interface UseWatchSourceLauncherOptions {
  bangumiId: number
  title: string
  titleRefs: string[]
  resolvedItem?: BangumiItemLike
  defaultKeyword: string
  plugins: PluginMeta[]
  pluginOrder: string[]
  isOld: boolean
  boostedPluginNames: Set<string>
  qPlugin: string
  qPageUrl: string
  qEp: number | undefined
  qRoad: number
  paramsRef: React.MutableRefObject<URLSearchParams>
  selectionRef: React.MutableRefObject<SourceSelection | null>
  episodeRef: React.MutableRefObject<EpisodePlay | null>
  keywordTargetPluginRef: React.MutableRefObject<PluginMeta | null>
  setKeywordTargetPlugin: (p: PluginMeta | null) => void
  setSelection: React.Dispatch<React.SetStateAction<SourceSelection | null>>
  setEpisode: React.Dispatch<React.SetStateAction<EpisodePlay | null>>
  setVisibleRoad: (r: number) => void
  setResumePosition: (pos: number) => void
  resumeOverrideRef: React.MutableRefObject<number | null>
  setRoadLoading: (loading: boolean) => void
  setRoadError: (err: string) => void
  setHudMessage: (msg: string | null) => void
  setSearchKeyword: (kw: string) => void
  bgmEpisodes: BangumiEpisode[] | undefined
  isWatchPage: () => boolean
  safeSetParams: (nextInit: URLSearchParamsInit, navigateOptions?: NavigateOptions) => void
  pickSource: (plugin: PluginMeta, item: SearchItem) => Promise<void>
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
  resumeDoneFor: React.MutableRefObject<string | null>
  defaultSearchDoneFor: React.MutableRefObject<number | null>
}

/**
 * 播放会话自启动与续播定位调度子 Hook：
 * 1. 负责新番剧首次打开时的智能选源策略（记忆绑定 0ms 恢复、前 5 源并发预热及默认源自动开播）
 * 2. 负责从深度链接（URL ?plugin=...&ep=...）或历史记录进入时的无损集数槽位对齐与精准 Seek 进度还原
 */
export function useWatchSourceLauncher({
  bangumiId,
  title,
  titleRefs,
  resolvedItem,
  defaultKeyword,
  plugins,
  pluginOrder,
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
  bgmEpisodes,
  isWatchPage,
  safeSetParams,
  pickSource,
  openPluginSearch,
  resumeDoneFor,
  defaultSearchDoneFor,
}: UseWatchSourceLauncherOptions): void {
  // First visit (not history resume): check persistent binding for target/default source first (0ms),
  // otherwise search the target/default source and auto-pick the first hit.
  useEffect(() => {
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) return
    if (defaultSearchDoneFor.current === bangumiId) return
    if (selectionRef.current) return

    // If deep-link with specific episode/pageUrl, deep-link resume handler will take care of it
    if (qPlugin && (qPageUrl || qEp !== undefined)) {
      defaultSearchDoneFor.current = bangumiId
      const target =
        plugins.find((p) => p.name.toLowerCase() === qPlugin.toLowerCase()) ||
        usePluginStore.getState().getByName(qPlugin)
      if (target && !keywordTargetPluginRef.current) {
        setKeywordTargetPlugin(target)
      }
      return
    }
    if (!plugins.length) return

    const preferred = resolveTargetSourcePlugin(
      qPlugin,
      plugins,
      pluginOrder,
      isOld,
      (name) => usePluginStore.getState().getByName(name),
      boostedPluginNames,
    )
    if (!preferred) return

    // 默认选取前 5 个优先级最高的源并发搜索（不足 5 个则全量选取）
    const topPlugins = [
      preferred,
      ...plugins.filter((p) => p.name.toLowerCase() !== preferred.name.toLowerCase()),
    ].slice(0, 5)

    // Check persistent binding first (0ms)!
    const binding = useSourceBindingStore.getState().getBinding(bangumiId, preferred.name)

    if (binding?.sourceUrl) {
      defaultSearchDoneFor.current = bangumiId
      setKeywordTargetPlugin(preferred)
      // 并发预热其余前排备选源，使换源面板或容灾降级 0ms 瞬间就绪
      const warmKw = (
        resolvePluginDefaultKeyword(preferred, resolvedItem, defaultKeyword) ||
        defaultKeyword ||
        binding.title ||
        title
      ).trim()
      if (warmKw && !/^番剧\s*\d+$/.test(warmKw)) {
        for (const p of topPlugins.slice(1)) {
          const pKw = (
            resolvePluginDefaultKeyword(p, resolvedItem, warmKw) ||
            warmKw
          ).trim()
          void openPluginSearch(p, pKw, { autoPickFirst: false, background: true })
        }
      }
      void pickSource(preferred, {
        name: binding.title || preferred.name,
        src: binding.sourceUrl,
      }).catch(() => {
        // Failed binding, remove and fallback to search
        useSourceBindingStore.getState().removeBinding(bangumiId, preferred.name)
        const kw = (
          resolvePluginDefaultKeyword(
            preferred,
            resolvedItem,
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
        resolvedItem,
        defaultKeyword,
      ) || ''
    ).trim()
    if (!kw || /^番剧\s*\d+$/.test(kw)) return

    defaultSearchDoneFor.current = bangumiId
    setKeywordTargetPlugin(preferred)
    setSearchKeyword(kw)

    // 并发搜索前 5 个源：默认源主导自动选集开播，其余源后台静默预热
    topPlugins.forEach((p, idx) => {
      const isDefault = idx === 0
      const searchKw = isDefault
        ? kw
        : (resolvePluginDefaultKeyword(p, resolvedItem, kw) || kw).trim()
      void openPluginSearch(p, searchKw, {
        autoPickFirst: isDefault,
        background: !isDefault,
      })
    })
  }, [
    bangumiId,
    qPlugin,
    qPageUrl,
    qEp,
    plugins,
    pluginOrder,
    isOld,
    boostedPluginNames,
    resolvedItem,
    defaultKeyword,
    openPluginSearch,
    pickSource,
    defaultSearchDoneFor,
    selectionRef,
    keywordTargetPluginRef,
    setKeywordTargetPlugin,
    setSearchKeyword,
  ])

  // Resume from deep-link query (history / home / shared clean link)
  useEffect(() => {
    if (!Number.isFinite(bangumiId) || !qPlugin || (!qPageUrl && qEp === undefined)) return
    const key = `${bangumiId}|${qPlugin}|${qPageUrl}|${qEp ?? ''}|${qRoad}`
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
      const targetRoad = currentSel.roads[roadIdx] || currentSel.roads[0]
      const slots = buildPlayableSlots(targetRoad, bgmEpisodes)

      let targetSlot: PlayableSlot | undefined
      if (qPageUrl) {
        targetSlot = slots.find(
          (s) =>
            s.pageUrl === qPageUrl ||
            s.pageUrl.replace(/\/$/, '') === qPageUrl.replace(/\/$/, ''),
        )
      } else if (qEp !== undefined && qEp >= 0) {
        targetSlot = slots.find((s) => s.canonicalEp === qEp)
      }

      if (!targetSlot && slots.length > 0) {
        const fallbackIdx =
          qEp !== undefined && qEp >= 0
            ? Math.max(0, Math.min(qEp === 0 ? 0 : qEp - 1, slots.length - 1))
            : 0
        targetSlot = slots[fallbackIdx] || slots[0]
      }

      if (targetSlot) {
        const epNum = targetSlot.canonicalEp
        const targetPageUrl = targetSlot.pageUrl
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
            sourceIndex: targetSlot.sourceIndex,
            officialTitle: targetSlot.officialTitle,
            displayTitle: targetSlot.displayTitle,
            sourceTitle: targetSlot.sourceTitle,
            isLayer2: targetSlot.isLayer2,
          })
        }
      }
      return
    }

    const plugin =
      usePluginStore.getState().getByName(qPlugin) ||
      plugins.find((p) => p.name === qPlugin)
    if (!plugin || plugin.enabled === false) return

    let cancelled = false

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
        let sourceTitle = boundItem?.title || title || qPlugin

        // If not bound on this device yet (e.g. shared link), auto-search and bind best match
        if (!sourceUrl) {
          const kw = (
            resolvePluginDefaultKeyword(
              plugin,
              resolvedItem,
              defaultKeyword,
            ) || ''
          ).trim()
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
            const ranked = rankSearchItems(searchRes.data.items, titleRefs)
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
          if (!cancelled) resumeDoneFor.current = key
          setRoadError('续播：未解析到分集，请点击视频源重新选')
          setRoadLoading(false)
          setHudMessage('分集解析失败，请点击下方视频源重新选源')
          return
        }

        const source: SearchItem = {
          name: sourceTitle,
          src: sourceUrl || qPageUrl,
        }
        let roadIdx = Math.max(0, qRoad)
        const targetRoad = roads[roadIdx] || roads[0]
        const slots = buildPlayableSlots(targetRoad, bgmEpisodes)
        let targetSlot: PlayableSlot | undefined

        if (qPageUrl) {
          targetSlot = slots.find(
            (s) =>
              s.pageUrl === qPageUrl ||
              s.pageUrl.replace(/\/$/, '') === qPageUrl.replace(/\/$/, ''),
          )
        } else if (qEp !== undefined && qEp >= 0) {
          targetSlot = slots.find((s) => s.canonicalEp === qEp)
        }

        if (!targetSlot && slots.length > 0) {
          const fallbackIdx =
            qEp !== undefined && qEp >= 0
              ? Math.max(0, Math.min(qEp === 0 ? 0 : qEp - 1, slots.length - 1))
              : 0
          targetSlot = slots[fallbackIdx] || slots[0]
        }

        const epNum = targetSlot?.canonicalEp ?? 1
        const targetPageUrl = targetSlot?.pageUrl || targetRoad?.data[0] || qPageUrl

        const pos = lookupResumePosition(bangumiId, qPlugin, epNum, roadIdx)
        resumeOverrideRef.current = null
        setResumePosition(pos)

        if (!isWatchPage()) return
        if (cancelled) return

        setSelection({ plugin, source, roads })
        setVisibleRoad(roadIdx)
        setRoadError('')
        setEpisode({
          pageUrl: targetPageUrl,
          episode: epNum,
          road: roadIdx,
          sourceIndex: targetSlot?.sourceIndex ?? 0,
          officialTitle: targetSlot?.officialTitle,
          displayTitle: targetSlot?.displayTitle,
          sourceTitle: targetSlot?.sourceTitle,
          isLayer2: targetSlot?.isLayer2,
        })

        if (source.src) {
          useSourceBindingStore
            .getState()
            .setBinding(
              bangumiId,
              qPlugin,
              { sourceUrl: source.src, title: source.name },
              titleRefs,
            )
        }
        const q = new URLSearchParams(paramsRef.current)
        if (paramsRef.current.has('plugin')) {
          q.set('plugin', qPlugin)
        }
        q.set('ep', String(epNum))
        if (roadIdx > 0) q.set('road', String(roadIdx))
        else q.delete('road')
        q.delete('pageUrl')
        q.delete('source')
        safeSetParams(q, { replace: true })
        if (!cancelled) resumeDoneFor.current = key
      } catch (e) {
        if (!cancelled) {
          resumeDoneFor.current = key
          const msg = e instanceof Error ? e.message : '续播加载失败'
          setRoadError(msg)
          setHudMessage(`视频源分集加载失败：${msg}，建议切换视频源`)
        }
      } finally {
        if (!cancelled) setRoadLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bangumiId, qPlugin, qPageUrl, qEp, qRoad, plugins.length, resolvedItem])
}
