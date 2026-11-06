import { memo } from 'react'
import type { BangumiItem, RecommendItem } from '@animaku/shared'
import { HomeHeroBanner } from './HomeHeroBanner'
import { DailyScheduleHeroCard } from './DailyScheduleHeroCard'

interface HomeDesktopSplitHeroProps {
  items: BangumiItem[]
  recommendations?: RecommendItem[]
}

export const HomeDesktopSplitHero = memo(function HomeDesktopSplitHero({
  items,
  recommendations,
}: HomeDesktopSplitHeroProps) {
  return (
    <div className="flex w-full gap-4 items-start">
      {/* 左侧：精选推荐轮播 Banner（黄金比例 0.382，B 站 1274/884 比例自撑高度） */}
      <div className="w-[38.2%] aspect-[1274/884] shrink-0">
        <HomeHeroBanner items={items} recommendations={recommendations} />
      </div>

      {/* 右侧：每日放送 6 宫格矩阵（黄金比例 0.618，16:10.3 双排等高紧凑排布） */}
      <div className="relative flex-1 min-w-0">
        <DailyScheduleHeroCard />
      </div>
    </div>
  )
})

export const HomeDesktopSplitHeroSkeleton = memo(function HomeDesktopSplitHeroSkeleton() {
  return (
    <div className="flex w-full gap-4 items-start">
      {/* 左侧轮播骨架屏（黄金比例 0.382，B 站 1274/884 比例） */}
      <div className="w-[38.2%] aspect-[1274/884] shrink-0">
        <div className="kz-skeleton h-full w-full rounded-2xl" />
      </div>

      {/* 右侧 6 宫格骨架屏（黄金比例 0.618，16:10.3 紧凑比例，按钮外挂到右侧空白边缘） */}
      <div className="relative flex-1 min-w-0">
        {/* 6 宫格骨架 */}
        <div className="grid w-full grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kz-skeleton aspect-[16/10.3] w-full rounded-xl" />
          ))}
        </div>

        {/* 右侧空白边缘操作按钮骨架 */}
        <div className="absolute left-[calc(100%+12px)] top-0 z-20">
          <div className="kz-skeleton h-10 w-10 rounded-xl" />
        </div>
      </div>
    </div>
  )
})
