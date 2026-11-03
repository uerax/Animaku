import { useMemo } from 'react'
import type { PlayerSettings } from '@animaku/shared'
import {
  useBangumiOpedData,
  useResolvedOpedSkip,
  useBangumiEpisodesDuration,
  type BgmOpedEntry,
} from './bangumi-oped'
import { useCustomOpedStore } from './custom-oped-store'
import { useSourceBindingStore } from '../stores/source-bindings'

export interface UseWatchOpedSettingsOptions {
  bangumiId: number
  activePluginName?: string
  episodeNumber?: number
  playerSettings: PlayerSettings
}

export interface UseWatchOpedSettingsResult {
  /** 融入 OP/ED 跳过区间后的生效播放器设置 */
  resolvedPlayerSettings: PlayerSettings
  /** Bangumi OP/ED 时间戳映射表 */
  bgmOpedData: Map<number, BgmOpedEntry> | null | undefined
  /** 官方 Bangumi 对应集数的标准时长（秒） */
  expectedDurationSeconds: number | undefined
}

/**
 * 播放页 OP/ED 与播放器跳过设置调度 Hook：
 * 负责拉取 Bangumi OP/ED 时间戳、官方集数标准时长、本地用户自定义打标，
 * 并结合视频源集数偏移量（danmakuOffset）安全计算生效的 OP/ED 跳过区间。
 */
export function useWatchOpedSettings({
  bangumiId,
  activePluginName = '',
  episodeNumber = 0,
  playerSettings,
}: UseWatchOpedSettingsOptions): UseWatchOpedSettingsResult {
  const preferBangumiOped = Boolean(playerSettings.preferBangumiOped)
  const bgmOpedQuery = useBangumiOpedData(bangumiId, preferBangumiOped)
  const episodeDurationMap = useBangumiEpisodesDuration(bangumiId, preferBangumiOped)

  const storedOffset = useSourceBindingStore(
    (s) =>
      bangumiId && activePluginName
        ? s.getBinding(bangumiId, activePluginName)?.danmakuOffset ?? 0
        : 0,
  )

  const effectiveOpedEp = Math.max(0, episodeNumber + storedOffset)

  const localMark = useCustomOpedStore((s) =>
    bangumiId > 0 && effectiveOpedEp > 0
      ? s.subjects[bangumiId]?.episodes[effectiveOpedEp]
      : undefined,
  )

  const episodeDurationSeconds = useMemo(() => {
    if (!episodeDurationMap || effectiveOpedEp <= 0) return undefined
    return episodeDurationMap.get(effectiveOpedEp)
  }, [episodeDurationMap, effectiveOpedEp])

  const opedSkip = useResolvedOpedSkip(
    preferBangumiOped ? bgmOpedQuery.data : null,
    effectiveOpedEp,
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
    resolvedPlayerSettings,
    bgmOpedData: bgmOpedQuery.data,
    expectedDurationSeconds: episodeDurationSeconds,
  }
}
