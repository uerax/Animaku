import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AdBlockerMode, SubtitleBundle, SubtitleTrack } from '@animaku/shared'
import { pluginApi } from './plugin-api'
import { pickPlaybackSrc, type PlaybackTransit } from './playback-src'
import { perfMetrics } from './performance-metrics'
import { RESUME_MIN_POSITION } from './watch-resume'
import {
  resolveFormatHint,
  buildPlayerKey,
  resolveSubtitleBundle,
  type StreamFormatHint,
} from './watch-stream'
import type { EpisodePlay, SourceSelection } from './use-watch-session'

const MAX_PLAYBACK_FAIL_RECOVERY_ATTEMPTS = 2
const AUTH_REFRESH_DELAYS = [1000, 2500]

export interface UseWatchStreamResolveOptions {
  bangumiId: number
  title: string
  selection: SourceSelection | null
  selectionRef: React.MutableRefObject<SourceSelection | null>
  episode: EpisodePlay | null
  episodeRef: React.MutableRefObject<EpisodePlay | null>
  resumePosition: number
  setResumePosition: (pos: number) => void
  resumeOverrideRef: React.MutableRefObject<number | null>
  setHudMessage: (msg: string | null) => void
  continuePlay: boolean
}

export interface UseWatchStreamResolveResult {
  resolveLoading: boolean
  resolveError: unknown
  diagnostics: string[] | undefined
  playUrl: string | undefined
  mediaSrc: string
  formatHint: StreamFormatHint | undefined
  adBlockerMode: AdBlockerMode
  playbackMode: 'direct' | 'proxy'
  playbackTransit: PlaybackTransit
  playerKey: string
  resumeTime: number
  subtitle: SubtitleBundle | undefined
  subtitles: SubtitleTrack[] | undefined
  fonts: string[] | undefined
  playerRemount: number
  onMediaAuthExpired: (position: number) => Promise<void>
  onMediaLoadFailed: (args: { position: number }) => void
  refetchResolve: () => void
  resetRecoveryTracker: () => void
}

/**
 * 播放流解析与容灾自愈子 Hook：
 * 负责分集视频流地址的解析、Direct/Proxy 传输模式仲裁、格式推断、字幕字体清洗，
 * 以及鉴权过期重试、失败死循环熔断保护。
 */
export function useWatchStreamResolve({
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
  continuePlay,
}: UseWatchStreamResolveOptions): UseWatchStreamResolveResult {
  const [playerRemount, setPlayerRemount] = useState(0)
  const resolveRefreshOnce = useRef(false)

  const playbackRecoveryTrackerRef = useRef<{
    key: string
    attempts: number
    failed: boolean
  }>({ key: '', attempts: 0, failed: false })

  const resetRecoveryTracker = useCallback(() => {
    playbackRecoveryTrackerRef.current = { key: '', attempts: 0, failed: false }
  }, [])

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
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })

  const refetchResolve = useCallback(() => {
    resolveRefreshOnce.current = true
    void resolve.refetch()
  }, [resolve])

  async function reResolveFresh(maxAttempts = 2): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        resolveRefreshOnce.current = true
        const res = await resolve.refetch({ throwOnError: true })
        if (res.isError || !res.data?.data?.playUrl) {
          throw res.error || new Error('解析失败')
        }
        setPlayerRemount((n) => n + 1)
        return
      } catch (err) {
        if (attempt === maxAttempts - 1) {
          throw err
        }
        const delay = AUTH_REFRESH_DELAYS[attempt] ?? 1500
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  const onMediaAuthExpired = useCallback(
    async (position: number) => {
      const currentTrackKey = `${bangumiId}::${selectionRef.current?.plugin.name}::${episodeRef.current?.episode}::${episodeRef.current?.road}`
      if (playbackRecoveryTrackerRef.current.key !== currentTrackKey) {
        playbackRecoveryTrackerRef.current = {
          key: currentTrackKey,
          attempts: 0,
          failed: false,
        }
      }

      if (
        playbackRecoveryTrackerRef.current.failed ||
        playbackRecoveryTrackerRef.current.attempts >= MAX_PLAYBACK_FAIL_RECOVERY_ATTEMPTS
      ) {
        playbackRecoveryTrackerRef.current.failed = true
        setHudMessage('视频源多次播放失败，已停止重试，建议切换其它视频源或线路')
        return
      }

      playbackRecoveryTrackerRef.current.attempts++
      const attempt = playbackRecoveryTrackerRef.current.attempts
      setHudMessage(
        `播放连接异常，正在尝试第 ${attempt}/${MAX_PLAYBACK_FAIL_RECOVERY_ATTEMPTS} 次恢复重试…`,
      )

      if (position > 5) {
        resumeOverrideRef.current = position
        setResumePosition(position)
      }

      try {
        await reResolveFresh(2)
      } catch {
        playbackRecoveryTrackerRef.current.failed = true
        setHudMessage('视频源重试失败，已停止请求，建议切换其它视频源或线路')
      }
    },
    [
      bangumiId,
      selectionRef,
      episodeRef,
      setHudMessage,
      resumeOverrideRef,
      setResumePosition,
    ],
  )

  const onMediaLoadFailed = useCallback(
    ({ position }: { position: number }) => {
      if (position > 5) {
        resumeOverrideRef.current = position
        setResumePosition(position)
      }
      const currentTrackKey = `${bangumiId}::${selectionRef.current?.plugin.name}::${episodeRef.current?.episode}::${episodeRef.current?.road}`
      if (playbackRecoveryTrackerRef.current.key !== currentTrackKey) {
        playbackRecoveryTrackerRef.current = {
          key: currentTrackKey,
          attempts: 0,
          failed: false,
        }
      }
      playbackRecoveryTrackerRef.current.failed = true
      resolveRefreshOnce.current = true
      setHudMessage('视频源连接失败，已停止请求，建议点击右侧或下方切换视频源')
    },
    [
      bangumiId,
      selectionRef,
      episodeRef,
      resumeOverrideRef,
      setResumePosition,
      setHudMessage,
    ],
  )

  const proxyUrl = episode ? resolve.data?.data.proxyUrl : undefined
  const playUrl = episode ? resolve.data?.data.playUrl : undefined
  const requiresProxy = episode ? resolve.data?.data.requiresProxy : undefined

  const playback = useMemo(
    () =>
      pickPlaybackSrc({
        playUrl,
        proxyUrl,
        requiresProxy,
      }),
    [playUrl, proxyUrl, requiresProxy],
  )

  const formatHint = useMemo(
    () => (episode ? resolveFormatHint(resolve.data?.data) : undefined),
    [episode, resolve.data?.data],
  )

  useEffect(() => {
    if (selection && Number.isFinite(bangumiId) && bangumiId > 0) {
      perfMetrics.markSourceReady(bangumiId)
    }
  }, [selection, bangumiId])

  useEffect(() => {
    if (resolve.data?.data?.playUrl && Number.isFinite(bangumiId) && bangumiId > 0) {
      perfMetrics.markResolverReady(bangumiId)
    }
  }, [resolve.data?.data?.playUrl, bangumiId])

  const mediaSrc = episode ? playback.src : ''
  const effectiveResume =
    resumeOverrideRef.current != null ? resumeOverrideRef.current : resumePosition
  const resumeTime =
    continuePlay && effectiveResume > RESUME_MIN_POSITION ? effectiveResume : 0

  const subtitleBundle = useMemo(
    () => resolveSubtitleBundle(resolve.data?.data),
    [resolve.data?.data],
  )

  const playerKey = buildPlayerKey(mediaSrc, playerRemount, playback.mode)

  return {
    resolveLoading: Boolean(selection && episode && resolve.isLoading),
    resolveError: resolve.error,
    diagnostics: resolve.data?.data.diagnostics,
    playUrl,
    mediaSrc,
    formatHint,
    adBlockerMode:
      resolve.data?.data?.adBlockerMode ?? selection?.plugin.adBlockerMode ?? 'none',
    playbackMode: playback.mode,
    playbackTransit: playback.transit,
    playerKey,
    resumeTime,
    subtitle: subtitleBundle.subtitle,
    subtitles: subtitleBundle.subtitles,
    fonts: subtitleBundle.fonts,
    playerRemount,
    onMediaAuthExpired,
    onMediaLoadFailed,
    refetchResolve,
    resetRecoveryTracker,
  }
}
