import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { BangumiItem } from '@animaku/shared'
import {
  coverOf,
  extractBangumiSeed,
  bangumiImageUrl,
  DEFAULT_BANGUMI_IMAGE_HOST,
} from '@animaku/shared'
import { useSettingsStore } from '../../stores/settings'
import { preloadVideoPlayer } from '../../player/lazy'
import { preloadRoute } from '../../lib/route-preload'

interface HomeHeroBannerProps {
  items: BangumiItem[]
  autoPlayInterval?: number
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

export const HomeHeroBanner = memo(function HomeHeroBanner({
  items,
  autoPlayInterval = 5000,
}: HomeHeroBannerProps) {
  const host =
    useSettingsStore((s) => s.bangumiImageHost) || DEFAULT_BANGUMI_IMAGE_HOST
  const openInNewTab = useSettingsStore((s) => s.nav.openInNewTab)

  const bannerItems = useMemo(() => items.slice(0, 6), [items])
  const count = bannerItems.length

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

  const activeItem = bannerItems[currentIndex]
  const activeSeed = extractBangumiSeed(activeItem)

  return (
    <div
      className="group relative h-full w-full select-none overflow-hidden rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-xs"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 轮播卡片集合 */}
      {bannerItems.map((item, index) => {
        const isActive = index === currentIndex
        const coverUrl = resolveImageUrl(coverOf(item, 'large'))
        const title = item.nameCn || item.name
        const score =
          item.ratingScore > 0 ? item.ratingScore.toFixed(1) : null
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

              {/* 底部与四周暗色渐变遮罩，确保文字在任何亮暗画面下均绝对清晰 */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

              {/* 仅保留：评分标签 + 番剧名称（极简克制，不繁杂） */}
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex flex-col gap-2 z-20">
                {score && (
                  <div className="flex items-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-bold text-white border border-white/20 backdrop-blur-md shadow-xs">
                      <span className="text-amber-400 text-[13px]">★</span> {score} 分
                    </span>
                  </div>
                )}
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-wide truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
                  {title}
                </h3>
              </div>
            </Link>
          </div>
        )
      })}

      {/* 左右翻页箭头（悬停浮现） */}
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
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md opacity-0 transition-all duration-200 hover:scale-110 hover:bg-black/70 group-hover:opacity-100"
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
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md opacity-0 transition-all duration-200 hover:scale-110 hover:bg-black/70 group-hover:opacity-100"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </>
      )}

      {/* 底部右侧精致胶囊指示条 */}
      {count > 1 && (
        <div className="absolute bottom-5 right-5 z-20 flex items-center gap-1.5">
          {bannerItems.map((_, idx) => {
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
                aria-label={`切换到第 ${idx + 1} 张轮播`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isActive
                    ? 'w-6 bg-white shadow-xs'
                    : 'w-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
})
