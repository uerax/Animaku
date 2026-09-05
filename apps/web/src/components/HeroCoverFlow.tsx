import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { BangumiItem } from '@animaku/shared'
import {
  coverOf,
  formatDoingCount,
  bangumiImageUrl,
  toBangumiOfficialImageUrl,
  DEFAULT_BANGUMI_IMAGE_HOST,
} from '@animaku/shared'
import { useSettingsStore } from '../stores/settings'
import { preloadVideoPlayer } from '../player/lazy'

interface HeroCoverFlowProps {
  items: BangumiItem[]
  limit?: number
}

function escapeJsonLdScript(jsonStr: string): string {
  return jsonStr.replace(/<\/script/gi, '<\\/script')
}

function IconChevronLeft({ className = 'w-5 h-5' }: { className?: string }) {
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

function IconChevronRight({ className = 'w-5 h-5' }: { className?: string }) {
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

export const HeroCoverFlow = memo(function HeroCoverFlow({
  items,
  limit = 5,
}: HeroCoverFlowProps) {
  const host =
    useSettingsStore((s) => s.bangumiImageHost) || DEFAULT_BANGUMI_IMAGE_HOST

  const resolveImageUrl = useCallback(
    (rawSrc?: string | null) => {
      if (!rawSrc) return ''
      return bangumiImageUrl(rawSrc, host)
    },
    [host],
  )

  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false,
  )

  const displayItems = useMemo(() => {
    const targetLimit = isDesktop ? Math.min(limit, 7) : 5
    return items.slice(0, targetLimit)
  }, [items, limit, isDesktop])
  const count = displayItems.length

  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [bgImgError, setBgImgError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevOffsetsRef = useRef<Record<string | number, number>>({})

  // Touch gesture and dragging state refs
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchDeltaX = useRef<number>(0)
  const touchDeltaY = useRef<number>(0)
  const isSwipingHorizontal = useRef<boolean | null>(null)
  const isDragging = useRef<boolean>(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    setIsDesktop(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Ensure activeIndex is within range when display count changes
  useEffect(() => {
    if (count > 0 && activeIndex >= count) {
      setActiveIndex(0)
    }
  }, [count, activeIndex])

  const activeItem = displayItems[activeIndex] ?? displayItems[0]

  const nextSlide = useCallback(() => {
    if (count <= 1) return
    setActiveIndex((prev) => (prev + 1) % count)
  }, [count])

  const prevSlide = useCallback(() => {
    if (count <= 1) return
    setActiveIndex((prev) => (prev - 1 + count) % count)
  }, [count])

  // Auto-play timer (6s), respects page visibility to prevent background drain
  useEffect(() => {
    if (isPaused || count <= 1) return
    let timer: ReturnType<typeof setInterval> | null = null

    const startTimer = () => {
      if (timer) clearInterval(timer)
      if (typeof document !== 'undefined' && document.hidden) return
      timer = setInterval(() => {
        nextSlide()
      }, 6000)
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        if (timer) clearInterval(timer)
        timer = null
      } else {
        startTimer()
      }
    }

    startTimer()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    return () => {
      if (timer) clearInterval(timer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [isPaused, count, nextSlide])

  // Keyboard navigation (scoped to visible viewport to prevent hijacking other controls)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return
      }
      // Check if carousel container is roughly visible within the viewport
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const isVisible =
          rect.bottom > 0 && rect.top < (window.innerHeight || 800)
        if (!isVisible) return
      }

      if (e.key === 'ArrowLeft') {
        prevSlide()
      } else if (e.key === 'ArrowRight') {
        nextSlide()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextSlide, prevSlide])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchDeltaX.current = 0
    touchDeltaY.current = 0
    isSwipingHorizontal.current = null
    isDragging.current = false
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    touchDeltaX.current = dx
    touchDeltaY.current = dy

    // Lock horizontal swipe only if horizontal movement clearly exceeds vertical scroll
    if (
      isSwipingHorizontal.current === null &&
      (Math.abs(dx) > 8 || Math.abs(dy) > 8)
    ) {
      isSwipingHorizontal.current = Math.abs(dx) > Math.abs(dy) * 1.3
    }

    if (Math.abs(dx) > 10) {
      isDragging.current = true
    }
  }

  const handleTouchEnd = () => {
    // Only trigger slide when gesture is confirmed horizontal and crosses threshold
    if (
      isSwipingHorizontal.current === true &&
      Math.abs(touchDeltaX.current) > 40 &&
      Math.abs(touchDeltaX.current) > Math.abs(touchDeltaY.current) * 1.3
    ) {
      if (touchDeltaX.current > 0) {
        prevSlide()
      } else {
        nextSlide()
      }
    }
    touchStartX.current = null
    touchStartY.current = null
    touchDeltaX.current = 0
    touchDeltaY.current = 0
    isSwipingHorizontal.current = null
    // Reset dragging flag on next tick to prevent accidental link clicks after swipe
    setTimeout(() => {
      isDragging.current = false
    }, 80)
  }

  if (!displayItems.length) return null

  // Calculate circular offset from active item (-2, -1, 0, 1, 2)
  const getOffset = (index: number) => {
    let diff = index - activeIndex
    if (diff > count / 2) diff -= count
    if (diff < -count / 2) diff += count
    return diff
  }

  const activeCoverUrl = activeItem
    ? resolveImageUrl(coverOf(activeItem, 'large'))
    : null
  const activeTitle = activeItem?.nameCn || activeItem?.name
  const activeScore =
    activeItem && activeItem.ratingScore > 0
      ? activeItem.ratingScore.toFixed(1)
      : null
  const activeDoing = activeItem ? formatDoingCount(activeItem.doing) : ''

  // Structured ItemList microdata for SEO & GEO (uses authoritative official image URLs)
  const heroJsonLd = useMemo(() => {
    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : ''
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: '热门聚焦动画推荐',
      itemListElement: displayItems.map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: item.nameCn || item.name,
        url: `${origin}/subject/${item.id}`,
        image: toBangumiOfficialImageUrl(coverOf(item, 'large')),
      })),
    }
  }, [displayItems])

  // Reset background error state when active cover changes
  useEffect(() => {
    setBgImgError(false)
  }, [activeCoverUrl])

  // Sync offsets after render to detect boundary jumps (flying cards)
  useEffect(() => {
    const nextOffsets: Record<string | number, number> = {}
    displayItems.forEach((item, idx) => {
      nextOffsets[item.id] = getOffset(idx)
    })
    prevOffsetsRef.current = nextOffsets
  })

  return (
    <div
      ref={containerRef}
      className="relative -mx-4 overflow-hidden px-4 pt-6 pb-6 sm:mx-0 sm:px-6 sm:pt-8 sm:pb-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Search Engine & Generative AI (GEO) structured metadata (XSS escaped) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: escapeJsonLdScript(JSON.stringify(heroJsonLd)),
        }}
      />

      {/* Top & Bottom seamless gradient blending to eliminate any hard background cut */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-[var(--kz-bg)] to-transparent sm:h-24"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-[var(--kz-bg)] to-transparent sm:h-24"
        aria-hidden="true"
      />

      {/* 1. Dynamic Ambient Background Glow with smooth mask dissipation */}
      {activeCoverUrl && !bgImgError && (
        <div
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden transition-all duration-700 ease-out"
          style={{
            maskImage:
              'linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)',
          }}
          aria-hidden="true"
        >
          <img
            src={activeCoverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBgImgError(true)}
            className="h-full w-full scale-135 object-cover opacity-20 blur-3xl filter transition-opacity duration-1000 dark:opacity-30"
          />
          {/* Gentle edge dissipation */}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--kz-bg)] via-transparent to-[var(--kz-bg)]" />
          <div className="absolute inset-0 bg-radial from-transparent via-[var(--kz-bg)]/40 to-[var(--kz-bg)]" />
        </div>
      )}

      {/* 2. Cover Flow 3D Stage Container (Balanced cinema stage for desktop, dialed back by ~1/9) */}
      <div
        className="relative mx-auto flex h-[270px] w-full items-center justify-center sm:h-[340px] md:h-[370px] lg:h-[390px] xl:h-[410px] max-w-5xl lg:max-w-6xl xl:max-w-[1360px] 2xl:max-w-[1480px]"
        style={{ perspective: isDesktop ? '1700px' : '1200px' }}
      >
        {displayItems.map((item, index) => {
          const offset = getOffset(index)
          const isCenter = offset === 0
          const cover = resolveImageUrl(coverOf(item, 'large'))
          const title = item.nameCn || item.name
          const score =
            item.ratingScore > 0 ? item.ratingScore.toFixed(1) : null

          // Detect circular boundary leap (-3 <-> +3 or -2 <-> +2) to disable transition and prevent flying cards across center
          const prevOffset = prevOffsetsRef.current[item.id]
          const isJumpingBoundary =
            prevOffset !== undefined &&
            Math.abs(offset - prevOffset) > count / 2

          // Pure GPU composited transform & opacity: 0 dynamic blur rasterization overhead
          let style: React.CSSProperties = {
            transition: isJumpingBoundary
              ? 'none'
              : 'transform 520ms cubic-bezier(0.16, 1, 0.3, 1), opacity 520ms cubic-bezier(0.16, 1, 0.3, 1)',
          }

          if (isCenter) {
            style = {
              ...style,
              transform: 'translateX(0%) scale(1.08) translateZ(48px)',
              zIndex: 30,
              opacity: 1,
            }
          } else if (isDesktop) {
            // Desktop: 7 cards with calibrated 8/9 offset scale for balanced breathing room
            if (offset === -1) {
              style = {
                ...style,
                transform:
                  'translateX(-90%) scale(0.90) rotateY(15deg) translateZ(10px)',
                zIndex: 22,
                opacity: 0.88,
              }
            } else if (offset === 1) {
              style = {
                ...style,
                transform:
                  'translateX(90%) scale(0.90) rotateY(-15deg) translateZ(10px)',
                zIndex: 22,
                opacity: 0.88,
              }
            } else if (offset === -2) {
              style = {
                ...style,
                transform:
                  'translateX(-176%) scale(0.76) rotateY(25deg) translateZ(-35px)',
                zIndex: 15,
                opacity: 0.62,
              }
            } else if (offset === 2) {
              style = {
                ...style,
                transform:
                  'translateX(176%) scale(0.76) rotateY(-25deg) translateZ(-35px)',
                zIndex: 15,
                opacity: 0.62,
              }
            } else if (offset === -3) {
              style = {
                ...style,
                transform:
                  'translateX(-256%) scale(0.64) rotateY(33deg) translateZ(-75px)',
                zIndex: 8,
                opacity: isJumpingBoundary ? 0 : 0.36,
              }
            } else if (offset === 3) {
              style = {
                ...style,
                transform:
                  'translateX(256%) scale(0.64) rotateY(-33deg) translateZ(-75px)',
                zIndex: 8,
                opacity: isJumpingBoundary ? 0 : 0.36,
              }
            } else {
              style = {
                ...style,
                transform: 'translateX(0%) scale(0.4)',
                zIndex: 0,
                opacity: 0,
                pointerEvents: 'none',
              }
            }
          } else {
            // Mobile: 5 cards preserved with compact, ergonomic stage
            if (offset === -1) {
              style = {
                ...style,
                transform:
                  'translateX(-58%) scale(0.86) rotateY(16deg) translateZ(0px)',
                zIndex: 20,
                opacity: 0.65,
              }
            } else if (offset === 1) {
              style = {
                ...style,
                transform:
                  'translateX(58%) scale(0.86) rotateY(-16deg) translateZ(0px)',
                zIndex: 20,
                opacity: 0.65,
              }
            } else if (offset === -2) {
              style = {
                ...style,
                transform:
                  'translateX(-108%) scale(0.72) rotateY(26deg) translateZ(-40px)',
                zIndex: 10,
                opacity: isJumpingBoundary ? 0 : 0.32,
              }
            } else if (offset === 2) {
              style = {
                ...style,
                transform:
                  'translateX(108%) scale(0.72) rotateY(-26deg) translateZ(-40px)',
                zIndex: 10,
                opacity: isJumpingBoundary ? 0 : 0.32,
              }
            } else {
              style = {
                ...style,
                transform: 'translateX(0%) scale(0.5)',
                zIndex: 0,
                opacity: 0,
                pointerEvents: 'none',
              }
            }
          }

          return (
            <div
              key={item.id}
              onClick={() => {
                if (isDragging.current) return
                if (!isCenter) {
                  setActiveIndex(index)
                }
              }}
              style={style}
              className={`absolute top-3 bottom-3 sm:top-4 sm:bottom-4 flex aspect-[2/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl sm:rounded-3xl shadow-xl transition-all ${
                isCenter
                  ? 'ring-2 ring-[var(--kz-accent)]/70 ring-offset-2 ring-offset-[var(--kz-bg)] shadow-2xl cursor-pointer'
                  : 'hover:opacity-90'
              }`}
            >
              <Link
                to={`/subject/${item.id}`}
                tabIndex={isCenter ? 0 : -1}
                onClick={(e) => {
                  if (isDragging.current) {
                    e.preventDefault()
                    return
                  }
                  if (!isCenter) {
                    e.preventDefault()
                    setActiveIndex(index)
                  }
                }}
                onMouseEnter={preloadVideoPlayer}
                onFocus={preloadVideoPlayer}
                onTouchStart={preloadVideoPlayer}
                className="group relative h-full w-full select-none overflow-hidden"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt={title}
                    loading={index < 3 ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : null}
                <div
                  className="absolute inset-0 -z-10 flex items-center justify-center bg-[var(--kz-bg-soft)] text-xs text-[var(--kz-fg-dim)]"
                  aria-hidden="true"
                >
                  无封面
                </div>

                {/* Hidden semantic text for SEO crawlers and screen readers */}
                <span className="sr-only">{title}</span>

                {/* Poster dark bottom gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Score (Bottom-right) */}
                {score && (
                  <div className="absolute right-3 bottom-2.5 sm:right-4 sm:bottom-3.5">
                    <span className="font-black italic text-lg tracking-tight text-white tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] sm:text-2xl md:text-3xl">
                      {score}
                    </span>
                  </div>
                )}
              </Link>
            </div>
          )
        })}

        {/* Navigation Arrows (Desktop/Tablet) */}
        <button
          type="button"
          onClick={prevSlide}
          aria-label="上一部番剧"
          className="absolute left-1 z-40 hidden sm:flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-black/70 sm:left-4 sm:h-12 sm:w-12 md:left-6"
        >
          <IconChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <button
          type="button"
          onClick={nextSlide}
          aria-label="下一部番剧"
          className="absolute right-1 z-40 hidden sm:flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-black/70 sm:right-4 sm:h-12 sm:w-12 md:right-6"
        >
          <IconChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      {/* 3. Active Anime Spotlight Meta Info Panel (Comfortable breathing gap) */}
      {activeItem && (
        <div className="mt-8 text-center sm:mt-11 md:mt-14">
          {/* Badges / Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
            {activeScore && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white border border-white/15 backdrop-blur-md shadow-xs">
                <span className="text-amber-400 text-[13px]">★</span> {activeScore} 分
              </span>
            )}
            {activeDoing && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--kz-bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--kz-fg-muted)] border border-[var(--kz-border)] backdrop-blur-md shadow-xs">
                <span className="font-bold tabular-nums text-amber-500 dark:text-amber-400">{activeDoing}</span> 人在看
              </span>
            )}
          </div>

          {/* Title - clickable direct to subject */}
          <h3 className="mt-3">
            <Link
              to={`/subject/${activeItem.id}`}
              onMouseEnter={preloadVideoPlayer}
              className="inline-block truncate text-xl font-black text-[var(--kz-fg)] transition-colors hover:text-[var(--kz-accent)] sm:text-2xl md:text-3xl"
            >
              {activeTitle}
            </Link>
          </h3>
          {activeItem.name && activeItem.name !== activeTitle && (
            <p className="mt-0.5 truncate text-xs text-[var(--kz-fg-dim)] sm:text-sm">
              {activeItem.name}
            </p>
          )}

          {/* 4. Pagination Segmented Indicators */}
          <div className="mt-4 flex items-center justify-center gap-2 sm:mt-5">
            {displayItems.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`切换到第 ${idx + 1} 部番剧`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === activeIndex
                    ? 'w-7 bg-[var(--kz-accent)] shadow-sm'
                    : 'w-2 bg-[var(--kz-border)] hover:bg-[var(--kz-fg-muted)]'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
