import { memo, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { BangumiItem, HighlightItem } from '@animaku/shared'
import {
  coverOf,
  extractBangumiSeed,
  bangumiImageUrl,
  DEFAULT_BANGUMI_IMAGE_HOST,
  calculateAnimeHeat,
  formatHeatDisplay,
} from '@animaku/shared'
import { bangumiApi } from '../../lib/bangumi'
import { useSettingsStore } from '../../stores/settings'
import { usePlacementHighlight } from '../../lib/highlights'
import { preloadVideoPlayer } from '../../player/lazy'
import { preloadRoute } from '../../lib/route-preload'
import { EMPTY_ARRAY } from '../../lib/stable'

const CARDS_PER_PAGE = 6

function RotateCwIcon({
  className = 'w-4 h-4',
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  )
}

function HotFireIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
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
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
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
  const seed = useMemo(() => extractBangumiSeed(item), [item])

  // 综合热度指标：基于热度算法（在看人数 + 评分人数 + 口碑加成）计算
  const heatText = useMemo(() => {
    const heat = calculateAnimeHeat(item)
    return heat > 0 ? formatHeatDisplay(heat) : null
  }, [item])

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
      className="group relative block aspect-[16/10.3] w-full overflow-hidden rounded-xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-soft)] transition-all duration-300 hover:border-[var(--kz-accent)]/60 hover:shadow-md"
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

      {/* 右上角热度指标（空心纯轮廓火焰图标 + 间隙 + 放大版 13.5px 热度字号 + 抗干扰阴影） */}
      {heatText && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
          <HotFireIcon className="h-4 w-4 shrink-0" />
          <span className="text-[13.5px] font-medium tabular-nums leading-none">{heatText}</span>
        </div>
      )}

      {/* 底部暗色遮罩 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      {/* 底部中文标题：斗鱼同款 14px 常规体字体 */}
      <div className="absolute inset-x-0 bottom-0 p-1.5 z-10">
        <p className="truncate text-[14px] font-normal text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" title={title}>
          {title}
        </p>
      </div>
    </Link>
  )
})

const CompactHighlightCard = memo(function CompactHighlightCard({
  item,
}: {
  item: HighlightItem
}) {
  return (
    <a
      href={item.linkUrl}
      target={item.target || '_blank'}
      rel="noopener noreferrer sponsored"
      title={item.title}
      className="group relative block aspect-[16/10.3] w-full overflow-hidden rounded-xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-soft)] transition-all duration-300 hover:border-[var(--kz-accent)]/60 hover:shadow-md"
    >
      {/* 满幅图片铺满，与番剧卡片清晰区隔 */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.title || '运营推荐'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-106"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--kz-bg-soft)] text-[10px] text-[var(--kz-fg-dim)]">
          {item.title}
        </div>
      )}

      {/* 顶部胶囊角标 (取代原番剧金色星级，可手动删除) */}
      {item.badge && (
        <div className="absolute right-1.5 top-1.5 z-10">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white border border-white/15 backdrop-blur-xs shadow-xs">
            {item.badge}
          </span>
        </div>
      )}

      {/* 底部暗色遮罩与中文标题 (若有标题展示) */}
      {item.title && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-1.5 z-10">
            <p className="truncate text-[14px] font-normal text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" title={item.title}>
              {item.title}
            </p>
          </div>
        </>
      )}
    </a>
  )
})

type HeroGridCell =
  | { kind: 'anime'; item: BangumiItem }
  | { kind: 'highlight'; item: HighlightItem }
  | { kind: 'empty' }

export const DailyScheduleHeroCard = memo(function DailyScheduleHeroCard() {
  const host =
    useSettingsStore((s) => s.bangumiImageHost) || DEFAULT_BANGUMI_IMAGE_HOST
  const openInNewTab = useSettingsStore((s) => s.nav.openInNewTab)

  // 今日放送广告位：若已启用则按方案 A（每页第 6 格，不满 6 部排在末尾）
  const dailyHighlight = usePlacementHighlight('daily_schedule')?.items[0]

  // 物理现实的今日周几（0=周一 .. 6=周日）
  const todayWeekdayIndex = useMemo(() => {
    const rawDay = new Date().getDay() // 0=Sun, 1=Mon .. 6=Sat
    return rawDay === 0 ? 6 : rawDay - 1
  }, [])

  const [pageIndex, setPageIndex] = useState(0)
  const [rotationCount, setRotationCount] = useState(0)

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

  // 有广告时每页取 5 部番剧留出 1 格给广告；无广告时每页 6 部番剧
  const animesPerPage = dailyHighlight ? 5 : 6

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(currentDayItems.length / animesPerPage))
  }, [currentDayItems.length, animesPerPage])

  const handleNextPage = useCallback(() => {
    setRotationCount((prev) => prev + 1)
    setPageIndex((prev) => (prev + 1) % totalPages)
  }, [totalPages])

  // 方案 A 矩阵单元构建：
  // 先放入当前页的番剧，接着紧随放入广告卡片（满 5 部则恰为第 6 格；不足 5 部则排在末尾）；剩余不足 6 格补充 empty 占位
  const gridCells = useMemo<HeroGridCell[]>(() => {
    const start = pageIndex * animesPerPage
    const pageAnimes = currentDayItems.slice(start, start + animesPerPage)
    const cells: HeroGridCell[] = pageAnimes.map((item) => ({ kind: 'anime', item }))

    if (dailyHighlight) {
      cells.push({ kind: 'highlight', item: dailyHighlight })
    }

    // 补齐 6 格占位，防止 CSS Grid 坍塌
    while (cells.length < CARDS_PER_PAGE) {
      cells.push({ kind: 'empty' })
    }

    return cells.slice(0, CARDS_PER_PAGE)
  }, [currentDayItems, pageIndex, animesPerPage, dailyHighlight])

  return (
    <div className="relative w-full">
      {/* 语义化隐藏标题，确保无障碍与 SEO 结构完整 */}
      <h2 className="sr-only">今日放送</h2>

      {/* 2 行 × 3 列 6 宫格矩阵（纯比例 16:10.3 驱动，严密锁定高度，杜绝撑大） */}
      <div className="w-full">
        {calendarQuery.isLoading ? (
          <div className="grid w-full grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="kz-skeleton aspect-[16/10.3] w-full rounded-xl"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : currentDayItems.length === 0 ? (
          <div className="flex aspect-[16/10.3] w-full items-center justify-center rounded-xl border border-[var(--kz-border)]/50 bg-[var(--kz-bg-soft)] text-xs text-[var(--kz-fg-dim)]">
            当天暂无新番播出
          </div>
        ) : (
          <div className="grid w-full grid-cols-3 gap-2.5">
            {gridCells.map((cell, index) => {
              if (cell.kind === 'empty') {
                return <div key={`empty-${index}`} className="invisible aspect-[16/10.3] w-full" aria-hidden="true" />
              }
              if (cell.kind === 'highlight') {
                return <CompactHighlightCard key={`highlight-${cell.item.id}`} item={cell.item} />
              }
              return (
                <CompactGridCard
                  key={cell.item.id}
                  item={cell.item}
                  host={host}
                  openInNewTab={openInNewTab}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* 右侧空白边缘操作区：B 站同款外挂到右侧留白空白处，零挤占卡片网格 */}
      <div className="absolute left-[calc(100%+12px)] top-0 z-20 flex flex-col items-center">
        <button
          type="button"
          onClick={handleNextPage}
          title="换一批"
          aria-label="换一批"
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg-muted)] shadow-xs transition-all duration-200 hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)] hover:shadow-sm active:scale-95 cursor-pointer"
        >
          <RotateCwIcon
            className="h-4.5 w-4.5 transition-transform duration-500 ease-out"
            style={{ transform: `rotate(${rotationCount * 360}deg)` }}
          />
        </button>
      </div>
    </div>
  )
})
