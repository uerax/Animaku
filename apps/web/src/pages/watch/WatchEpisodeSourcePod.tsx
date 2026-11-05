import { useMemo, type ReactNode } from 'react'
import clsx from 'clsx'
import { KzSegmented, type KzSegmentedOption } from '../../components/ui'

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
 * - 顶部为双行微芯片舱 (Micro-Chip Pill) 胶囊分段控制器，第一行固定图标与标题，第二行内嵌状态微胶囊；
 * - 隐藏多余的重叠边框与折叠头，保持 DOM 常驻显隐，杜绝反复发请求；
 * - 兼顾桌面侧栏 (Rail) 与移动端流式布局。
 */
export function WatchEpisodeSourcePod({
  activeTab,
  onTabChange,
  episodesNode,
  sourcesNode,
  detailNode,
  isAutoProbing = false,
}: WatchEpisodeSourcePodProps) {
  const options = useMemo<KzSegmentedOption<WatchPodTab>[]>(() => {
    const epOpt: KzSegmentedOption<WatchPodTab> = {
      value: 'episodes',
      label: '选集',
      icon: (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
        </svg>
      ),
    }

    const sourceOpt: KzSegmentedOption<WatchPodTab> = {
      value: 'sources',
      label: '视频源',
      icon: (
        <svg
          className="size-3.5"
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
      ),
      loading: isAutoProbing,
    }

    if (detailNode) {
      const detailOpt: KzSegmentedOption<WatchPodTab> = {
        value: 'detail',
        label: '详情',
        icon: (
          <svg
            className="size-3.5"
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
        ),
      }
      // 移动端: 详情 | 视频源 | 选集
      return [detailOpt, sourceOpt, epOpt]
    }

    // 桌面端: 选集 | 视频源
    return [epOpt, sourceOpt]
  }, [isAutoProbing, Boolean(detailNode)])

  return (
    <section
      id="kz-watch-media-pod"
      className="kz-watch-panel shrink-0 overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-xs transition-all duration-300"
    >
      {/* 居中经典胶囊分段控制器 (黄金高宽比、紧凑圆润、呼吸自然) */}
      <div className="flex items-center justify-center pt-2.5 pb-1 px-3">
        <KzSegmented
          value={activeTab}
          options={options}
          onChange={onTabChange}
          equalWidth
          size="sm"
          className={detailNode ? 'w-full max-w-[226px]' : 'w-full max-w-[160px]'}
          aria-label="选集、视频源与详情切换"
        />
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
