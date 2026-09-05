import { memo, useState, useEffect } from 'react'
import {
  HERO_STAGE_CONTAINER_CLASS,
  HERO_SECTION_WRAPPER_CLASS,
  HERO_CARD_DIMENSIONS_CLASS,
  HERO_PERSPECTIVE,
  HERO_SKELETON_OFFSETS,
  DESKTOP_MEDIA_QUERY,
  getHeroCardTransformStyle,
} from './hero-cover-flow.constants'

/**
 * 热门聚焦 1:1 拟真 3D 骨架屏组件
 * 严格对齐 HeroCoverFlow 的舞台尺寸、3D 透视深度与卡片几何排列，
 * 消除首屏白屏，实现零布局抖动（CLS = 0）的平滑加载体验。
 */
export const HeroCoverFlowSkeleton = memo(function HeroCoverFlowSkeleton() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    setIsDesktop(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div
      className={HERO_SECTION_WRAPPER_CLASS}
      aria-busy="true"
      aria-label="热门聚焦动画推荐加载中"
    >
      {/* 顶部与底部无缝羽化渐变遮罩 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-[var(--kz-bg)] to-transparent sm:h-24"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-[var(--kz-bg)] to-transparent sm:h-24"
        aria-hidden="true"
      />

      {/* 3D 舞台容器 */}
      <div
        className={HERO_STAGE_CONTAINER_CLASS}
        style={{
          perspective: isDesktop
            ? HERO_PERSPECTIVE.desktop
            : HERO_PERSPECTIVE.mobile,
        }}
      >
        {HERO_SKELETON_OFFSETS.map((offset) => {
          const isCenter = offset === 0
          const transformStyle = getHeroCardTransformStyle(offset, isDesktop)

          return (
            <div
              key={offset}
              style={transformStyle}
              className={`${HERO_CARD_DIMENSIONS_CLASS} pointer-events-none ${
                isCenter
                  ? 'ring-2 ring-[var(--kz-accent)]/40 ring-offset-2 ring-offset-[var(--kz-bg)] shadow-2xl'
                  : ''
              }`}
            >
              <div className="relative h-full w-full select-none overflow-hidden rounded-[inherit] [isolation:isolate] [transform:translateZ(0)]">
                {/* 骨架微光背景 */}
                <div className="kz-skeleton h-full w-full rounded-[inherit]" />

                {/* 海报光影渐变遮罩 */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent rounded-[inherit]" />

                {/* 中央主卡片右下角模拟评分徽标 */}
                {isCenter && (
                  <div className="absolute right-3 bottom-2.5 sm:right-4 sm:bottom-3.5">
                    <div className="h-5 w-10 sm:h-7 sm:w-12 rounded-md bg-white/15 backdrop-blur-xs" />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* 导航箭头占位（仅桌面端展示，与真机一致） */}
        <div
          className="pointer-events-none absolute left-1 z-40 hidden sm:flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-black/20 text-white/30 backdrop-blur-md sm:left-4 sm:h-12 sm:w-12 md:left-6"
          aria-hidden="true"
        >
          <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-white/15" />
        </div>
        <div
          className="pointer-events-none absolute right-1 z-40 hidden sm:flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-black/20 text-white/30 backdrop-blur-md sm:right-4 sm:h-12 sm:w-12 md:right-6"
          aria-hidden="true"
        >
          <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-white/15" />
        </div>
      </div>

      {/* 底部元信息面板骨架 */}
      <div className="mt-8 text-center sm:mt-11 md:mt-14" aria-hidden="true">
        {/* 胶囊标签骨架（评分与在看人数） */}
        <div className="flex items-center justify-center gap-2 sm:gap-2.5">
          <div className="kz-skeleton h-6 w-20 rounded-full" />
          <div className="kz-skeleton h-6 w-24 rounded-full" />
        </div>

        {/* 主标题骨架 */}
        <div className="kz-skeleton mx-auto mt-3 h-7 w-48 rounded-lg sm:h-8 sm:w-64 md:h-9 md:w-80" />

        {/* 副标题骨架 */}
        <div className="kz-skeleton mx-auto mt-2 h-4 w-32 rounded-md opacity-70 sm:w-44" />

        {/* 分页指示器骨架（10 项，首项高亮激活态） */}
        <div className="mt-4 flex items-center justify-center gap-2 sm:mt-5">
          <div className="h-1.5 w-7 rounded-full bg-[var(--kz-accent)]/50 shadow-xs" />
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 w-2 rounded-full bg-[var(--kz-border)]"
            />
          ))}
        </div>
      </div>
    </div>
  )
})
