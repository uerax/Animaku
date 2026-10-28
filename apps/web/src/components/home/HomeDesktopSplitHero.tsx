import { memo } from 'react'
import type { BangumiItem } from '@animaku/shared'
import { HomeHeroBanner } from './HomeHeroBanner'
import { DailyScheduleHeroCard } from './DailyScheduleHeroCard'

interface HomeDesktopSplitHeroProps {
  items: BangumiItem[]
}

export const HomeDesktopSplitHero = memo(function HomeDesktopSplitHero({
  items,
}: HomeDesktopSplitHeroProps) {
  return (
    <div className="flex h-[400px] w-full gap-4 items-stretch">
      {/* 左侧：精选推荐轮播 Banner（flex: 5，占比约 45%） */}
      <div className="flex-[5] min-w-0 h-full">
        <HomeHeroBanner items={items} />
      </div>

      {/* 右侧：每日放送 6 宫格矩阵（flex: 6，占比约 55%） */}
      <div className="flex-[6] min-w-0 h-full">
        <DailyScheduleHeroCard />
      </div>
    </div>
  )
})

export const HomeDesktopSplitHeroSkeleton = memo(function HomeDesktopSplitHeroSkeleton() {
  return (
    <div className="flex h-[400px] w-full gap-4 items-stretch">
      {/* 左侧轮播骨架屏 */}
      <div className="flex-[5] min-w-0 h-full">
        <div className="kz-skeleton h-full w-full rounded-2xl" />
      </div>

      {/* 右侧 6 宫格骨架屏（无外层容器，底边 100% 对齐） */}
      <div className="flex-[6] min-w-0 h-full flex flex-col">
        {/* 头部骨架 */}
        <div className="flex items-center justify-between shrink-0 h-9 mb-2 px-3 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]">
          <div className="kz-skeleton h-4.5 w-36 rounded-md" />
          <div className="kz-skeleton h-4.5 w-24 rounded-md" />
        </div>

        {/* 6 宫格骨架 */}
        <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kz-skeleton h-full w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
})
