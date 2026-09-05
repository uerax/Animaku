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
  limit = 10,
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
    // 统一保留 10 项缓冲池（桌面可见 7 项，移动可见 5 项，均具备充裕的两翼与离屏环转缓冲）
    const targetLimit = Math.min(limit, 10)
    return items.slice(0, targetLimit)
  }, [items, limit])
  const count = displayItems.length

  const [activeIndex, setActiveIndex] = useState(0)
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  const [isAccelerating, setIsAccelerating] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [bgImgError, setBgImgError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevOffsetsRef = useRef<Record<string | number, number>>({})
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Touch gesture and dragging state refs
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchDeltaX = useRef<number>(0)
  const touchDeltaY = useRef<number>(0)
  const isSwipingHorizontal = useRef<boolean | null>(null)
  const isDragging = useRef<boolean>(false)
  const lastSlideTimeRef = useRef<number>(0)

  // 组件卸载时清理所有定时器
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current)
      }
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current)
      }
      if (dragResetTimerRef.current) {
        clearTimeout(dragResetTimerRef.current)
      }
    }
  }, [])

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

  const moveLeftRef = useRef<() => void>(() => {})

  // 自动播放调度器：每次用户主动操作（点击卡片/按钮/手势翻页）时重置 6 秒倒计时，杜绝刚刚翻页就被自动跳页打断
  const restartAutoPlayTimer = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current)
      autoPlayTimerRef.current = null
    }
    if (isPaused || count <= 1) return
    if (typeof document !== 'undefined' && document.hidden) return
    autoPlayTimerRef.current = setTimeout(() => {
      moveLeftRef.current()
      restartAutoPlayTimer()
    }, 6000)
  }, [isPaused, count])

  // 舞台整体向左移动（卡片向左平移流动，右侧卡片滑入）
  const moveLeft = useCallback(() => {
    if (count <= 1) return
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    setIsAccelerating(false)
    const now = Date.now()
    if (now - lastSlideTimeRef.current < 200) return
    lastSlideTimeRef.current = now
    restartAutoPlayTimer()
    // activeIndex + 1 会使所有卡片 offset 减 1，X 轴整体向左平移
    setActiveIndex((prev) => {
      const next = (prev + 1) % count
      activeIndexRef.current = next
      return next
    })
  }, [count, restartAutoPlayTimer])

  // 舞台整体向右移动（卡片向右平移流动，左侧卡片滑入）
  const moveRight = useCallback(() => {
    if (count <= 1) return
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    setIsAccelerating(false)
    const now = Date.now()
    if (now - lastSlideTimeRef.current < 200) return
    lastSlideTimeRef.current = now
    restartAutoPlayTimer()
    // activeIndex - 1 会使所有卡片 offset 加 1，X 轴整体向右平移
    setActiveIndex((prev) => {
      const next = (prev - 1 + count) % count
      activeIndexRef.current = next
      return next
    })
  }, [count, restartAutoPlayTimer])

  moveLeftRef.current = moveLeft

  // 平滑步进导航调度器：无论跨越多少张牌，均在最短环形路径上物理连续流动
  // 点击第 2/3 张或远端指示器时启动极速连滚并在终点减速刹停，手感迅猛流畅
  const slideTo = useCallback(
    (targetIndex: number) => {
      if (count <= 1) return
      const now = Date.now()
      if (now - lastSlideTimeRef.current < 160) return
      lastSlideTimeRef.current = now
      restartAutoPlayTimer()

      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current)
        stepTimerRef.current = null
      }

      const current = activeIndexRef.current
      let diff = targetIndex - current
      if (diff > count / 2) diff -= count
      if (diff < -count / 2) diff += count

      if (diff === 0) return

      const steps = Math.abs(diff)
      const direction = diff > 0 ? 1 : -1

      // 仅移动 1 步：以标准 520ms 饱满缓动平稳切至中心
      if (steps === 1) {
        setIsAccelerating(false)
        setActiveIndex((prev) => {
          const next = (prev + direction + count) % count
          activeIndexRef.current = next
          return next
        })
        return
      }

      // 跨越 2 步或更多（如点击第 2、3 张或远端圆点）：
      // 启动高速加速滚盘动效（Accelerated Rapid Rolling），每步 50~88ms 极速掠过
      // 在到达最终目标步时平滑解开加速，以 520ms 饱满物理减速刹车落座，手感迅猛且轻盈
      setIsAccelerating(true)
      const stepInterval =
        steps === 2 ? 88 : steps === 3 ? 72 : Math.max(50, Math.floor(200 / steps))
      let remaining = steps

      const executeStep = () => {
        remaining--
        if (remaining === 0) {
          // 到达最后一步（终点）：平滑解开加速，进入 520ms 物理惯性减速刹停
          setIsAccelerating(false)
          setActiveIndex((prev) => {
            const next = (prev + direction + count) % count
            activeIndexRef.current = next
            return next
          })
        } else {
          // 飞跃中间步骤：保持 200ms 高速敏捷加速
          setActiveIndex((prev) => {
            const next = (prev + direction + count) % count
            activeIndexRef.current = next
            return next
          })
          stepTimerRef.current = setTimeout(executeStep, stepInterval)
        }
      }

      executeStep()
    },
    [count, restartAutoPlayTimer],
  )

  // Auto-play lifecycle (respects user interaction reset and tab visibility)
  useEffect(() => {
    restartAutoPlayTimer()

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        if (autoPlayTimerRef.current) {
          clearTimeout(autoPlayTimerRef.current)
          autoPlayTimerRef.current = null
        }
      } else {
        restartAutoPlayTimer()
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current)
        autoPlayTimerRef.current = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [restartAutoPlayTimer])

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
        moveLeft()
      } else if (e.key === 'ArrowRight') {
        moveRight()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [moveLeft, moveRight])

  const handleTouchStart = (e: React.TouchEvent) => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    if (dragResetTimerRef.current) {
      clearTimeout(dragResetTimerRef.current)
      dragResetTimerRef.current = null
    }
    setIsAccelerating(false)
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
      restartAutoPlayTimer()
      if (touchDeltaX.current > 0) {
        moveRight()
      } else {
        moveLeft()
      }
    }
    touchStartX.current = null
    touchStartY.current = null
    touchDeltaX.current = 0
    touchDeltaY.current = 0
    isSwipingHorizontal.current = null
    // Reset dragging flag with 180ms safety window via tracked timer to prevent accidental link clicks
    if (dragResetTimerRef.current) {
      clearTimeout(dragResetTimerRef.current)
    }
    dragResetTimerRef.current = setTimeout(() => {
      isDragging.current = false
      dragResetTimerRef.current = null
    }, 180)
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

  // 连滚加速期间保持 Meta 文本（标题、评分、在看人数）与环境光背景稳定，
  // 避免高频步进时文字疯狂抽搐与重复光栅化全屏模糊背景；
  // 采用 Ref 快照暂存，落座终点时天然直出，彻底消除多余的二次 React re-render 损耗
  const stableMetaRef = useRef(activeItem)
  const stableCoverRef = useRef(activeCoverUrl)

  if (!isAccelerating && activeItem) {
    stableMetaRef.current = activeItem
    stableCoverRef.current = activeCoverUrl
  }

  const metaItem = isAccelerating
    ? (stableMetaRef.current ?? activeItem)
    : activeItem
  const activeTitle = metaItem?.nameCn || metaItem?.name
  const activeScore =
    metaItem && metaItem.ratingScore > 0
      ? metaItem.ratingScore.toFixed(1)
      : null
  const activeDoing = metaItem ? formatDoingCount(metaItem.doing) : ''

  const ambientCoverUrl = isAccelerating
    ? (stableCoverRef.current ?? activeCoverUrl)
    : activeCoverUrl

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

  // Reset background error state when ambient cover changes
  useEffect(() => {
    setBgImgError(false)
  }, [ambientCoverUrl])

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
      className="relative -mx-4 overflow-hidden touch-pan-y px-4 pt-6 pb-6 sm:mx-0 sm:px-6 sm:pt-8 sm:pb-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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
      {ambientCoverUrl && !bgImgError && (
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
            src={ambientCoverUrl}
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
        style={{
          perspective: isDesktop ? '1700px' : '1200px',
        }}
      >
        {displayItems.map((item, index) => {
          const offset = getOffset(index)
          const isCenter = offset === 0
          const cover = resolveImageUrl(coverOf(item, 'large'))
          const title = item.nameCn || item.name
          const score =
            item.ratingScore > 0 ? item.ratingScore.toFixed(1) : null

          // Detect circular boundary leap on invisible backside to prevent flying cards across center
          const prevOffset = prevOffsetsRef.current[item.id]
          const isJumpingBoundary =
            prevOffset !== undefined &&
            Math.abs(offset - prevOffset) > count / 2

          // 连滚加速期采用 200ms 高频敏捷缓动，常规单步与最终刹车期采用 520ms 饱满物理减速
          const animDuration = isAccelerating ? '200ms' : '520ms'
          const animTimingFn = isAccelerating
            ? 'cubic-bezier(0.25, 0.9, 0.3, 1)'
            : 'cubic-bezier(0.16, 1, 0.3, 1)'

          // Pure GPU composited transform & opacity: 常驻 GPU 合成层，避免图层动态提升导致的微掉帧
          let style: React.CSSProperties = {
            willChange: 'transform, opacity',
            transition: isJumpingBoundary
              ? 'none'
              : `transform ${animDuration} ${animTimingFn}, opacity ${animDuration} ${animTimingFn}`,
          }

          if (isCenter) {
            style = {
              ...style,
              transform: 'translateX(0%) scale(1.08) translateZ(48px)',
              zIndex: 30,
              opacity: 1,
            }
          } else if (isDesktop) {
            // Desktop: 7 cards visible in stage + 2 buffer cards (offset ±4) for seamless fade-in/out
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
                opacity: 0.36,
              }
            } else if (offset === 3) {
              style = {
                ...style,
                transform:
                  'translateX(256%) scale(0.64) rotateY(-33deg) translateZ(-75px)',
                zIndex: 8,
                opacity: 0.36,
              }
            } else if (offset === -4) {
              // Desktop left entrance/exit buffer: completely transparent, provides seamless fade-in slide
              style = {
                ...style,
                transform:
                  'translateX(-326%) scale(0.50) rotateY(38deg) translateZ(-115px)',
                zIndex: 2,
                opacity: 0,
                pointerEvents: 'none',
              }
            } else if (offset === 4) {
              // Desktop right entrance/exit buffer: completely transparent, provides seamless fade-in slide
              style = {
                ...style,
                transform:
                  'translateX(326%) scale(0.50) rotateY(-38deg) translateZ(-115px)',
                zIndex: 2,
                opacity: 0,
                pointerEvents: 'none',
              }
            } else {
              // Cards in deep background
              style = {
                ...style,
                transform: 'translateX(0%) scale(0.3)',
                zIndex: 0,
                opacity: 0,
                pointerEvents: 'none',
              }
            }
          } else {
            // Mobile: 5 cards visible in stage + 2 buffer cards (offset ±3) for seamless fade-in/out
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
                opacity: 0.32,
              }
            } else if (offset === 2) {
              style = {
                ...style,
                transform:
                  'translateX(108%) scale(0.72) rotateY(-26deg) translateZ(-40px)',
                zIndex: 10,
                opacity: 0.32,
              }
            } else if (offset === -3) {
              // Mobile left entrance/exit buffer: completely transparent
              style = {
                ...style,
                transform:
                  'translateX(-158%) scale(0.58) rotateY(34deg) translateZ(-75px)',
                zIndex: 2,
                opacity: 0,
                pointerEvents: 'none',
              }
            } else if (offset === 3) {
              // Mobile right entrance/exit buffer: completely transparent
              style = {
                ...style,
                transform:
                  'translateX(158%) scale(0.58) rotateY(-34deg) translateZ(-75px)',
                zIndex: 2,
                opacity: 0,
                pointerEvents: 'none',
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
          }

          return (
            <div
              key={item.id}
              onClick={() => {
                if (isDragging.current || isAccelerating) return
                if (!isCenter) {
                  slideTo(index)
                }
              }}
              style={style}
              className={`absolute top-3 bottom-3 sm:top-4 sm:bottom-4 flex aspect-[2/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl sm:rounded-3xl shadow-xl ${
                isCenter
                  ? 'ring-2 ring-[var(--kz-accent)]/70 ring-offset-2 ring-offset-[var(--kz-bg)] shadow-2xl cursor-pointer'
                  : 'hover:opacity-90'
              }`}
            >
              <Link
                to={`/subject/${item.id}`}
                tabIndex={isCenter ? 0 : -1}
                onClick={(e) => {
                  if (isDragging.current || isAccelerating) {
                    e.preventDefault()
                    e.stopPropagation()
                    return
                  }
                  if (!isCenter) {
                    e.preventDefault()
                    e.stopPropagation()
                    slideTo(index)
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
                    loading="eager"
                    decoding="async"
                    fetchPriority={isCenter ? 'high' : 'auto'}
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
          onClick={moveLeft}
          aria-label="向左滚动"
          className="absolute left-1 z-40 hidden sm:flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-black/70 sm:left-4 sm:h-12 sm:w-12 md:left-6"
        >
          <IconChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <button
          type="button"
          onClick={moveRight}
          aria-label="向右滚动"
          className="absolute right-1 z-40 hidden sm:flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-all hover:scale-110 hover:bg-black/70 sm:right-4 sm:h-12 sm:w-12 md:right-6"
        >
          <IconChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      {/* 3. Active Anime Spotlight Meta Info Panel (Comfortable breathing gap) */}
      {metaItem && (
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
              to={`/subject/${metaItem.id}`}
              onMouseEnter={preloadVideoPlayer}
              className="inline-block truncate text-xl font-black text-[var(--kz-fg)] transition-colors hover:text-[var(--kz-accent)] sm:text-2xl md:text-3xl"
            >
              {activeTitle}
            </Link>
          </h3>
          {metaItem.name && metaItem.name !== activeTitle && (
            <p className="mt-0.5 truncate text-xs text-[var(--kz-fg-dim)] sm:text-sm">
              {metaItem.name}
            </p>
          )}

          {/* 4. Pagination Segmented Indicators */}
          <div className="mt-4 flex items-center justify-center gap-2 sm:mt-5">
            {displayItems.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => slideTo(idx)}
                aria-label={`切换到第 ${idx + 1} 部番剧`}
                className={`h-1.5 rounded-full ${
                  isAccelerating
                    ? 'transition-none'
                    : 'transition-all duration-300'
                } ${
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
