export type MediaType = 'hls' | 'progressive'

export function inferMediaType(
  url: string,
  formatHint?: 'hls' | 'mp4' | string,
): MediaType {
  if (formatHint === 'hls') return 'hls'
  if (formatHint === 'mp4') return 'progressive'
  if (!url || typeof url !== 'string') return 'progressive'

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const parsed = new URL(url, base)
    const pathname = parsed.pathname.toLowerCase()

    if (pathname === '/api/media/stream') return 'hls'
    if (pathname === '/api/media/segment') return 'progressive'

    if (pathname.endsWith('.m3u8') || pathname.endsWith('.m3u')) return 'hls'
    if (
      pathname.endsWith('.mp4') ||
      pathname.endsWith('.m4v') ||
      pathname.endsWith('.ts') ||
      pathname.endsWith('.webm')
    ) {
      return 'progressive'
    }
  } catch {
    /* ignore parse error */
  }

  return 'progressive'
}

export const isM3u8 = (url: string, formatHint?: string) =>
  inferMediaType(url, formatHint) === 'hls'

/**
 * Infer explicit MIME type for HTML5 <source> elements.
 * Critical for Safari (WebKit / AVFoundation): when video URLs carry disguised
 * extensions like .mp3 (e.g. CYCani CDN), omitting type="video/mp4" causes
 * AVURLAsset to classify the asset as audio-only, rendering a black screen.
 */
export function inferMediaMimeType(url: string, formatHint?: string): string {
  if (inferMediaType(url, formatHint) === 'hls') {
    return 'application/vnd.apple.mpegurl'
  }
  if (!url || typeof url !== 'string') return 'video/mp4'
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const parsed = new URL(url, base)
    const pathname = parsed.pathname.toLowerCase()
    if (pathname.endsWith('.webm')) return 'video/webm'
    if (pathname.endsWith('.ogg') || pathname.endsWith('.ogv')) return 'video/ogg'
  } catch {
    /* ignore parse error */
  }
  // Default to standard MP4 for all online progressive video streams
  return 'video/mp4'
}

export function isXmlDanmakuFile(file: File) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xml') ||
    file.type === 'text/xml' ||
    file.type === 'application/xml' ||
    file.type === 'text/plain'
  )
}

export function isVideoFile(file: File) {
  if (file.type.startsWith('video/')) return true
  const name = file.name.toLowerCase()
  return /\.(mp4|mkv|webm|mov|avi|flv|m4v|3gp|ts)$/i.test(name)
}

export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Seconds of media buffered ahead of currentTime (0 if none). */
export function bufferedAhead(video: HTMLVideoElement): number {
  const t = video.currentTime || 0
  try {
    const ranges = video.buffered
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i)
      const end = ranges.end(i)
      if (t + 0.05 >= start && t <= end + 0.05) {
        return Math.max(0, end - t)
      }
    }
  } catch {
    /* ignore */
  }
  return 0
}
