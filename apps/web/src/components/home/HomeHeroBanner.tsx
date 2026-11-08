import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { BangumiItem, HighlightItem, RecommendItem } from '@animaku/shared'
import {
  coverOf,
  extractBangumiSeed,
  bangumiImageUrl,
  DEFAULT_BANGUMI_IMAGE_HOST,
} from '@animaku/shared'
import { useSettingsStore } from '../../stores/settings'
import { usePlacementHighlight } from '../../lib/highlights'
import { preloadVideoPlayer } from '../../player/lazy'
import { preloadRoute } from '../../lib/route-preload'

type BannerSlide =
  | { kind: 'anime'; item: BangumiItem; rec?: RecommendItem }
  | { kind: 'highlight'; item: HighlightItem }

interface HomeHeroBannerProps {
  items: BangumiItem[]
  recommendations?: RecommendItem[]
  autoPlayInterval?: number
}

function ChevronLeftIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M15.4571 3.04289C15.8476 3.43342 15.8476 4.06658 15.4571 4.45711L8.09098 11.8232C7.99335 11.9209 7.99335 12.0791 8.09098 12.1768L15.4571 19.5429C15.8476 19.9334 15.8476 20.5666 15.4571 20.9571C15.0666 21.3476 14.4334 21.3476 14.0429 20.9571L6.67677 13.591C5.79809 12.7123 5.79809 11.2877 6.67677 10.409L14.0429 3.04289C14.4334 2.65237 15.0666 2.65237 15.4571 3.04289z" />
    </svg>
  )
}

function ChevronRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8.5429 3.04289C8.15237 3.43342 8.15237 4.06658 8.5429 4.45711L15.909 11.8232C16.0066 11.9209 16.0066 12.0791 15.909 12.1768L8.5429 19.5429C8.15237 19.9334 8.15237 20.5666 8.5429 20.9571C8.93342 21.3476 9.56659 21.3476 9.95711 20.9571L17.3232 13.591C18.2019 12.7123 18.2019 11.2877 17.3232 10.409L9.95711 3.04289C9.56659 2.65237 8.93342 2.65237 8.5429 3.04289z" />
    </svg>
  )
}

function SparklesIcon({ className = 'h-3.5 w-3.5 text-amber-400 shrink-0', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
    </svg>
  )
}

export const HomeHeroBanner = memo(function HomeHeroBanner({
  items,
  recommendations,
  autoPlayInterval = 5000,
}: HomeHeroBannerProps) {
  const host =
    useSettingsStore((s) => s.bangumiImageHost) || DEFAULT_BANGUMI_IMAGE_HOST
  const openInNewTab = useSettingsStore((s) => s.nav.openInNewTab)
  const isReducedMotion = useReducedMotion()

  // 轮播图广告位配置：若已启用则随机抽取一帧插入（避开首张，保持良好首屏体验）
  const heroHighlight = usePlacementHighlight('hero_banner')?.items[0]

  const slides: BannerSlide[] = useMemo(() => {
    let raw: BannerSlide[] = []
    if (recommendations && recommendations.length > 0) {
      raw = recommendations.slice(0, 6).map((rec) => ({
        kind: 'anime',
        item: rec.item,
        rec,
      }))
    } else {
      raw = items.slice(0, 6).map((it) => ({ kind: 'anime', item: it }))
    }

    if (!heroHighlight || raw.length === 0) return raw

    // 随机插入到索引 1 到 raw.length 之间
    const insertIdx = Math.max(1, Math.floor(Math.random() * raw.length))
    const copy = [...raw]
    copy.splice(insertIdx, 0, { kind: 'highlight', item: heroHighlight })
    return copy
  }, [items, recommendations, heroHighlight])

  const count = slides.length

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resolveImageUrl = useCallback(
    (rawSrc?: string | null) => {
      if (!rawSrc) return ''
      return bangumiImageUrl(rawSrc, host)
    },
    [host],
  )

  const nextSlide = useCallback(() => {
    if (count <= 1) return
    setCurrentIndex((prev) => (prev + 1) % count)
  }, [count])

  const prevSlide = useCallback(() => {
    if (count <= 1) return
    setCurrentIndex((prev) => (prev - 1 + count) % count)
  }, [count])

  // 自动轮播定时器调度（支持鼠标悬停时暂停）
  useEffect(() => {
    if (count <= 1 || isPaused) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    timerRef.current = setTimeout(nextSlide, autoPlayInterval)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [currentIndex, count, isPaused, autoPlayInterval, nextSlide])

  if (count === 0) return null

  const currentSlide = slides[currentIndex] ?? slides[0]

  const currentReason = currentSlide.kind === 'anime' ? currentSlide.rec?.reason : null
  const currentMatchRate = currentSlide.kind === 'anime' ? currentSlide.rec?.matchRate : null
  const displayReason = useMemo(() => {
    if (!currentReason) return ''
    if (currentMatchRate != null && !currentReason.includes('契合度')) {
      if (currentReason.includes('题材')) {
        return currentReason.replace('题材', `题材，契合度 ${currentMatchRate}%`)
      }
      if (currentReason.includes('【')) {
        return currentReason.replace('】', `】，契合度 ${currentMatchRate}%`)
      }
      return `${currentReason}，契合度 ${currentMatchRate}%`
    }
    return currentReason
  }, [currentReason, currentMatchRate])

  return (
    <div
      className="@container group relative h-full w-full select-none overflow-hidden rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-xs"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 1. 轮播底图集合：负责纯图片 700ms 交叉淡入淡出，零内部文本销毁与重绘开销 */}
      {slides.map((slide, index) => {
        const isActive = index === currentIndex

        if (slide.kind === 'highlight') {
          const ad = slide.item
          return (
            <div
              key={`highlight-${ad.id}`}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
              }`}
              aria-hidden={!isActive}
            >
              <a
                href={ad.linkUrl}
                target={ad.target || '_blank'}
                rel="noopener noreferrer sponsored"
                tabIndex={isActive ? 0 : -1}
                className="relative block h-full w-full overflow-hidden"
              >
                {/* 满幅图片铺满，彻底与番剧卡片区隔 */}
                {ad.imageUrl ? (
                  <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-103"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--kz-bg-soft)] text-sm text-[var(--kz-fg-dim)]">
                    {ad.title}
                  </div>
                )}

                {/* 渐变暗色遮罩 */}
                <div
                  className={`pointer-events-none absolute inset-0 ${
                    ad.title || ad.subtitle
                      ? 'bg-gradient-to-t from-black/85 via-black/30 to-black/10'
                      : 'bg-black/10'
                  }`}
                />

                {/* 右上角胶囊角标 */}
                {ad.badge && (
                  <div className="absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
                    <span className="inline-flex items-center rounded-full border border-white/20 bg-black/65 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs backdrop-blur-md">
                      {ad.badge}
                    </span>
                  </div>
                )}
              </a>
            </div>
          )
        }

        const item = slide.item
        const coverUrl = resolveImageUrl(coverOf(item, 'large'))
        const title = item.nameCn || item.name
        const seed = extractBangumiSeed(item)

        return (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${
              isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
            }`}
            aria-hidden={!isActive}
          >
            <Link
              to={`/subject/${item.id}`}
              state={seed ? { seed } : undefined}
              target={openInNewTab ? '_blank' : undefined}
              rel={openInNewTab ? 'noopener noreferrer' : undefined}
              tabIndex={isActive ? 0 : -1}
              onMouseEnter={() => {
                preloadRoute('subject')
                preloadVideoPlayer()
              }}
              onFocus={() => {
                preloadRoute('subject')
                preloadVideoPlayer()
              }}
              className="relative block h-full w-full overflow-hidden"
            >
              {/* 高清海报大图（锚点偏上聚焦人脸） */}
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={title}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="h-full w-full object-cover object-[center_28%] transition-transform duration-700 ease-out group-hover:scale-103"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--kz-bg-soft)] text-sm text-[var(--kz-fg-dim)]">
                  暂无封面
                </div>
              )}

              {/* 底部与四周暗色渐变遮罩 */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
            </Link>
          </div>
        )
      })}

      {/* 2. 顶层持久化信息面板：独立于 700ms 图片透明度图层，彻底消除父级透明度渐变引起的毛玻璃着色器闪烁 */}
      {currentSlide && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
          style={{
            paddingLeft: 'clamp(12px, 3.8cqw, 24px)',
            paddingRight: 'clamp(12px, 3.8cqw, 24px)',
            paddingTop: 'clamp(12px, 3.8cqw, 24px)',
            paddingBottom: 'clamp(12px, 3.8cqw, 24px)',
          }}
        >
          {/*
            为什么使用 Grid 单单元格堆叠 (col-start-1 row-start-1) 且不加 mode="wait"：
            如果使用 mode="wait"，旧标题/胶囊退场完毕前新内容完全不渲染，会导致中间出现 ~200ms 的文字空白闪烁；
            通过单单元格堆叠，退场与进场动画重叠进行（Crossfade 原地平滑交叉淡化），彻底消除内容断档感。
          */}
          <div className="grid grid-cols-1 grid-rows-1">
            <AnimatePresence initial={false}>
              <motion.div
                key={
                  currentSlide.kind === 'highlight'
                    ? `ad-${currentSlide.item.id}`
                    : `anime-${currentSlide.item.id}`
                }
                initial={isReducedMotion ? false : { opacity: 0, y: 3 }}
                animate={isReducedMotion ? undefined : { opacity: 1, y: 0 }}
                exit={isReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="col-start-1 row-start-1 flex flex-col [transform:translateZ(0)] [backface-visibility:hidden]"
                style={{ gap: 'clamp(3px, 1cqw, 6px)' }}
              >
              {currentSlide.kind === 'highlight' ? (
                <>
                  {/* 副标题 / 描述在前 */}
                  {currentSlide.item.subtitle && (
                    <p
                      className="text-white/80 line-clamp-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                      style={{ fontSize: 'clamp(11px, 2.6cqw, 13px)' }}
                    >
                      {currentSlide.item.subtitle}
                    </p>
                  )}
                  {/* 标题在后（下方，右侧预留空间避让指示点） */}
                  {currentSlide.item.title && (
                    <h3
                      className="font-black text-white tracking-wide truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] pr-20 sm:pr-24"
                      style={{
                        fontSize: 'clamp(15px, 4.2cqw, 24px)',
                        lineHeight: 1.2,
                      }}
                    >
                      {currentSlide.item.title}
                    </h3>
                  )}
                </>
              ) : (
                <>
                  {/* 推荐理由 / 描述在前（上方），拥有整行宽度无任何遮挡 */}
                  {displayReason && (
                    <p
                      className="flex items-center text-white/85 line-clamp-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                      style={{
                        fontSize: 'clamp(11px, 2.6cqw, 13px)',
                        gap: 'clamp(4px, 1cqw, 6px)',
                      }}
                    >
                      <SparklesIcon
                        className="text-amber-400 shrink-0"
                        style={{
                          width: 'clamp(11px, 2.6cqw, 14px)',
                          height: 'clamp(11px, 2.6cqw, 14px)',
                        }}
                      />
                      <span className="truncate">{displayReason}</span>
                    </p>
                  )}

                  {/* 番剧标题在后（下方），右侧预留 pr-20 避让指示点 */}
                  <h3
                    className="font-black text-white tracking-wide truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] pr-20 sm:pr-24"
                    style={{
                      fontSize: 'clamp(15px, 4.2cqw, 24px)',
                      lineHeight: 1.2,
                    }}
                  >
                    {currentSlide.item.nameCn || currentSlide.item.name}
                  </h3>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    )}

      {/* 左右翻页按钮（B站方圆角半透明风格，位于左右两侧垂直居中） */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              prevSlide()
            }}
            aria-label="上一张"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm opacity-0 transition-all duration-200 hover:bg-white/30 active:scale-95 group-hover:opacity-100"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              nextSlide()
            }}
            aria-label="下一张"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm opacity-0 transition-all duration-200 hover:bg-white/30 active:scale-95 group-hover:opacity-100"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </>
      )}

      {/* 底部右侧精致胶囊指示条 */}
      {count > 1 && (
        <div
          className="absolute z-20 flex items-center gap-1.5"
          style={{
            bottom: 'clamp(17px, 4.4cqw, 32px)',
            right: 'clamp(12px, 3.8cqw, 24px)',
          }}
        >
          {slides.map((_, idx) => {
            const isActive = idx === currentIndex
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setCurrentIndex(idx)
                }}
                aria-label={`切换到第 ${idx + 1} 张`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isActive ? 'w-6 bg-white shadow-sm' : 'w-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
})
