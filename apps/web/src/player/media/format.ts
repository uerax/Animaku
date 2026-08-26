export function isM3u8(url: string) {
  try {
    const d = decodeURIComponent(url).toLowerCase()
    return d.includes('.m3u8') || d.includes('mpegurl')
  } catch {
    const u = url.toLowerCase()
    return u.includes('.m3u8') || u.includes('mpegurl')
  }
}

/**
 * Infer explicit MIME type for HTML5 <source> elements.
 * Critical for Safari (WebKit / AVFoundation): when video URLs carry disguised
 * extensions like .mp3 (e.g. CYCani CDN), omitting type="video/mp4" causes
 * AVURLAsset to classify the asset as audio-only, rendering a black screen.
 */
export function inferMediaMimeType(url: string): string {
  if (!url) return 'video/mp4'
  try {
    const d = decodeURIComponent(url).toLowerCase()
    if (d.includes('.webm')) return 'video/webm'
    if (d.includes('.ogg') || d.includes('.ogv')) return 'video/ogg'
    if (d.includes('.m3u8') || d.includes('mpegurl')) return 'application/vnd.apple.mpegurl'
    if (d.includes('.mp4') || d.includes('.m4v') || d.includes('.mov') || d.includes('.ts')) return 'video/mp4'
  } catch {
    const u = url.toLowerCase()
    if (u.includes('.webm')) return 'video/webm'
    if (u.includes('.ogg') || u.includes('.ogv')) return 'video/ogg'
    if (u.includes('.m3u8') || u.includes('mpegurl')) return 'application/vnd.apple.mpegurl'
    if (u.includes('.mp4') || u.includes('.m4v') || u.includes('.mov') || u.includes('.ts')) return 'video/mp4'
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
