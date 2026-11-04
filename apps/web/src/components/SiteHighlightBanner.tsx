import { memo } from 'react'
import type { HighlightItem, HighlightPlacement } from '@animaku/shared'
import { usePlacementHighlight } from '../lib/highlights'

interface BannerCardProps {
  item: HighlightItem
  isDouble?: boolean
}

const BannerCard = memo(function BannerCard({ item, isDouble = false }: BannerCardProps) {
  const hasBadge = Boolean(item.badge && item.badge.trim())

  return (
    <a
      href={item.linkUrl}
      target={item.target || '_blank'}
      rel="noopener noreferrer sponsored"
      title={item.title}
      className={`group relative block w-full overflow-hidden rounded-xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-soft)] shadow-xs transition-all duration-300 hover:border-[var(--kz-accent)]/60 hover:shadow-md ${
        isDouble
          ? 'h-14 sm:h-19 lg:h-20' // 双条模式：移动端 56px，桌面端 80px
          : 'h-16 sm:h-20 lg:h-22' // 单条模式：移动端 64px，桌面端 88px
      }`}
    >
      {/* 满幅全屏图片：object-cover 100% 满铺，杜绝留白黑边，与番剧卡片视觉清晰区隔 */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.title || '运营推荐'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-102"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--kz-bg-elevated)] text-xs text-[var(--kz-fg-muted)]">
          {item.title}
        </div>
      )}

      {/* 右上角精致胶囊角标 */}
      {hasBadge && (
        <div className="absolute right-2 top-2 z-10">
          <span className="inline-flex items-center rounded-md border border-white/15 bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs backdrop-blur-xs">
            {item.badge}
          </span>
        </div>
      )}

      {/* 底部微弱暗色遮罩与标题 (若有标题展示，轻量文字阴影) */}
      {item.title && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-2.5 py-1">
            <p className="truncate text-[11px] sm:text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {item.title}
              {item.subtitle && (
                <span className="ml-1.5 font-normal text-white/80 hidden sm:inline">
                  · {item.subtitle}
                </span>
              )}
            </p>
          </div>
        </>
      )}
    </a>
  )
})

export interface SiteHighlightBannerProps {
  placement: HighlightPlacement
  className?: string
}

/**
 * 通用横幅展位组件：
 * - 自动按 placement 读取激活配置；
 * - 若未配置或为空，直接返回 null，100% 零占位零留白；
 * - 单条 (single)：展示 1 张通栏横条；
 * - 双条 (double)：PC 端并排 2 列各 50%，手机端上下垂直堆叠。
 */
export const SiteHighlightBanner = memo(function SiteHighlightBanner({
  placement,
  className = '',
}: SiteHighlightBannerProps) {
  const config = usePlacementHighlight(placement)

  if (!config || !Array.isArray(config.items) || config.items.length === 0) {
    return null
  }

  const isDouble = config.layout === 'double' && config.items.length >= 2
  const displayItems = isDouble ? config.items.slice(0, 2) : config.items.slice(0, 1)

  return (
    <div
      className={`w-full min-w-0 transition-opacity duration-300 ${
        isDouble ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3' : 'block'
      } ${className}`}
    >
      {displayItems.map((item) => (
        <BannerCard key={item.id} item={item} isDouble={isDouble} />
      ))}
    </div>
  )
})
