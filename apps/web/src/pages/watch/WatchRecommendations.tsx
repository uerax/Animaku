import { memo, useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  bangumiImageUrl,
  resolveCountryTag,
  type BangumiItem,
  type BangumiRecommendationItem,
  type BangumiSeed,
} from '@animaku/shared'
import { bangumiApi } from '../../lib/bangumi'
import { useSettingsStore } from '../../stores/settings'
import { preloadRoute } from '../../lib/route-preload'
import { preloadVideoPlayer } from '../../player/lazy'
import { useWatchLayoutMode } from './useWatchLayoutMode'

const RecommendationCard = memo(function RecommendationCard({
  item,
}: {
  item: BangumiRecommendationItem
}) {
  const title = item.nameCn || item.name || '未知动画'
  const coverSrc = item.cover
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const isLoaded = Boolean(coverSrc && loadedSrc === coverSrc)

  const seed: BangumiSeed = useMemo(() => {
    const images: Record<string, string> = item.cover
      ? { large: item.cover, common: item.cover }
      : {}
    return {
      id: item.id,
      name: item.name || '',
      nameCn: item.nameCn || '',
      summary: '',
      airDate: item.year || '',
      images,
      alias: [],
      eps: 0,
      totalEpisodes: 0,
      ratingScore: item.score || 0,
      rank: 0,
      tags: [],
    }
  }, [item])

  const onWarmup = () => {
    preloadRoute('subject')
    preloadVideoPlayer()
  }

  return (
    <Link
      to={`/subject/${item.id}`}
      state={{ seed }}
      onMouseEnter={onWarmup}
      onFocus={onWarmup}
      onTouchStart={onWarmup}
      className="group flex w-full items-stretch gap-3 rounded-xl p-1.5 transition-colors hover:bg-[var(--kz-bg-hover)]"
    >
      {/* 左侧 B 站同款 16:9 宽幅封面（180*101）：聚焦主角面部与上半身特写 */}
      <div className="relative h-[90px] w-[160px] sm:h-[101px] sm:w-[180px] shrink-0 overflow-hidden rounded-lg sm:rounded-xl bg-[var(--kz-bg-soft)] shadow-sm ring-1 ring-[var(--kz-border)]/60 dark:ring-white/10 dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        {coverSrc ? (
          <>
            {!isLoaded && (
              <div
                className="kz-skeleton absolute inset-0 z-0 rounded-[inherit]"
                aria-hidden="true"
              />
            )}
            <img
              key={coverSrc}
              src={bangumiImageUrl(coverSrc)}
              alt={title}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoadedSrc(coverSrc)}
              className={`h-full w-full object-cover object-[center_18%] transition-all duration-300 group-hover:scale-105 ${
                isLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--kz-fg-dim)]">
            无封面
          </div>
        )}
      </div>

      {/* 右侧文字：高度与封面 100% 严格对齐，绝不超出图片 */}
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5 sm:py-1">
        {/* 顶部标题 */}
        <div className="line-clamp-2 text-sm font-medium leading-snug text-[var(--kz-fg)] transition-colors group-hover:text-[var(--kz-accent)]">
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

const DESKTOP_INITIAL_VISIBLE_COUNT = 8
const MOBILE_INITIAL_VISIBLE_COUNT = 4

function RecommendationsSkeleton({
  count = DESKTOP_INITIAL_VISIBLE_COUNT,
}: {
  count?: number
}) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="加载推荐中">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex w-full items-stretch gap-3 rounded-xl p-1.5"
        >
          <div className="kz-skeleton h-[90px] w-[160px] sm:h-[101px] sm:w-[180px] shrink-0 rounded-lg sm:rounded-xl ring-1 ring-[var(--kz-border)]/40" />
          <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5 sm:py-1">
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
  const [isOpen, setIsOpen] = useState(true)
  const imageHost = useSettingsStore((s) => s.bangumiImageHost)

  const country = useMemo(() => {
    return resolveCountryTag(bangumiItem?.tags)
  }, [bangumiItem])

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

  const { data, isLoading, isSuccess } = useQuery({
    queryKey: ['bangumi-recommendations', bangumiId, country],
    queryFn: ({ signal }) =>
      bangumiApi.recommendations(bangumiId, {
        tags,
        country,
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

  const isWaitingSubject = !bangumiItem
  const isActuallyLoading = isWaitingSubject || isLoading

  const layoutMode = useWatchLayoutMode()
  const initialVisibleCount =
    layoutMode === 'desktop'
      ? DESKTOP_INITIAL_VISIBLE_COUNT
      : MOBILE_INITIAL_VISIBLE_COUNT

  const [visibleCount, setVisibleCount] = useState(initialVisibleCount)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // 切换番剧或屏幕布局模式时重置可见数量为首屏默认数 (桌面端 8 部 / 移动端 4 部)
  useEffect(() => {
    setVisibleCount(initialVisibleCount)
  }, [bangumiId, initialVisibleCount])

  // 用户向下滚动接近列表末尾时，无感增量挂载剩余卡片 (监听 isOpen 确保展开时重新绑定哨兵)
  useEffect(() => {
    if (!isOpen) return
    if (visibleCount >= items.length) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 7, items.length))
        }
      },
      { rootMargin: '150px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isOpen, items.length, visibleCount])

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  )

  // 仅在明确请求成功且确认无推荐数据时才优雅隐藏，严禁在未就绪或加载中触发空白塌陷
  if (!isActuallyLoading && isSuccess && items.length === 0) {
    return null
  }

  return (
    <section
      className="kz-watch-panel shrink-0 overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-sm transition-all duration-300"
      aria-label="番剧推荐"
    >
      {/* 头部：支持点击整行折叠/展开 */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="kz-bili-sec-head kz-bili-sec-head--btn flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--kz-bg-hover)]"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-3 w-0.5 shrink-0 rounded-full bg-[var(--kz-accent)]/70"
            aria-hidden
          />
          <span className="font-semibold text-xs sm:text-[13px] text-[var(--kz-fg)] tracking-tight flex items-center gap-1.5">
            番剧推荐
            {items.length > 0 && (
              <span className="text-[11px] font-normal text-[var(--kz-fg-muted)]">
                ({items.length})
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[var(--kz-fg-muted)] shrink-0">
          <span className="text-xs font-normal">
            {isOpen ? '收起' : '展开'}
          </span>
          <svg
            className={clsx(
              'kz-bili-chevron h-3.5 w-3.5 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 6.2L8 10.2L12 6.2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {/* 折叠内容区 */}
      {isOpen && (
        <div className="border-t border-[var(--kz-border-subtle)] p-2 sm:p-2.5">
          {isActuallyLoading && items.length === 0 ? (
            <RecommendationsSkeleton count={initialVisibleCount} />
          ) : (
            <div className="space-y-1">
              {visibleItems.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                />
              ))}
              {visibleCount < items.length && (
                <div
                  ref={sentinelRef}
                  className="h-4 w-full"
                  aria-hidden="true"
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
