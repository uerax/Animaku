import { lazy, Suspense, type ComponentProps } from 'react'

/**
 * Lazy player chrome — keeps danmaku / hls / VideoPlayer out of light routes
 * until Play / Subject actually mount them.
 *
 * preload* only triggers dynamic import() (download + parse module graph).
 * It does NOT construct Hls, canvas danmaku, or mount <video>.
 */
const videoPlayerImport = () =>
  import('./VideoPlayer').then((m) => ({ default: m.VideoPlayer }))

export const LazyVideoPlayer = lazy(videoPlayerImport)

let videoPlayerPreload: Promise<unknown> | null = null

/** Idempotent — safe on every card hover / watch mount. */
export function preloadVideoPlayer(): void {
  if (videoPlayerPreload) return
  videoPlayerPreload = videoPlayerImport().catch(() => {
    // Allow retry after a failed network attempt
    videoPlayerPreload = null
  })
}

function PlayerFallback({ text }: { text: string }) {
  return (
    <div className="kz-player-placeholder text-sm text-[var(--kz-fg)]">
      {text}
    </div>
  )
}

export function VideoPlayerSuspense(
  props: ComponentProps<typeof LazyVideoPlayer>,
) {
  return (
    <Suspense fallback={<PlayerFallback text="加载播放器…" />}>
      <LazyVideoPlayer {...props} />
    </Suspense>
  )
}
