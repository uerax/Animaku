import { Link } from 'react-router-dom'
import {
  bangumiImageUrl,
  formatPlaybackTime,
  getPlaybackPercentage,
  isPlaybackFinished,
  formatRelativeWatchTime,
  type WatchHistoryEntry,
  type BangumiSeed,
} from '@animaku/shared'
import { preloadVideoPlayer } from '../../player/lazy'
import { preloadRoute } from '../../lib/route-preload'
import { useSettingsStore } from '../../stores/settings'

interface HistoryCardProps {
  entry: WatchHistoryEntry
  isBatchMode: boolean
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => void
}

export function HistoryCard({
  entry,
  isBatchMode,
  isSelected,
  onToggleSelect,
  onDelete,
}: HistoryCardProps) {
  const bangumiImageHost = useSettingsStore((s) => s.bangumiImageHost)
  const pct = getPlaybackPercentage(entry.position, entry.duration)
  const finished = isPlaybackFinished(entry.position, entry.duration)
  const relTime = formatRelativeWatchTime(entry.updatedAt)

  const resumeQ = new URLSearchParams()
  if (entry.pluginName) resumeQ.set('plugin', entry.pluginName)
  if (typeof entry.episode === 'number' && !Number.isNaN(entry.episode)) {
    resumeQ.set('ep', String(entry.episode))
  }
  if (entry.road > 0) resumeQ.set('road', String(entry.road))

  const playUrl = `/play/${entry.bangumiId}?${resumeQ.toString()}`
  const subjectUrl = `/subject/${entry.bangumiId}`

  const images: Record<string, string> = entry.cover
    ? { large: entry.cover, common: entry.cover }
    : {}

  const seed: BangumiSeed = {
    id: entry.bangumiId,
    name: entry.title,
    nameCn: entry.title,
    summary: '',
    airDate: '',
    images,
    alias: [],
    eps: 0,
    totalEpisodes: 0,
    ratingScore: 0,
    rank: 0,
    tags: [],
  }

  const onWarmup = () => {
    preloadRoute('subject')
    preloadVideoPlayer()
  }

  return (
    <div
      onClick={isBatchMode ? () => onToggleSelect(entry.id) : undefined}
      role={isBatchMode ? 'checkbox' : undefined}
      aria-checked={isBatchMode ? isSelected : undefined}
      tabIndex={isBatchMode ? 0 : undefined}
      onKeyDown={
        isBatchMode
          ? (e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                onToggleSelect(entry.id)
              }
            }
          : undefined
      }
      className={`group relative flex items-center gap-3 sm:gap-4 rounded-xl border p-3 transition-all ${
        isBatchMode
          ? 'cursor-pointer select-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--kz-accent)]'
          : ''
      } ${
        isSelected
          ? 'border-[var(--kz-accent)] bg-[var(--kz-accent-soft)]/40 shadow-xs'
          : 'border-[var(--kz-border)] bg-[var(--kz-bg-card)] hover:border-[var(--kz-accent)]/50 hover:shadow-xs'
      }`}
    >
      {/* 批量多选框 */}
      {isBatchMode && (
        <div className="flex shrink-0 items-center pl-0.5">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
              isSelected
                ? 'border-[var(--kz-accent)] bg-[var(--kz-accent)] text-white'
                : 'border-[var(--kz-border)] bg-[var(--kz-bg-soft)]'
            }`}
          >
            {isSelected && (
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* 封面微缩图（带播放与完播徽章） */}
      <Link
        to={playUrl}
        state={{ seed }}
        onClick={(e) => {
          if (isBatchMode) {
            e.preventDefault()
          }
        }}
        onMouseEnter={onWarmup}
        onFocus={onWarmup}
        onTouchStart={onWarmup}
        className="relative block shrink-0 overflow-hidden rounded-lg bg-[var(--kz-bg-soft)] shadow-xs ring-1 ring-[var(--kz-border)]"
      >
        {entry.cover ? (
          <img
            src={bangumiImageUrl(entry.cover, bangumiImageHost)}
            alt={entry.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            width={64}
            height={88}
            className="h-20 w-14 sm:h-24 sm:w-17 object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-20 w-14 sm:h-24 sm:w-17" />
        )}

        {/* 封面左下角/底部完播或进度徽章 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 pt-3 text-center">
          {finished ? (
            <span className="inline-block rounded-xs bg-emerald-500/90 px-1 py-0.2 text-[10px] font-bold text-white leading-tight">
              已看完
            </span>
          ) : (
            <span className="text-[10px] font-medium text-white/90 drop-shadow-xs">
              {pct > 0 ? `${pct}%` : '未播'}
            </span>
          )}
        </div>
      </Link>

      {/* 中间信息主体 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            to={subjectUrl}
            state={{ seed }}
            onClick={(e) => {
              if (isBatchMode) {
                e.preventDefault()
              }
            }}
            onMouseEnter={onWarmup}
            className="truncate text-sm sm:text-base font-bold text-[var(--kz-fg)] transition-colors hover:text-[var(--kz-accent)]"
          >
            {entry.title}
          </Link>
          {relTime && (
            <span className="shrink-0 text-xs text-[var(--kz-fg-dim)] hidden sm:inline-block">
              {relTime}
            </span>
          )}
        </div>

        {/* 标签行：集数 · 视频源 · 移动端时间 */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--kz-fg-muted)]">
          <span className="rounded-md bg-[var(--kz-bg-soft)] px-1.5 py-0.5 font-medium text-[var(--kz-fg)]">
            第 {entry.episode} 集
          </span>
          <span className="text-[var(--kz-fg-dim)]">·</span>
          <span className="truncate max-w-[120px]">{entry.pluginName}</span>
          {relTime && (
            <>
              <span className="text-[var(--kz-fg-dim)] sm:hidden">·</span>
              <span className="text-[var(--kz-fg-dim)] sm:hidden">
                {relTime}
              </span>
            </>
          )}
        </div>

        {/* 进度条与具体时间 */}
        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--kz-bg-soft)]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                finished ? 'bg-emerald-500' : 'bg-[var(--kz-accent)]'
              }`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-mono text-[var(--kz-fg-muted)]">
            {formatPlaybackTime(entry.position)}
            {entry.duration > 0 && ` / ${formatPlaybackTime(entry.duration)}`}
          </span>
        </div>
      </div>

      {/* 右侧快捷操作 */}
      {!isBatchMode && (
        <div className="flex shrink-0 items-center gap-1.5 self-center sm:self-auto pl-1">
          <Link
            to={playUrl}
            onMouseEnter={onWarmup}
            onFocus={onWarmup}
            className={`inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors ${
              finished
                ? 'border border-[var(--kz-border)] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)]'
                : 'bg-[var(--kz-accent)] text-white shadow-xs hover:opacity-90'
            }`}
          >
            {finished ? (
              <>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.75a.75.75 0 0 0-.75.75v4.482a.75.75 0 0 0 1.5 0v-2.023l.317.318a7 7 0 0 0 11.96-3.238.75.75 0 0 0-1.465-.444ZM4.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311H11.768a.75.75 0 0 0 0 1.5h4.482a.75.75 0 0 0 .75-.75V2.689a.75.75 0 0 0-1.5 0v2.023l-.317-.318a7 7 0 0 0-11.96 3.238.75.75 0 1 0 1.465.444Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>重播</span>
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
                </svg>
                <span>续播</span>
              </>
            )}
          </Link>

          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            title="删除此记录"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--kz-fg-dim)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-danger)]"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-1.5 0v-7a.75.75 0 0 1 .75-.75Zm3.59 0a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-1.5 0v-7a.75.75 0 0 1 .75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
