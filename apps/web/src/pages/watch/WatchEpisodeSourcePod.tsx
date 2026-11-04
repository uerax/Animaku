import type { ReactNode } from 'react'
import clsx from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'

export type WatchPodTab = 'episodes' | 'sources' | 'detail'

export interface WatchEpisodeSourcePodProps {
  activeTab: WatchPodTab
  onTabChange: (tab: WatchPodTab) => void
  episodesNode: ReactNode
  sourcesNode: ReactNode
  detailNode?: ReactNode
  totalEpisodes?: number
  playingEpisode?: number | null
  activePluginName?: string
  sourcesReadyCount?: number
  sourcesTotalCount?: number
  isAutoProbing?: boolean
}

/**
 * 选源/选集一体化融合舱 (Episode & Source Unified Pod)
 *
 * 借鉴 zakoway 的 Pod 布局规范：
 * - 顶部为 iOS / M3 质感的平滑切换药丸，点击哪个显示哪个；
 * - 隐藏多余的重叠边框与折叠头，保持 DOM 常驻显隐，杜绝反复发请求；
 * - 兼顾桌面侧栏 (Rail) 与移动端流式布局。
 */
export function WatchEpisodeSourcePod({
  activeTab,
  onTabChange,
  episodesNode,
  sourcesNode,
  detailNode,
  totalEpisodes,
  playingEpisode,
  activePluginName,
  sourcesReadyCount,
  sourcesTotalCount,
  isAutoProbing = false,
}: WatchEpisodeSourcePodProps) {
  // Episode badge label (e.g. "1/12" or "全12话")
  const epBadge =
    typeof playingEpisode === 'number' && playingEpisode > 0
      ? totalEpisodes && totalEpisodes > 0
        ? `${playingEpisode}/${totalEpisodes}`
        : `第${playingEpisode}集`
      : totalEpisodes && totalEpisodes > 0
        ? `全${totalEpisodes}话`
        : null

  // Source badge label (e.g. "樱花" or "6/9")
  const sourceBadge =
    activePluginName ||
    (sourcesReadyCount !== undefined && sourcesTotalCount !== undefined
      ? `${sourcesReadyCount}/${sourcesTotalCount}`
      : null)

  const isReducedMotion = useReducedMotion()

  // 选集药丸按钮
  const episodesPill = (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === 'episodes'}
      onClick={() => onTabChange('episodes')}
      className={clsx(
        'group relative flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs transition-colors duration-200 select-none cursor-pointer',
        activeTab === 'episodes'
          ? 'text-[var(--kz-fg)] font-semibold'
          : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]',
      )}
    >
      {activeTab === 'episodes' && (
        <motion.span
          layoutId="active-pod-pill"
          className="absolute inset-0 rounded-full bg-[var(--kz-bg-elevated)] shadow-xs ring-1 ring-black/5 dark:ring-white/10"
          transition={
            isReducedMotion
              ? { duration: 0 }
              : { type: 'spring', damping: 25, stiffness: 350 }
          }
        />
      )}
      <svg
        className={clsx(
          'relative z-10 w-3.5 h-3.5 transition-colors',
          activeTab === 'episodes'
            ? 'text-[var(--kz-accent)]'
            : 'text-[var(--kz-fg-dim)] group-hover:text-[var(--kz-fg-muted)]',
        )}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
      </svg>
      <span className="relative z-10">选集</span>
      {epBadge && (
        <span
          className={clsx(
            'relative z-10 text-[11px] font-normal tracking-tight px-1 py-0.2 rounded',
            activeTab === 'episodes'
              ? 'text-[var(--kz-fg-muted)]'
              : 'text-[var(--kz-fg-dim)]',
          )}
        >
          {epBadge}
        </span>
      )}
    </button>
  )

  // 视频源药丸按钮
  const sourcesPill = (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === 'sources'}
      onClick={() => onTabChange('sources')}
      className={clsx(
        'group relative flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs transition-colors duration-200 select-none cursor-pointer',
        activeTab === 'sources'
          ? 'text-[var(--kz-fg)] font-semibold'
          : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]',
      )}
    >
      {activeTab === 'sources' && (
        <motion.span
          layoutId="active-pod-pill"
          className="absolute inset-0 rounded-full bg-[var(--kz-bg-elevated)] shadow-xs ring-1 ring-black/5 dark:ring-white/10"
          transition={
            isReducedMotion
              ? { duration: 0 }
              : { type: 'spring', damping: 25, stiffness: 350 }
          }
        />
      )}
      <svg
        className={clsx(
          'relative z-10 w-3.5 h-3.5 transition-colors',
          activeTab === 'sources'
            ? 'text-[var(--kz-accent)]'
            : 'text-[var(--kz-fg-dim)] group-hover:text-[var(--kz-fg-muted)]',
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
      <span className="relative z-10">视频源</span>
      {isAutoProbing ? (
        <span className="relative z-10 inline-block h-2 w-2 animate-spin rounded-full border border-[var(--kz-accent)] border-t-transparent" />
      ) : sourceBadge ? (
        <span
          className={clsx(
            'relative z-10 text-[11px] font-normal tracking-tight max-w-[85px] truncate',
            activeTab === 'sources'
              ? 'text-[var(--kz-fg-muted)]'
              : 'text-[var(--kz-fg-dim)]',
          )}
          title={sourceBadge}
        >
          {sourceBadge}
        </span>
      ) : null}
    </button>
  )

  // 番剧详情药丸按钮 (移动端展示)
  const detailPill = detailNode ? (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === 'detail'}
      onClick={() => onTabChange('detail')}
      className={clsx(
        'group relative flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs transition-colors duration-200 select-none cursor-pointer',
        activeTab === 'detail'
          ? 'text-[var(--kz-fg)] font-semibold'
          : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]',
      )}
    >
      {activeTab === 'detail' && (
        <motion.span
          layoutId="active-pod-pill"
          className="absolute inset-0 rounded-full bg-[var(--kz-bg-elevated)] shadow-xs ring-1 ring-black/5 dark:ring-white/10"
          transition={
            isReducedMotion
              ? { duration: 0 }
              : { type: 'spring', damping: 25, stiffness: 350 }
          }
        />
      )}
      <svg
        className={clsx(
          'relative z-10 w-3.5 h-3.5 transition-colors',
          activeTab === 'detail'
            ? 'text-[var(--kz-accent)]'
            : 'text-[var(--kz-fg-dim)] group-hover:text-[var(--kz-fg-muted)]',
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="relative z-10">详情</span>
    </button>
  ) : null

  return (
    <section
      id="kz-watch-media-pod"
      className="kz-watch-panel shrink-0 overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-xs transition-all duration-300"
    >
      {/* 居中胶囊药丸切换条 (无长条背景和横线，对齐 zakoway 质感) */}
      <div className="flex items-center justify-center pt-3 pb-1 px-3">
        {/* 胶囊分段控制器 */}
        <div
          role="tablist"
          aria-label="选集、视频源与详情切换"
          className="inline-flex items-center p-0.5 rounded-full bg-[var(--kz-bg-soft)] border border-[var(--kz-border-subtle)] text-xs font-medium shadow-xs"
        >
          {detailNode ? (
            <>
              {/* 移动端: 详情 | 视频源 | 选集 */}
              {detailPill}
              {sourcesPill}
              {episodesPill}
            </>
          ) : (
            <>
              {/* 电脑端: 选集 | 视频源 (保持不变) */}
              {episodesPill}
              {sourcesPill}
            </>
          )}
        </div>
      </div>

      {/* 内容主体：通过 display 状态保持内存驻留，杜绝重复发起搜索/探活 */}
      <div className="relative w-full">
        <div
          role="tabpanel"
          aria-hidden={activeTab !== 'episodes'}
          className={clsx(
            'transition-opacity duration-150',
            activeTab === 'episodes' ? 'block opacity-100' : 'hidden opacity-0',
          )}
        >
          {episodesNode}
        </div>
        <div
          role="tabpanel"
          aria-hidden={activeTab !== 'sources'}
          className={clsx(
            'transition-opacity duration-150',
            activeTab === 'sources' ? 'block opacity-100' : 'hidden opacity-0',
          )}
        >
          {sourcesNode}
        </div>
        {detailNode && (
          <div
            role="tabpanel"
            aria-hidden={activeTab !== 'detail'}
            className={clsx(
              'transition-opacity duration-150',
              activeTab === 'detail' ? 'block opacity-100' : 'hidden opacity-0',
            )}
          >
            {detailNode}
          </div>
        )}
      </div>
    </section>
  )
}
