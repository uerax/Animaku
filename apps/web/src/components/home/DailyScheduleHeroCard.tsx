import { memo, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { BangumiItem } from '@animaku/shared'
import {
  coverOf,
  extractBangumiSeed,
  bangumiImageUrl,
  DEFAULT_BANGUMI_IMAGE_HOST,
} from '@animaku/shared'
import { bangumiApi } from '../../lib/bangumi'
import { useSettingsStore } from '../../stores/settings'
import { preloadVideoPlayer } from '../../player/lazy'
import { preloadRoute } from '../../lib/route-preload'
import { EMPTY_ARRAY } from '../../lib/stable'

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const
const CARDS_PER_PAGE = 6

function CalendarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  )
}

function ChevronLeftIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

interface CompactGridCardProps {
  item: BangumiItem
  host: string
  openInNewTab: boolean
}

const CompactGridCard = memo(function CompactGridCard({
  item,
  host,
  openInNewTab,
}: CompactGridCardProps) {
  const coverUrl = bangumiImageUrl(coverOf(item, 'large'), host)
  const title = item.nameCn || item.name
  const score = item.ratingScore > 0 ? item.ratingScore.toFixed(1) : null
  const seed = useMemo(() => extractBangumiSeed(item), [item])

  return (
    <Link
      to={`/subject/${item.id}`}
      state={seed ? { seed } : undefined}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      onMouseEnter={() => {
        preloadRoute('subject')
        preloadVideoPlayer()
      }}
      onFocus={() => {
        preloadRoute('subject')
        preloadVideoPlayer()
      }}
      className="group relative block h-full w-full overflow-hidden rounded-xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-soft)] transition-all duration-300 hover:border-[var(--kz-accent)]/60 hover:shadow-md"
    >
      {/* 封面图片 */}
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-106"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--kz-bg-soft)] text-[10px] text-[var(--kz-fg-dim)]">
          无封面
        </div>
      )}

      {/* 顶部评分徽标 (与轮播图一致采用金色五角星) */}
      {score && (
        <div className="absolute right-1.5 top-1.5 z-10">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white border border-white/10 backdrop-blur-xs shadow-xs">
            <span className="text-amber-400 text-[10px]">★</span>
            <span>{score}</span>
          </span>
        </div>
      )}

      {/* 底部暗色遮罩 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      {/* 底部中文标题 */}
      <div className="absolute inset-x-0 bottom-0 p-1.5 z-10">
        <p className="truncate text-[11px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {title}
        </p>
      </div>
    </Link>
  )
})

export const DailyScheduleHeroCard = memo(function DailyScheduleHeroCard() {
  const host =
    useSettingsStore((s) => s.bangumiImageHost) || DEFAULT_BANGUMI_IMAGE_HOST
  const openInNewTab = useSettingsStore((s) => s.nav.openInNewTab)

  // 物理现实的今日周几（0=周一 .. 6=周日）
  const todayWeekdayIndex = useMemo(() => {
    const rawDay = new Date().getDay() // 0=Sun, 1=Mon .. 6=Sat
    return rawDay === 0 ? 6 : rawDay - 1
  }, [])

  const [pageIndex, setPageIndex] = useState(0)

  // 与 /timeline 共享相同的 React Query 缓存，零冗余网络请求
  const calendarQuery = useQuery({
    queryKey: ['calendar'],
    queryFn: ({ signal }) => bangumiApi.calendar({ signal }),
    staleTime: 12 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
  })

  // 纯粹聚焦今日新番
  const currentDayItems = useMemo(() => {
    const days = calendarQuery.data?.data
    if (!days || !Array.isArray(days[todayWeekdayIndex])) return EMPTY_ARRAY
    return days[todayWeekdayIndex]
  }, [calendarQuery.data, todayWeekdayIndex])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(currentDayItems.length / CARDS_PER_PAGE))
  }, [currentDayItems.length])

  const handleNextPage = useCallback(() => {
    setPageIndex((prev) => (prev + 1) % totalPages)
  }, [totalPages])

  const handlePrevPage = useCallback(() => {
    setPageIndex((prev) => (prev - 1 + totalPages) % totalPages)
  }, [totalPages])

  const pagedItems = useMemo(() => {
    const start = pageIndex * CARDS_PER_PAGE
    return currentDayItems.slice(start, start + CARDS_PER_PAGE)
  }, [currentDayItems, pageIndex])

  return (
    <div className="flex h-full w-full flex-col">
      {/* 1. 顶部独立控制栏：独立边框与微底色，精致成条 */}
      <div className="flex items-center justify-between gap-2 shrink-0 h-9 mb-2 px-3 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarIcon className="h-4.5 w-4.5 text-[var(--kz-accent)] shrink-0" />
          <h2 className="text-[15px] font-black tracking-wide text-[var(--kz-fg)] shrink-0">
            今日放送
          </h2>
          <span className="truncate text-xs font-medium text-[var(--kz-fg-muted)]">
            {WEEK_LABELS[todayWeekdayIndex]} · {calendarQuery.isLoading ? '...' : `${currentDayItems.length} 部更新`}
          </span>
        </div>

        {/* 右侧控制：页码翻页器 + 直达完整时间表 */}
        <div className="flex items-center gap-2.5 shrink-0">
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[11.5px] font-semibold tabular-nums text-[var(--kz-fg-muted)] mr-0.5">
                {pageIndex + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={handlePrevPage}
                title="上一页"
                aria-label="上一页"
                className="flex h-6.5 w-6.5 items-center justify-center rounded-lg text-[var(--kz-fg-muted)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                title="下一页"
                aria-label="下一页"
                className="flex h-6.5 w-6.5 items-center justify-center rounded-lg text-[var(--kz-fg-muted)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <Link
            to="/timeline"
            className="text-xs font-semibold text-[var(--kz-fg-muted)] hover:text-[var(--kz-accent)] transition-colors inline-flex items-center gap-0.5 ml-1"
            title="查看完整放送时间表"
          >
            <span>时间表</span>
            <span aria-hidden="true">&rsaquo;</span>
          </Link>
        </div>
      </div>

      {/* 2. 2 行 × 3 列 6 宫格矩阵（无外层容器嵌套，底边与左侧大图 100% 绝对对齐） */}
      <div className="flex-1 min-h-0">
        {calendarQuery.isLoading ? (
          <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="kz-skeleton h-full w-full rounded-xl"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : currentDayItems.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--kz-fg-dim)]">
            当天暂无新番播出
          </div>
        ) : (
          <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-2.5">
            {Array.from({ length: CARDS_PER_PAGE }).map((_, index) => {
              const item = pagedItems[index]
              if (!item) {
                // 最后一页不足 6 部时占位对齐
                return <div key={`empty-${index}`} className="invisible h-full w-full" />
              }
              return (
                <CompactGridCard
                  key={item.id}
                  item={item}
                  host={host}
                  openInNewTab={openInNewTab}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})
