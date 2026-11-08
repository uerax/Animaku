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
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8.624933333333333 13.666666666666666C8.624933333333333 14.011849999999999 8.345125 14.291666666666666 7.999933333333333 14.291666666666666C4.525166666666666 14.291666666666666 1.7082933333333332 11.474791666666665 1.7082933333333332 8C1.7082933333333332 6.013308333333333 2.629825 4.2414233333333335 4.066321666666667 3.089385C4.335603333333333 2.8734283333333335 4.728959999999999 2.9166533333333335 4.944915 3.1859349999999997C5.160871666666666 3.4552099999999997 5.1176466666666665 3.848573333333333 4.848366666666666 4.0645283333333335C3.694975 4.98953 2.9582933333333328 6.40852 2.9582933333333328 8C2.9582933333333328 10.784416666666667 5.215528333333333 13.041666666666666 7.999933333333333 13.041666666666666C8.345125 13.041666666666666 8.624933333333333 13.321483333333333 8.624933333333333 13.666666666666666zM11.060475 12.810558333333333C10.844225000000002 12.541558333333331 10.887033333333335 12.148125 11.156041666666667 11.931875C12.306858333333333 11.006775 13.041599999999999 9.589424999999999 13.041599999999999 8C13.041599999999999 5.215561666666666 10.784408333333332 2.958333333333333 7.999933333333333 2.958333333333333C7.6548083333333325 2.958333333333333 7.374933333333333 2.6785083333333333 7.374933333333333 2.333333333333333C7.374933333333333 1.9881533333333332 7.6548083333333325 1.7083333333333333 7.999933333333333 1.7083333333333333C11.474725000000001 1.7083333333333333 14.291599999999999 4.525206666666667 14.291599999999999 8C14.291599999999999 9.984108333333333 13.372483333333332 11.753958333333332 11.939225 12.906125C11.670166666666663 13.122375 11.276725 13.079625 11.060475 12.810558333333333z" />
      <path d="M1.375 3.4130866666666666C1.375 3.0679066666666666 1.654825 2.7880866666666666 2 2.7880866666666666L4.333333333333333 2.7880866666666666C4.862608333333333 2.7880866666666666 5.291666666666666 3.2171449999999995 5.291666666666666 3.7464199999999996L5.291666666666666 6.079753333333334C5.291666666666666 6.424928333333334 5.011841666666666 6.704736666666666 4.666666666666666 6.704736666666666C4.321491666666667 6.704736666666666 4.041666666666666 6.424928333333334 4.041666666666666 6.079753333333334L4.041666666666666 4.038086666666667L2 4.038086666666667C1.654825 4.038086666666667 1.375 3.7582616666666664 1.375 3.4130866666666666z" />
      <path d="M14.625 12.5864C14.625 12.931591666666666 14.345183333333333 13.2114 14 13.2114L11.666666666666666 13.2114C11.137408333333335 13.2114 10.708333333333332 12.782383333333332 10.708333333333332 12.253066666666665L10.708333333333332 9.919733333333333C10.708333333333332 9.574608333333334 10.98815 9.294733333333333 11.333333333333332 9.294733333333333C11.678516666666667 9.294733333333333 11.958333333333332 9.574608333333334 11.958333333333332 9.919733333333333L11.958333333333332 11.9614L14 11.9614C14.345183333333333 11.9614 14.625 12.241275000000002 14.625 12.5864z" />
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

      {/* 右侧空白边缘操作区：B 站原生同款“换一换”按钮 */}
      <div className="absolute left-[calc(100%+12px)] top-0 z-20 flex flex-col items-center">
        <button
          type="button"
          onClick={handleNextPage}
          title="换一换"
          aria-label="换一换"
          className="group relative flex w-10 flex-col items-center justify-center gap-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] py-2.5 text-[var(--kz-fg-base)] shadow-xs transition-all duration-200 hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)] hover:shadow-sm active:scale-95 cursor-pointer"
        >
          <RotateCwIcon
            className="h-4 w-4 shrink-0 transition-transform duration-500 ease-out"
            style={{ transform: `rotate(${rotationCount * 360}deg)` }}
          />
          <span className="flex flex-col items-center text-[13px] leading-[15px] select-none">
            <span>换</span>
            <span>一</span>
            <span>换</span>
          </span>
        </button>
      </div>
    </div>
  )
})
