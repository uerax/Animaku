import { memo, useState, useRef, useLayoutEffect, useMemo, useEffect, useId, forwardRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { BangumiItem } from '@animaku/shared'
import {
  airProgressLabel,
  coverOf,
  estimateAirProgress,
  extractBangumiSeed,
  calculateAnimeHeat,
  formatHeatDisplay,
} from '@animaku/shared'
import { preloadVideoPlayer } from '../player/lazy'
import { preloadRoute } from '../lib/route-preload'
import { useSettingsStore } from '../stores/settings'
import { perfMetrics } from '../lib/performance-metrics'

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

export * from './BangumiImage'
export * from './Modal'
export * from './Collapsible'
export * from './Switch'
export { UserDropdown } from './UserDropdown'
export { NotFoundPage } from '../pages/NotFoundPage'
export type { NotFoundPageProps } from '../pages/NotFoundPage'

/** Unboxed status text color floating over poster top gradient (bold italic, like score). */
function airStatusClass(
  status: ReturnType<typeof estimateAirProgress>['status'],
): string {
  switch (status) {
    case 'finished':
      return 'text-emerald-300'
    case 'airing':
      return 'text-sky-300'
    case 'upcoming':
      return 'text-indigo-300'
    default:
      return 'text-white'
  }
}

/** First-screen grid: eager; index 0 may use high fetch priority (LCP). */
export type CoverImagePriority = 'lazy' | 'eager' | 'high'

/** Motion-augmented Link for physical hover elevation and tap response */
const MotionLink = motion.create(Link)

export const BangumiCard = memo(function BangumiCard({
  item,
  imagePriority = 'lazy',
  coverSize = 'thumb',
}: {
  item: BangumiItem
  imagePriority?: CoverImagePriority
  coverSize?: 'thumb' | 'large'
}) {
  const isReducedMotion = useReducedMotion()

  const cover = coverOf(item, coverSize)
  const title = item.nameCn || item.name
  const score =
    item.ratingScore > 0 ? item.ratingScore.toFixed(1) : null
  // Derived at render from cached airDate/eps (not frozen inside list TTL).
  const air = estimateAirProgress(item)
  const airLabel = airProgressLabel(item)
  const heatText = useMemo(() => {
    const heat = calculateAnimeHeat(item)
    return heat > 0 ? formatHeatDisplay(heat) : null
  }, [item])

  const eager = imagePriority !== 'lazy'
  const isLcp = imagePriority === 'high'

  const [loadedCover, setLoadedCover] = useState<string | null>(null)
  const isLoaded = Boolean(cover && loadedCover === cover)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // 物理级 0 闪烁防线：在首帧 Paint 之前同步检查是否命中本地缓存并重置错误态
  useLayoutEffect(() => {
    setHasError(false)
    if (cover && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoadedCover(cover)
    }
  }, [cover])

  const openInNewTab = useSettingsStore((s) => s.nav.openInNewTab)
  const seed = useMemo(() => extractBangumiSeed(item), [item])

  const onCardWarmup = () => {
    preloadRoute('subject')
    preloadVideoPlayer()
  }

  return (
    <MotionLink
      to={`/subject/${item.id}`}
      state={seed ? { seed } : undefined}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      // Warm Subject route + player chunk on intent
      onMouseEnter={onCardWarmup}
      onFocus={onCardWarmup}
      onTouchStart={onCardWarmup}
      onClick={() => perfMetrics.markNavigation(item.id)}
      whileHover={isReducedMotion ? undefined : { y: -7 }}
      whileTap={isReducedMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="bangumi-card group flex flex-col overflow-hidden rounded-2xl bg-transparent"
    >
      <div className="bangumi-card-cover relative aspect-[3/4] overflow-hidden rounded-2xl bg-[var(--kz-bg-soft)] shadow-[0_10px_28px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] ring-1 ring-[var(--kz-border)] dark:ring-white/10">
        {!isLoaded && !isLcp && (
          <div
            className="kz-skeleton absolute inset-0 z-0 rounded-[inherit]"
            aria-hidden="true"
          />
        )}
        {cover && !hasError ? (
          <img
            key={cover}
            ref={imgRef}
            src={cover}
            alt={item.nameCn || item.name || '动画封面'}
            referrerPolicy="no-referrer"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            // React 19 / browsers: hint LCP candidate on the first above-fold card
            fetchPriority={
              imagePriority === 'high'
                ? 'high'
                : imagePriority === 'eager'
                  ? 'auto'
                  : 'low'
            }
            // Intrinsic hint for aspect ratio before CSS; common covers ~200px wide
            width={200}
            height={267}
            onLoad={() => setLoadedCover(cover)}
            onError={() => setHasError(true)}
            className={`h-full w-full object-cover ${
              isLcp || isLoaded
                ? 'opacity-100'
                : 'opacity-0 transition-opacity duration-150'
            }`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-medium text-[var(--kz-fg-dim)]">
            无封面
          </div>
        )}
        {/* top gradient for status legibility over bright covers */}
        {airLabel && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/60 via-black/20 to-transparent"
            aria-hidden
          />
        )}
        {/* top-right status: unboxed upright bold text directly on cover */}
        {airLabel && (
          <span
            className={`absolute top-2 right-2.5 text-xs font-bold tracking-wider drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:text-[13px] ${airStatusClass(air.status)}`}
          >
            {airLabel}
          </span>
        )}
        {/* bottom gradient for score / watcher legibility */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
          aria-hidden
        />
        {/* bottom-left stats: 纯白空心线框火焰 + 今日更新同款 13.5px font-medium 琥珀金热度数值 + 立体暗影 */}
        {heatText && (
          <span className="absolute bottom-1.5 left-2.5 flex max-w-[60%] items-center gap-1.5 truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
            <HotFireIcon className="h-4 w-4 shrink-0 text-white" />
            <span className="text-[13.5px] font-medium tabular-nums leading-none text-amber-300">
              {heatText}
            </span>
          </span>
        )}
        {score && (
          <span className="absolute bottom-1 right-2.5 text-lg font-black italic tracking-tight text-white tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] sm:text-xl">
            {score}
          </span>
        )}
        {/* GiriGiri 风格悬浮展开 Cue 指引层 (微秒级阶梯弹出与镜头推进) */}
        <div className="poster-cue" aria-hidden="true">
          <span className="poster-cue-ring">
            <svg
              className="size-6 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6c0 0 6 4.4189 6 6s-6 6-6 6" />
            </svg>
          </span>
          <span className="poster-cue-text">查看番剧</span>
        </div>
      </div>
      <div className="space-y-0.5 px-0.5 pb-1 pt-3">
        <div className="line-clamp-2 text-[15px] font-medium leading-snug text-[var(--kz-fg)] transition-colors duration-200 group-hover:text-[var(--kz-accent)]">
          {title}
        </div>
        {item.nameCn && item.name && item.nameCn !== item.name && (
          <div className="truncate text-[13px] text-[var(--kz-fg-muted)]">
            {item.name}
          </div>
        )}
      </div>
    </MotionLink>
  )
})

/**
 * 网格列数定义：响应式断点最高封顶为 7 列 (xl/2xl: 7 列)
 */
const BANGUMI_GRID_CLASS =
  'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-7 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-7'

const GRID_MQ_XL = '(min-width: 1280px)'
const GRID_MQ_LG = '(min-width: 1024px)'
const GRID_MQ_MD = '(min-width: 768px)'
const GRID_MQ_SM = '(min-width: 640px)'

/**
 * 依据 BANGUMI_GRID_CLASS 实际列数断点，计算首屏第一排封面的 eager 资源预算：
 * - 移动端 (<640px, 2列): 2
 * - 小平板端 (640px~767px, 3列): 3
 * - 平板端 (768px~1023px, 4列): 4
 * - 桌面端 (1024px~1279px, 6列): 6
 * - 宽屏桌面/大屏端 (>=1280px, 7列): 7
 */
function getResponsiveGridEagerCount(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 6 // SSR / 无 window 环境默认兜底桌面首排
  }
  if (window.matchMedia(GRID_MQ_XL).matches) return 7
  if (window.matchMedia(GRID_MQ_LG).matches) return 6
  if (window.matchMedia(GRID_MQ_MD).matches) return 4
  if (window.matchMedia(GRID_MQ_SM).matches) return 3
  return 2
}

export function useResponsiveGridEagerCount(): number {
  const [count, setCount] = useState(getResponsiveGridEagerCount)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mqXl = window.matchMedia(GRID_MQ_XL)
    const mqLg = window.matchMedia(GRID_MQ_LG)
    const mqMd = window.matchMedia(GRID_MQ_MD)
    const mqSm = window.matchMedia(GRID_MQ_SM)
    const update = () => setCount(getResponsiveGridEagerCount())
    update()
    const mqs = [mqXl, mqLg, mqMd, mqSm]
    mqs.forEach((mq) => {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', update)
      } else {
        mq.addListener(update)
      }
    })
    return () => {
      mqs.forEach((mq) => {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', update)
        } else {
          mq.removeListener(update)
        }
      })
    }
  }, [])

  return count
}

export type ResponsiveRows =
  | number
  | {
      mobile?: number // 手机端 (< 640px, cols <= 2)
      tablet?: number // 平板端 (640px~1023px, cols 3~4)
      desktop?: number // 电脑端 (>= 1024px, cols >= 6)
    }

function resolveMaxRows(
  maxRows: ResponsiveRows | undefined,
  cols: number,
): number | undefined {
  if (!maxRows) return undefined
  if (typeof maxRows === 'number') return maxRows
  if (cols <= 2) return maxRows.mobile ?? maxRows.desktop
  if (cols <= 4) return maxRows.tablet ?? maxRows.desktop
  return maxRows.desktop
}

export const BangumiGrid = memo(function BangumiGrid({
  items,
  /**
   * 首屏优先积极加载的封面数量，其余卡片严格保持视口懒加载（loading="lazy"）。
   * 若未指定，则默认精确对齐 BANGUMI_GRID_CLASS 的第一排实际列数（移动 2 / 平板 3~4 / 桌面 6~7）。
   */
  eagerCount: userEagerCount,
  coverSize = 'thumb',
  maxRows,
}: {
  items: BangumiItem[] | undefined | null
  eagerCount?: number
  coverSize?: 'thumb' | 'large'
  /** 限制最多渲染的行数，支持单一数值或按端定制 { mobile, tablet, desktop } */
  maxRows?: ResponsiveRows
}) {
  const responsiveEager = useResponsiveGridEagerCount()
  const eagerCount = userEagerCount ?? responsiveEager
  const isReducedMotion = useReducedMotion()
  // 动态对齐当前响应式视口的实际列数 (移动 2 / 平板 3~4 / 桌面 6~7)，杜绝跨行错位倒流
  const cols = Math.max(1, responsiveEager)
  const rows = resolveMaxRows(maxRows, cols)

  const rawList = Array.isArray(items) ? items : []
  const list = rows && rows > 0 ? rawList.slice(0, cols * rows) : rawList
  if (!list.length) {
    return <EmptyState text="暂无数据" />
  }
  // Wider shell + fewer cols at mid breakpoints → larger posters (portal-style).
  return (
    <div className={BANGUMI_GRID_CLASS}>
      {list.map((item, index) => {
        let imagePriority: CoverImagePriority = 'lazy'
        if (index < eagerCount) {
          // First card is the strongest LCP candidate on home / browse.
          imagePriority = index === 0 ? 'high' : 'eager'
        }
        const row = Math.floor(index / cols)
        const col = index % cols
        // 二维对角线水波纹阶梯：相邻行相位差 80ms + 列步进 35ms，硬上限 0.32s 封顶防长列表滞后
        const staggerDelay = isReducedMotion
          ? 0
          : Math.min(0.32, (row % 2) * 0.08 + col * 0.035)

        return (
          <motion.div
            key={item.id}
            initial={isReducedMotion ? false : { opacity: 0, y: 18 }}
            whileInView={isReducedMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.08 }}
            transition={{
              duration: isReducedMotion ? 0 : 0.42,
              delay: staggerDelay,
              ease: 'easeOut',
            }}
            className="min-w-0 will-change-[transform,opacity]"
          >
            <BangumiCard
              item={item}
              imagePriority={imagePriority}
              coverSize={coverSize}
            />
          </motion.div>
        )
      })}
    </div>
  )
})

/**
 * CLS stand-in for BangumiGrid while list queries load.
 * Matches column gutters + 3:4 cover + title block height of BangumiCard.
 * 默认渲染 2 整排骨架（移动端 4、平板端 8、桌面端 12），消除移动端超长骨架屏高度坍塌跳跃。
 */
export function BangumiGridSkeleton({
  count: userCount,
  maxRows,
}: {
  count?: number
  /** 限制骨架屏渲染的最大行数，支持单一数值或按端定制 { mobile, tablet, desktop } */
  maxRows?: ResponsiveRows
}) {
  const responsiveEager = useResponsiveGridEagerCount()
  const rows = resolveMaxRows(maxRows, responsiveEager)
  const defaultCount =
    rows && rows > 0 ? responsiveEager * rows : responsiveEager * 2
  const n = Math.max(1, Math.min(userCount ?? defaultCount, 28))
  return (
    <div
      className={BANGUMI_GRID_CLASS}
      aria-busy="true"
      aria-label="加载中"
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-2xl">
          <div className="kz-skeleton aspect-[3/4] rounded-2xl ring-1 ring-[var(--kz-border)]" />
          <div className="space-y-2 px-0.5 pb-1 pt-3">
            <div className="kz-skeleton h-4 w-[88%] rounded-md" />
            <div className="kz-skeleton h-3 w-[55%] rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="kz-surface border-dashed px-4 py-16 text-center text-sm text-[var(--kz-fg-dim)] shadow-none">
      {text}
    </div>
  )
}

/** Compact spinner — prefer BangumiGridSkeleton on list routes (CLS). */
export function LoadingState({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="kz-surface px-4 py-16 text-center text-sm text-[var(--kz-fg-muted)]">
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--kz-border)] border-t-[var(--kz-accent)]" />
        {text}
      </span>
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const msg = error instanceof Error ? error.message : '出错了'
  return (
    <div
      className="kz-surface kz-surface-danger px-4 py-10 text-center"
      data-nosnippet
    >
      <div className="mx-auto max-w-xl text-left text-sm leading-relaxed break-words whitespace-pre-wrap text-[var(--kz-danger)]">
        {msg}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="kz-btn-primary mt-4"
        >
          重试
        </button>
      )}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-[1.95rem] font-bold leading-[1.15] tracking-[-0.035em] text-[var(--kz-fg)] sm:text-[2.15rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--kz-fg-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
   KzSelect — 通用现代仿水滴/玻璃拟态流光下拉选择组件
   支持 framer-motion 弹性进出、高光边框、180°指示翻转与全键盘交互
   ────────────────────────────────────────────────────────── */

export interface KzSelectOption<T extends string | number> {
  value: T
  label: string
  badge?: string
}

export interface KzSelectProps<T extends string | number> {
  id?: string
  value: T
  options: readonly KzSelectOption<T>[] | KzSelectOption<T>[]
  onChange: (val: T) => void
  placeholder?: string
  className?: string
  dropdownWidth?: string
  align?: 'left' | 'right'
  size?: 'sm' | 'md'
  disabled?: boolean
  'aria-label'?: string
}

export function KzSelect<T extends string | number>({
  id,
  value,
  options,
  onChange,
  placeholder,
  className = '',
  dropdownWidth,
  align = 'left',
  size = 'md',
  disabled = false,
  'aria-label': ariaLabel,
}: KzSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isReducedMotion = useReducedMotion()

  const selectedOption = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const sizeClasses =
    size === 'sm'
      ? 'h-8 px-2.5 text-xs rounded-xl gap-1.5'
      : 'h-9 px-3 text-xs sm:text-sm rounded-xl gap-2'

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex items-center justify-between w-full border border-[var(--kz-border)] bg-[var(--kz-bg)] font-medium text-[var(--kz-fg)] transition-all cursor-pointer select-none text-left shadow-xs hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${
          open ? 'border-[var(--kz-accent)] ring-1 ring-[var(--kz-accent)]/50' : ''
        }`}
      >
        <span className="truncate min-w-0">
          {selectedOption?.label ?? placeholder ?? String(value)}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-[var(--kz-fg-muted)] shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-[var(--kz-accent)]' : ''
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={isReducedMotion ? false : { opacity: 0, scale: 0.95, y: -4 }}
            animate={isReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={isReducedMotion ? undefined : { opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: align === 'left' ? 'top left' : 'top right' }}
            className={`absolute ${
              align === 'left' ? 'left-0' : 'right-0'
            } top-[calc(100%+6px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/98 p-1 shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/10 ${
              dropdownWidth || 'w-full min-w-[9rem]'
            }`}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs sm:text-sm transition-colors cursor-pointer select-none ${
                    isSelected
                      ? 'bg-[var(--kz-accent)]/15 font-semibold text-[var(--kz-accent)]'
                      : 'text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)]'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-1.5">
                    {opt.badge && (
                      <span className="rounded bg-[var(--kz-bg-soft)] px-1.5 py-0.5 text-[10px] text-[var(--kz-fg-dim)]">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <svg
                        className="h-3.5 w-3.5 text-[var(--kz-accent)] shrink-0"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
   KzSwitch — 通用物理弹簧质感胶囊开关组件
   仿 iOS/Material 物理阻尼滚珠滑动，彻底替代原生 HTML Checkbox
   ────────────────────────────────────────────────────────── */

export interface KzSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  size?: 'sm' | 'md'
  id?: string
  'aria-label'?: string
}

export function KzSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  size = 'md',
  id,
  'aria-label': ariaLabel,
}: KzSwitchProps) {
  const isReducedMotion = useReducedMotion()

  const trackClasses =
    size === 'sm' ? 'w-9 h-5 p-0.5' : 'w-11 h-6 p-0.5'

  const thumbSize =
    size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'

  const shiftDistance = size === 'sm' ? 16 : 20

  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer group'
      }`}
    >
      {label && (
        <span className="text-xs sm:text-sm font-medium text-[var(--kz-fg)]">
          {label}
        </span>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kz-accent)] focus-visible:ring-offset-2 ${trackClasses} ${
          checked
            ? 'bg-[var(--kz-accent)] border-[var(--kz-accent)]'
            : 'bg-[var(--kz-bg-soft)] border-[var(--kz-border)] hover:bg-[var(--kz-bg-hover)]'
        }`}
      >
        <motion.span
          transition={
            isReducedMotion
              ? { duration: 0 }
              : { type: 'spring', damping: 25, stiffness: 350 }
          }
          animate={{ x: checked ? shiftDistance : 0 }}
          className={`pointer-events-none block rounded-full bg-white shadow-sm ring-0 ${thumbSize}`}
        />
      </button>
    </label>
  )
}

/* ──────────────────────────────────────────────────────────
   KzSegmented — 通用现代物理弹簧质感分段胶囊组件
   支持 framer-motion 阻尼滑块、等宽对称、极简轻量
   ────────────────────────────────────────────────────────── */

export interface KzSegmentedOption<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
  loading?: boolean
}

export interface KzSegmentedProps<T extends string = string> {
  value: T
  options: readonly KzSegmentedOption<T>[] | KzSegmentedOption<T>[]
  onChange: (val: T) => void
  equalWidth?: boolean
  size?: 'sm' | 'md'
  className?: string
  layoutId?: string
  'aria-label'?: string
}

export function KzSegmented<T extends string = string>({
  value,
  options,
  onChange,
  equalWidth = true,
  size = 'sm',
  className = '',
  layoutId: customLayoutId,
  'aria-label': ariaLabel,
}: KzSegmentedProps<T>) {
  const isReducedMotion = useReducedMotion()
  const autoId = useId()
  const layoutId = customLayoutId || `kz-seg-${autoId}`

  const sizeClasses =
    size === 'sm'
      ? {
          btn: 'h-7 px-2.5 text-xs',
          icon: 'size-3.5',
          text: 'text-xs',
          gap: 'gap-1.5',
        }
      : {
          btn: 'h-8 px-3 text-sm',
          icon: 'size-3.5',
          text: 'text-sm',
          gap: 'gap-1.5',
        }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`p-0.5 rounded-full bg-[var(--kz-bg-soft)] border border-[var(--kz-border-subtle)] shadow-2xs select-none inline-flex items-center ${
        equalWidth ? 'w-full' : ''
      } ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(opt.value)}
            className={`group relative flex items-center justify-center ${sizeClasses.gap} ${sizeClasses.btn} rounded-full leading-none transition-colors duration-200 cursor-pointer select-none ${
              equalWidth ? 'flex-1 w-0 min-w-0' : 'min-w-0'
            } ${
              isSelected
                ? 'font-semibold text-[var(--kz-fg)]'
                : 'font-medium text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]'
            }`}
          >
            {isSelected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-[var(--kz-bg-elevated)] shadow-xs ring-1 ring-black/5 dark:ring-white/10"
                transition={
                  isReducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', damping: 25, stiffness: 350 }
                }
              />
            )}
            {opt.icon && (
              <span
                className={`${sizeClasses.icon} shrink-0 transition-colors relative z-10 ${
                  isSelected
                    ? 'text-[var(--kz-accent)]'
                    : 'text-[var(--kz-fg-dim)] group-hover:text-[var(--kz-fg-muted)]'
                }`}
              >
                {opt.icon}
              </span>
            )}
            <span className={`relative z-10 whitespace-nowrap shrink-0 ${sizeClasses.text}`}>
              {opt.label}
            </span>
            {opt.loading && (
              <span className="relative z-10 inline-block size-2.5 animate-spin rounded-full border border-current border-t-transparent text-[var(--kz-accent)] shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
   KzButton — 通用现代标准按钮组件
   支持丰富变体、微触觉缩放反馈、Loading 加载态与图标集成
   ────────────────────────────────────────────────────────── */

export type KzButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-outline'

export type KzButtonSize = 'xs' | 'sm' | 'md' | 'lg'

export interface KzButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: KzButtonVariant
  size?: KzButtonSize
  loading?: boolean
  pill?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const KzButton = forwardRef<HTMLButtonElement, KzButtonProps>(
  function KzButton(
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      pill = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading

    const sizeClasses: Record<KzButtonSize, string> = {
      xs: 'h-6 px-2 text-[11px] gap-1',
      sm: 'h-8 px-2.5 text-xs gap-1.5',
      md: 'h-9 px-3.5 text-xs sm:text-sm gap-2',
      lg: 'h-10 sm:h-11 px-4 sm:px-5 text-sm sm:text-base gap-2',
    }

    const roundedClass = pill
      ? 'rounded-full'
      : size === 'xs'
        ? 'rounded-lg'
        : size === 'lg'
          ? 'rounded-2xl'
          : 'rounded-xl'

    const variantClasses: Record<KzButtonVariant, string> = {
      primary:
        'bg-[var(--kz-accent)] text-white hover:bg-[var(--kz-accent-hover)] shadow-xs hover:shadow-[0_2px_12px_var(--kz-accent-ring)] active:scale-[0.98] border-0',
      secondary:
        'bg-[var(--kz-bg-soft)] text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] border border-[var(--kz-border)] hover:border-[var(--kz-border-hover,var(--kz-border))] active:scale-[0.98]',
      outline:
        'bg-transparent text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] border border-[var(--kz-border)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-[0.98]',
      ghost:
        'bg-transparent text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] border-0 active:scale-[0.98]',
      danger:
        'bg-[var(--kz-danger)] text-white hover:opacity-90 shadow-xs active:scale-[0.98] border-0',
      'danger-outline':
        'bg-transparent text-[var(--kz-danger)] hover:bg-rose-500/10 border border-rose-500/30 active:scale-[0.98]',
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center font-medium select-none cursor-pointer transition-all duration-150 shrink-0 ${sizeClasses[size]} ${roundedClass} ${variantClasses[variant]} ${
          isDisabled
            ? 'opacity-50 cursor-not-allowed pointer-events-none active:scale-100 shadow-none'
            : ''
        } ${className}`}
        {...rest}
      >
        {loading ? (
          <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>
        )}
        {children && <span className="truncate leading-none">{children}</span>}
        {!loading && rightIcon && (
          <span className="shrink-0 flex items-center">{rightIcon}</span>
        )}
      </button>
    )
  },
)

/* ──────────────────────────────────────────────────────────
   KzInput — 通用现代标准单行输入框组件
   支持焦点流光、清空按钮、密码显隐切换、前后缀图标与错误态
   ────────────────────────────────────────────────────────── */

export type KzInputSize = 'sm' | 'md' | 'lg'

export interface KzInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: KzInputSize
  error?: boolean | string
  clearable?: boolean
  onClear?: () => void
  showPasswordToggle?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  containerClassName?: string
}

export const KzInput = forwardRef<HTMLInputElement, KzInputProps>(
  function KzInput(
    {
      size = 'md',
      error = false,
      clearable = false,
      onClear,
      showPasswordToggle = false,
      leftIcon,
      rightIcon,
      containerClassName = '',
      className = '',
      type = 'text',
      value,
      onChange,
      disabled,
      ...rest
    },
    ref,
  ) {
    const [showPassword, setShowPassword] = useState(false)
    const isPasswordType = type === 'password'
    const actualType = isPasswordType && showPassword ? 'text' : type

    const sizeClasses: Record<KzInputSize, { container: string; input: string }> = {
      sm: {
        container: 'h-8 rounded-xl text-xs px-2.5',
        input: 'text-xs',
      },
      md: {
        container: 'h-9 sm:h-10 rounded-xl text-xs sm:text-sm px-3',
        input: 'text-xs sm:text-sm',
      },
      lg: {
        container: 'h-11 sm:h-12 rounded-2xl text-sm sm:text-base px-3.5',
        input: 'text-sm sm:text-base',
      },
    }

    const hasValue = value !== undefined && value !== '' && String(value).length > 0
    const hasError = Boolean(error)
    const errorMessage = typeof error === 'string' ? error : undefined

    return (
      <div className={`relative flex flex-col gap-1 ${containerClassName}`}>
        <div
          className={`group flex items-center w-full border bg-[var(--kz-bg)] text-[var(--kz-fg)] transition-all duration-150 ${
            sizeClasses[size].container
          } ${
            hasError
              ? 'border-rose-500 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20'
              : 'border-[var(--kz-border)] hover:border-[var(--kz-border-hover,var(--kz-border))] focus-within:border-[var(--kz-accent)] focus-within:ring-2 focus-within:ring-[var(--kz-accent)]/20'
          } ${disabled ? 'opacity-50 cursor-not-allowed bg-[var(--kz-bg-soft)]' : ''}`}
        >
          {leftIcon && (
            <span className="shrink-0 mr-2 text-[var(--kz-fg-dim)] group-focus-within:text-[var(--kz-accent)] transition-colors flex items-center">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            type={actualType}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className={`kz-input-native w-full min-w-0 bg-transparent text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] !border-none !outline-none !shadow-none p-0 ring-0 focus:!border-none focus:!outline-none focus:!shadow-none focus:ring-0 ${
              sizeClasses[size].input
            } ${className}`}
            {...rest}
          />
          {clearable && hasValue && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                if (onClear) onClear()
                if (onChange) {
                  const event = {
                    target: { value: '' },
                  } as React.ChangeEvent<HTMLInputElement>
                  onChange(event)
                }
              }}
              className="shrink-0 ml-1.5 p-0.5 rounded-full text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] transition-colors cursor-pointer"
              title="清空"
              aria-label="清空内容"
            >
              <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
          {isPasswordType && showPasswordToggle && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((p) => !p)}
              className="shrink-0 ml-1.5 text-xs font-semibold text-[var(--kz-accent)] hover:opacity-80 transition-opacity cursor-pointer select-none"
              title={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? '隐藏' : '显示'}
            </button>
          )}
          {rightIcon && (
            <span className="shrink-0 ml-1.5 text-[var(--kz-fg-dim)] flex items-center">
              {rightIcon}
            </span>
          )}
        </div>
        {errorMessage && (
          <span className="text-[11px] font-medium text-rose-500 leading-tight">
            {errorMessage}
          </span>
        )}
      </div>
    )
  },
)

/* ──────────────────────────────────────────────────────────
   KzTextarea — 通用现代标准多行文本域组件
   ────────────────────────────────────────────────────────── */

export interface KzTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string
  containerClassName?: string
}

export const KzTextarea = forwardRef<HTMLTextAreaElement, KzTextareaProps>(
  function KzTextarea(
    {
      error = false,
      containerClassName = '',
      className = '',
      disabled,
      ...rest
    },
    ref,
  ) {
    const hasError = Boolean(error)
    const errorMessage = typeof error === 'string' ? error : undefined

    return (
      <div className={`relative flex flex-col gap-1 w-full ${containerClassName}`}>
        <textarea
          ref={ref}
          disabled={disabled}
          className={`w-full rounded-xl border bg-[var(--kz-bg)] p-3 text-xs sm:text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none transition-all duration-150 ${
            hasError
              ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
              : 'border-[var(--kz-border)] hover:border-[var(--kz-border-hover,var(--kz-border))] focus:border-[var(--kz-accent)] focus:ring-2 focus:ring-[var(--kz-accent)]/20'
          } ${
            disabled
              ? 'opacity-50 cursor-not-allowed bg-[var(--kz-bg-soft)]'
              : ''
          } ${className}`}
          {...rest}
        />
        {errorMessage && (
          <span className="text-[11px] font-medium text-rose-500 leading-tight">
            {errorMessage}
          </span>
        )}
      </div>
    )
  },
)
