import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  bangumiImageUrl,
  type BangumiItem,
  type BangumiRecommendationItem,
} from '@animaku/shared'
import { bangumiApi } from '../../lib/bangumi'
import { useSettingsStore } from '../../stores/settings'
import { preloadRoute } from '../../lib/route-preload'
import { preloadVideoPlayer } from '../../player/lazy'

const RecommendationCard = memo(function RecommendationCard({
  item,
}: {
  item: BangumiRecommendationItem
}) {
  const title = item.nameCn || item.name || '未知动画'
  const coverSrc = item.cover

  const onWarmup = () => {
    preloadRoute('subject')
    preloadVideoPlayer()
  }

  return (
    <Link
      to={`/subject/${item.id}`}
      onMouseEnter={onWarmup}
      onFocus={onWarmup}
      onTouchStart={onWarmup}
      className="group flex w-full items-stretch gap-3 rounded-xl p-1.5 transition-colors hover:bg-[var(--kz-bg-hover)]"
    >
      {/* 左侧宽幅 4:3 封面：占宽 ~38%，聚焦主角面部与上半身 */}
      <div className="relative aspect-[4/3] w-[38%] max-w-[145px] shrink-0 overflow-hidden rounded-lg bg-[var(--kz-bg-soft)] shadow-sm ring-1 ring-[var(--kz-border)]/60">
        {coverSrc ? (
          <img
            src={bangumiImageUrl(coverSrc)}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-[center_18%] transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--kz-fg-dim)]">
            无封面
          </div>
        )}
      </div>

      {/* 右侧文字：高度与封面 100% 严格对齐，绝不超出图片 */}
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        {/* 顶部标题 */}
        <div className="line-clamp-2 text-sm font-medium leading-tight text-[var(--kz-fg)] transition-colors group-hover:text-[var(--kz-accent)]">
          {title}
        </div>

        {/* 底部两行 */}
        <div className="space-y-1 text-xs text-[var(--kz-fg-muted)]">
          {(item.year || item.epsLabel) && (
            <div className="truncate text-xs leading-none text-[var(--kz-fg-muted)]">
              {item.year && item.epsLabel
                ? `${item.year} · ${item.epsLabel}`
                : item.year || item.epsLabel}
            </div>
          )}
          <div className="flex items-center gap-1.5 leading-none">
            {item.score > 0 ? (
              <span className="font-semibold tabular-nums text-[var(--kz-score)]">
                ★ {item.score.toFixed(1)}
              </span>
            ) : item.relationBadge ? null : (
              <span className="text-[11px] text-[var(--kz-fg-dim)]">暂无评分</span>
            )}
            {item.relationBadge && (
              <span
                className={clsx(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
                  item.relationBadge === '续作'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : item.relationBadge === '前作'
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                      : item.relationBadge === '剧场版'
                        ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                        : 'bg-[var(--kz-accent)]/15 text-[var(--kz-accent)]',
                )}
              >
                {item.relationBadge}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
})

function RecommendationsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="加载推荐中">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex w-full items-stretch gap-3 rounded-xl p-1.5"
        >
          <div className="kz-skeleton aspect-[4/3] w-[38%] max-w-[145px] shrink-0 rounded-lg ring-1 ring-[var(--kz-border)]/40" />
          <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
            <div className="space-y-1.5">
              <div className="kz-skeleton h-3.5 w-3/4 rounded" />
              <div className="kz-skeleton h-3 w-1/2 rounded" />
            </div>
            <div className="space-y-1">
              <div className="kz-skeleton h-2.5 w-1/3 rounded" />
              <div className="kz-skeleton h-2.5 w-1/4 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function WatchRecommendations({
  bangumiId,
  bangumiItem,
}: {
  bangumiId: number
  bangumiItem: BangumiItem | null | undefined
}) {
  const imageHost = useSettingsStore((s) => s.bangumiImageHost)

  const tags = useMemo(() => {
    const raw = bangumiItem?.tags || []
    // 过滤打标数量少于 20 的低频长尾词（冷门番若过滤后不足 2 个则安全回退 Top 5）
    const filtered = raw.filter((t) => (t.count ?? 0) >= 20)
    const candidates = filtered.length >= 2 ? filtered : raw.slice(0, 5)
    return candidates.map((t) => t.name)
  }, [bangumiItem])

  const isMovie = useMemo(() => {
    if (!bangumiItem) return false
    const title = bangumiItem.nameCn || bangumiItem.name || ''
    const hasMovieTag = bangumiItem.tags?.some(
      (t) => t.name.includes('剧场版') || t.name.includes('动画电影'),
    )
    return (
      Boolean(hasMovieTag) ||
      title.includes('剧场版') ||
      (bangumiItem.totalEpisodes === 1 && bangumiItem.eps === 1)
    )
  }, [bangumiItem])

  const { data, isLoading } = useQuery({
    queryKey: ['bangumi-recommendations', bangumiId],
    queryFn: ({ signal }) =>
      bangumiApi.recommendations(bangumiId, {
        tags,
        isMovie,
        imageHost,
        signal,
      }),
    enabled:
      Number.isFinite(bangumiId) && bangumiId > 0 && Boolean(bangumiItem),
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  const items = data?.data?.items || []

  // If loading and no cache yet, render skeleton
  if (isLoading && items.length === 0) {
    return (
      <div className="kz-watch-panel space-y-2.5 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-0.5 shrink-0 rounded-full bg-[var(--kz-accent)]/70"
            aria-hidden
          />
          <h3 className="kz-watch-panel-title">番剧推荐</h3>
        </div>
        <RecommendationsSkeleton />
      </div>
    )
  }

  // If request finished but no items found, hide cleanly
  if (!isLoading && items.length === 0) {
    return null
  }

  return (
    <div className="kz-watch-panel space-y-2 p-3 sm:p-4">
      <div className="flex items-center justify-between pb-0.5">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-0.5 shrink-0 rounded-full bg-[var(--kz-accent)]/70"
            aria-hidden
          />
          <h3 className="kz-watch-panel-title">番剧推荐</h3>
        </div>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <RecommendationCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
