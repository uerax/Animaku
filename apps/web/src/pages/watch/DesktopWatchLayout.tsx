import type { ReactNode } from 'react'

/**
 * Desktop cinema:
 * - Standard: player | rail
 *              meta   | (rail continues)
 * - Widescreen (Bilibili-style):
 *              [====== full-width player ======]
 *              meta   | rail
 *
 * Rail hosts independent 视频源 / 选集 / 推荐 panels — each caps its own body;
 * the rail itself must not become a shared scroll container.
 */
export function DesktopWatchLayout({
  player,
  meta,
  rail,
  comments,
  widescreen = false,
}: {
  player: ReactNode
  meta: ReactNode
  rail: ReactNode
  comments?: ReactNode
  widescreen?: boolean
}) {
  if (widescreen) {
    return (
      <div className="kz-watch-cinema kz-watch-cinema--desktop kz-watch-cinema--widescreen flex flex-col gap-3 px-4 sm:px-0">
        <div className="kz-player-stack kz-player-stack--widescreen w-full min-w-0">
          {player}
        </div>
        <div className="grid items-start lg:grid-cols-[minmax(0,1fr)_var(--kz-watch-rail-w)] lg:gap-[var(--kz-watch-cinema-gap)]">
          <div className="min-w-0 space-y-3">
            {meta}
            {comments}
          </div>
          <aside className="kz-watch-rail flex flex-col gap-3">{rail}</aside>
        </div>
      </div>
    )
  }

  return (
    <div className="kz-watch-cinema kz-watch-cinema--desktop grid items-start px-4 sm:px-0 lg:grid-cols-[minmax(0,1fr)_var(--kz-watch-rail-w)] lg:gap-[var(--kz-watch-cinema-gap)]">
      <div className="kz-player-stack min-w-0 space-y-3">
        {player}
        {meta}
        {comments}
      </div>
      <aside className="kz-watch-rail flex flex-col gap-3">{rail}</aside>
    </div>
  )
}
