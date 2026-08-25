/** Shared control-bar SVG icons (desktop + mobile). */

export function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

export function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}

export function IconPause() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h3v14H7V5zm7 0h3v14h-3V5z" />
    </svg>
  )
}

export function IconPrev() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
    </svg>
  )
}

export function IconNext() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 6h2v12h-2V6zM6 6v12l8.5-6L6 6z" />
    </svg>
  )
}

export function IconDanmakuOn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4.5" strokeWidth="1.8" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        fontFamily='system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
      >
        弹
      </text>
    </svg>
  )
}

export function IconDanmakuSimplify() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4.5" strokeWidth="1.8" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        fontFamily='system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
      >
        简
      </text>
    </svg>
  )
}

export function IconDanmakuOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4.5" strokeWidth="1.8" opacity="0.6" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        opacity="0.6"
        fontFamily='system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
      >
        弹
      </text>
      <line x1="2.5" y1="2.5" x2="21.5" y2="21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function IconDanmakuSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d="M13.5 22H6.5A4.5 4.5 0 0 1 2 17.5v-11A4.5 4.5 0 0 1 6.5 2h11A4.5 4.5 0 0 1 22 6.5V13.5"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <text
        x="11.5"
        y="11.8"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12.5"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        fontFamily='system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
      >
        弹
      </text>
      <path
        d="M20.3 17.5l.6-.3c.2-.1.3-.4.2-.6l-.5-.9c-.1-.2-.4-.3-.6-.2l-.6.3c-.3-.2-.6-.3-.9-.4l-.1-.7c0-.3-.2-.5-.5-.5h-1c-.3 0-.5.2-.5.5l-.1.7c-.3.1-.6.2-.9.4l-.6-.3c-.2-.1-.5 0-.6.2l-.5.9c-.1.2 0 .5.2.6l.6.3c0 .3 0 .6 0 .9l-.6.3c-.2.1-.3.4-.2.6l.5.9c.1.2.4.3.6.2l.6-.3c.3.2.6.3.9.4l.1.7c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5l.1-.7c.3-.1.6-.2.9-.4l.6.3c.2.1.5 0 .6-.2l.5-.9c.1-.2 0-.5-.2-.6l-.6-.3c0-.3 0-.6 0-.9zm-2 1.5c-.6 0-1.1-.5-1.1-1.1s.5-1.1 1.1-1.1 1.1.5 1.1 1.1-.5 1.1-1.1 1.1z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

export const IconDanmaku = IconDanmakuSettings

export function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-3.5 h-3.5">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-3.5 h-3.5">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function IconCheck({ className = 'w-3.5 h-3.5' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.15 7.15 0 0 0-1.63-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.25 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.37 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.39.3.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
    </svg>
  )
}

export function IconFullscreenExit() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  )
}

export function IconFullscreen() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  )
}

export function IconWebFsExit() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V10h14v8zm0-10H5V6h14v2z" />
    </svg>
  )
}

export function IconWebFs() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 3.5h16V6H4v1.5zm0 2V18h16V9.5H4zm2 2h4v1.5H6V11.5zm0 3h7v1.5H6V14.5z" />
    </svg>
  )
}

/** Wide screen / Theater mode toggle (Bilibili-style top full-width cinema) */
export function IconWidescreen() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8zM8.5 13.5l-2-1.5 2-1.5v3zm7 0v-3l2 1.5-2 1.5z" />
    </svg>
  )
}

/** Exit wide screen / Back to standard two-column cinema */
export function IconWidescreenExit() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8zM6.5 10.5l2 1.5-2 1.5v-3zm11 0v3l-2-1.5 2-1.5z" />
    </svg>
  )
}

/** Speaker with waves — volume > 0 */
export function IconVolume() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}

/** Muted speaker */
export function IconVolumeMute() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v4h4l5 4v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
    </svg>
  )
}

/** Stats / Activity for Nerds */
export function IconStats({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}

/** Horizontal mirror flip */
export function IconMirror({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 3v18" strokeDasharray="3 3" />
      <path d="M3 7l5 5-5 5V7z" />
      <path d="M21 7l-5 5 5 5V7z" />
    </svg>
  )
}

/** Loop / Repeat */
export function IconLoop({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

/** Picture-in-Picture */
export function IconPip({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <rect x="12" y="11" width="8" height="7" rx="1" fill="currentColor" />
    </svg>
  )
}

/** Camera / Screenshot */
export function IconCamera({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

/** Copy / Duplicate */
export function IconCopy({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

/** Link */
export function IconLink({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/** Aspect ratio / Crop */
export function IconAspectRatio({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h2v2H7zM15 7h2v2h-2z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Speed / Gauge */
export function IconSpeed({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 14l3-3" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  )
}

/** Sparkles / Magic / Super Resolution */
export function IconSparkles({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 3l1.912 5.885L20 10l-5.088 3.115L13 21l-1.912-7.885L6 10l6.088-1.115z" />
      <path d="M19 16l.9 1.9 2.1.4-1.6 1.4.5 2.1-1.9-1.1-1.9 1.1.5-2.1-1.6-1.4 2.1-.4z" />
    </svg>
  )
}

/** OP/ED Marker Assistant Icon (Flag / Timeline pin) */
export function IconOpedMarker({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

/** Close / Cross */
export function IconClose({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}