import type { ResolvePlayResult, SubtitleBundle, SubtitleTrack } from '@animaku/shared'

export type StreamFormatHint = 'hls' | 'mp4'

/**
 * 根据源站返回的 format 声明或 HTTP Content-Type 推断媒体流格式 (HLS vs MP4)
 */
export function resolveFormatHint(
  resData: (ResolvePlayResult & { format?: string; contentType?: string }) | null | undefined,
): StreamFormatHint | undefined {
  if (!resData) return undefined
  const fmt = resData.format?.toLowerCase()
  if (fmt === 'hls' || fmt === 'm3u8') return 'hls'
  if (fmt === 'mp4' || fmt === 'progressive') return 'mp4'
  const ct = resData.contentType?.toLowerCase()
  if (ct) {
    if (
      ct.includes('application/vnd.apple.mpegurl') ||
      ct.includes('application/x-mpegurl') ||
      ct.includes('audio/mpegurl')
    ) {
      return 'hls'
    }
    if (ct.includes('video/mp4') || ct.includes('video/webm')) {
      return 'mp4'
    }
  }
  return undefined
}

/**
 * 生成唯一标识物理媒体流通道与中转模式的 Player Key；
 * 配合就地 seek 处理晚到续播，杜绝播放器 DOM 发生非预期的破坏性重挂载。
 */
export function buildPlayerKey(
  mediaSrc: string,
  playerRemount: number,
  playbackMode: 'direct' | 'proxy',
): string {
  return `${mediaSrc}#${playerRemount}#${playbackMode}`
}

/**
 * 提取标准化字幕包与字体集合
 */
export function resolveSubtitleBundle(
  resData: ResolvePlayResult | null | undefined,
): {
  subtitle: SubtitleBundle | undefined
  subtitles: SubtitleTrack[] | undefined
  fonts: string[] | undefined
} {
  if (!resData) {
    return { subtitle: undefined, subtitles: undefined, fonts: undefined }
  }
  const subtitle =
    resData.subtitle ??
    (resData.subtitles || resData.fonts
      ? {
          subtitles: resData.subtitles,
          fonts: resData.fonts,
        }
      : undefined)

  const subtitles = resData.subtitle?.subtitles ?? resData.subtitles
  const fonts = resData.subtitle?.fonts ?? resData.fonts

  return { subtitle, subtitles, fonts }
}
