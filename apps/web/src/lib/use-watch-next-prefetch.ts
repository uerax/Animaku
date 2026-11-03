import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PlayableSlot, PluginMeta } from '@animaku/shared'
import { pluginApi } from './plugin-api'

export interface UseWatchNextPrefetchOptions {
  bangumiId: number
  title: string
  plugin?: PluginMeta | null
  hasNextEpisode: boolean
  nextSlot?: PlayableSlot | null
}

export interface UseWatchNextPrefetchResult {
  /** 手动触发下一集流预取 */
  prefetchNextEpisode: () => void
  /** 在播放进度高频更新时按 85% 阈值条件触发预取 */
  maybePrefetchOnProgress: (position: number, duration: number) => void
}

/**
 * 播放页下一集流后台预解析 Hook：
 * 当播放进度达到 85%（且有效时长 > 60s）时，静默调用 React Query prefetchQuery 预取下一集 stream，
 * 附带全局防重缓存键，杜绝播放期间数十次高频重复触发与浪费带宽。
 */
export function useWatchNextPrefetch({
  bangumiId,
  title,
  plugin,
  hasNextEpisode,
  nextSlot,
}: UseWatchNextPrefetchOptions): UseWatchNextPrefetchResult {
  const queryClient = useQueryClient()
  const prefetchedNextEpisodeRef = useRef<string>('')

  const prefetchNextEpisode = useCallback(() => {
    if (!plugin || !hasNextEpisode || !nextSlot?.pageUrl) return

    const prefetchKey = `${bangumiId}|${plugin.name}|${plugin.version}|${nextSlot.pageUrl}`
    if (prefetchedNextEpisodeRef.current === prefetchKey) return
    prefetchedNextEpisodeRef.current = prefetchKey

    const queryKey = [
      'resolve',
      bangumiId,
      plugin.name,
      plugin.version,
      nextSlot.pageUrl,
    ]

    void queryClient.prefetchQuery({
      queryKey,
      queryFn: ({ signal }) =>
        pluginApi.resolve(plugin, nextSlot.pageUrl, {
          signal,
          title,
          episode: nextSlot.canonicalEp,
          bangumiId,
        }),
      staleTime: 60_000,
    })
  }, [plugin, hasNextEpisode, nextSlot, bangumiId, title, queryClient])

  const maybePrefetchOnProgress = useCallback(
    (position: number, duration: number) => {
      // 仅在确实有下一集、播放进度达到 85% 且时长有效（>60s）时，提前在后台预解析下一集流地址
      if (hasNextEpisode && duration > 60 && position / duration >= 0.85) {
        prefetchNextEpisode()
      }
    },
    [hasNextEpisode, prefetchNextEpisode],
  )

  return {
    prefetchNextEpisode,
    maybePrefetchOnProgress,
  }
}
