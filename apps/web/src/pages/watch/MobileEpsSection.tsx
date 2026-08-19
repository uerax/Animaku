import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'

export type MobileEpsRoad = {
  name?: string
  identifier: string[]
  data: string[]
}

const RANGE_SIZE = 50

type EpisodeItem = {
  actualIndex: number // 0-based index in road.data
  title: string
}

type RangeBucket = {
  rangeIndex: number
  startEp: number // 1-based (e.g. 1)
  endEp: number // 1-based (e.g. 50)
  label: string // "1-50"
  items: EpisodeItem[]
}

/**
 * Bilibili 正片侧栏风格选集（桌面 rail + 移动共用）:
 *  选集 (n/N)   [🔄] [⇅ 正/倒序]              全 N 话 ⌄
 *  [线路 soft pills]
 *  [多集区间分页 pills (如 1-50, 51-100...)]
 *  [横向圆角集卡 | 全量网格]
 *
 * 集卡形状：横向圆角矩形，保证「第01集」可读。
 * 行为钩子保留：listExpanded / data-ep-index；展开与折叠横条均为约 4 列。
 */
export function MobileEpsSection({
  roads,
  activeRoadIndex,
  playingRoad,
  playingEpisode,
  epCount,
  listExpanded,
  roadLoading,
  roadError,
  pendingPluginName,
  hasSelection,
  onToggleList,
  onSelectRoad,
  onPickEpisode,
  onRefreshChapters,
}: {
  roads: MobileEpsRoad[]
  activeRoadIndex: number
  playingRoad?: number | null
  /** 1-based episode number currently playing on playingRoad */
  playingEpisode?: number | null
  epCount: number
  listExpanded: boolean
  roadLoading?: boolean
  roadError?: string | null
  pendingPluginName?: string | null
  hasSelection: boolean
  onToggleList: () => void
  onSelectRoad: (index: number) => void
  onPickEpisode: (epIndex: number, roadIndex: number) => void
  onRefreshChapters?: () => void
}) {
  const activeRoad = roads[activeRoadIndex]
  const showRoads = roads.length > 0
  const [isDescOrder, setIsDescOrder] = useState(false)
  const [selectedRangeIndex, setSelectedRangeIndex] = useState(0)

  const stripRef = useRef<HTMLDivElement>(null)
  const roadsRef = useRef<HTMLDivElement>(null)
  const rangeTabsRef = useRef<HTMLDivElement>(null)

  const rawCount = activeRoad?.identifier?.length ?? epCount

  // Build range buckets for long anime (> 40 eps)
  const isMultiRange = rawCount > 40
  const rangeBuckets = useMemo(() => {
    if (!activeRoad || rawCount <= 0) return []
    const total = activeRoad.identifier.length
    const buckets: RangeBucket[] = []
    const numBuckets = Math.ceil(total / RANGE_SIZE)

    for (let b = 0; b < numBuckets; b++) {
      const startIdx = b * RANGE_SIZE
      const endIdx = Math.min(total, (b + 1) * RANGE_SIZE)
      const items: EpisodeItem[] = []
      for (let i = startIdx; i < endIdx; i++) {
        items.push({
          actualIndex: i,
          title: activeRoad.identifier[i]?.trim() || String(i + 1),
        })
      }
      buckets.push({
        rangeIndex: b,
        startEp: startIdx + 1,
        endEp: endIdx,
        label: `${startIdx + 1}-${endIdx}`,
        items,
      })
    }
    return buckets
  }, [activeRoad, rawCount])

  // Auto-align selected range to playingEpisode when playing on this road
  useEffect(() => {
    if (!isMultiRange || !playingEpisode || playingEpisode < 1) return
    if (playingRoad !== activeRoadIndex) return
    const targetBucketIdx = Math.floor((playingEpisode - 1) / RANGE_SIZE)
    if (targetBucketIdx >= 0 && targetBucketIdx < rangeBuckets.length) {
      setSelectedRangeIndex(targetBucketIdx)
    }
  }, [isMultiRange, playingEpisode, playingRoad, activeRoadIndex, rangeBuckets.length])

  // Scroll active range tab into view
  useEffect(() => {
    if (!isMultiRange) return
    const root = rangeTabsRef.current
    if (!root) return
    const activeTab = root.querySelector<HTMLElement>(
      `[data-range-index="${selectedRangeIndex}"]`,
    )
    activeTab?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [isMultiRange, selectedRangeIndex])

  // Displayed range buckets (ordered asc/desc)
  const displayedBuckets = useMemo(() => {
    if (!isDescOrder) return rangeBuckets
    return [...rangeBuckets].reverse()
  }, [rangeBuckets, isDescOrder])

  // Current visible episode items
  const visibleEpisodes = useMemo(() => {
    if (!activeRoad) return []
    if (!isMultiRange) {
      const items: EpisodeItem[] = activeRoad.identifier.map((name, i) => ({
        actualIndex: i,
        title: name?.trim() || String(i + 1),
      }))
      return isDescOrder ? items.reverse() : items
    }
    const bucket = rangeBuckets.find((b) => b.rangeIndex === selectedRangeIndex) || rangeBuckets[0]
    if (!bucket) return []
    return isDescOrder ? [...bucket.items].reverse() : bucket.items
  }, [activeRoad, isMultiRange, rangeBuckets, selectedRangeIndex, isDescOrder])

  // Scroll playing card into view in horizontal strip
  useEffect(() => {
    if (listExpanded) return
    if (playingRoad !== activeRoadIndex) return
    if (!playingEpisode || playingEpisode < 1) return
    const root = stripRef.current
    if (!root) return
    const card = root.querySelector<HTMLElement>(
      `[data-ep-index="${playingEpisode - 1}"]`,
    )
    card?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [listExpanded, playingRoad, playingEpisode, activeRoadIndex, visibleEpisodes])

  // Keep active road pill in view when many lines overflow horizontally
  useEffect(() => {
    const root = roadsRef.current
    if (!root) return
    const tab = root.querySelector<HTMLElement>(
      `[data-road-index="${activeRoadIndex}"]`,
    )
    tab?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeRoadIndex, roads.length])

  const countLabel =
    rawCount > 0
      ? playingEpisode && playingEpisode > 0
        ? `(${playingEpisode}/${rawCount})`
        : `(${rawCount})`
      : ''

  return (
    <section className="kz-watch-eps kz-watch-eps--mobile kz-watch-panel min-w-0 max-w-full overflow-hidden">
      <div className="kz-bili-sec-head">
        <h2 className="kz-bili-sec-title">
          选集
          {countLabel ? (
            <span className="kz-bili-sec-count">{countLabel}</span>
          ) : null}
        </h2>

        <div className="flex items-center gap-1.5 ml-auto">
          {hasSelection && onRefreshChapters && (
            <button
              type="button"
              onClick={onRefreshChapters}
              disabled={roadLoading}
              className="kz-bili-sec-btn"
              title="刷新选集列表"
              aria-label="刷新选集列表"
            >
              <svg
                className={clsx('w-3.5 h-3.5', roadLoading && 'animate-spin text-[var(--kz-accent)]')}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </button>
          )}

          {rawCount > 1 && (
            <button
              type="button"
              onClick={() => setIsDescOrder((v) => !v)}
              className={clsx('kz-bili-sec-btn', isDescOrder && 'text-[var(--kz-accent)] font-semibold')}
              title={isDescOrder ? '当前倒序，点击切换为正序' : '当前正序，点击切换为倒序'}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 3v18M3 7l4-4 4 4M17 21V3M13 17l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{isDescOrder ? '倒序' : '正序'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleList}
            className="kz-bili-sec-more"
            aria-expanded={listExpanded}
          >
            {rawCount > 0 ? (listExpanded ? '收起' : `全${rawCount}话`) : '全部'}
            <svg
              className="kz-bili-chevron"
              data-open={listExpanded ? 'true' : 'false'}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M4 6.2L8 10.2L12 6.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {showRoads && (
        <div
          ref={roadsRef}
          className="kz-bili-roads"
          role="tablist"
          aria-label="播放线路"
        >
          {roads.map((road, ri) => {
            const active = ri === activeRoadIndex
            const playingHere = playingRoad === ri
            const label = road.name?.trim() || `线路 ${ri + 1}`
            return (
              <button
                key={`${label}-${ri}`}
                type="button"
                role="tab"
                data-road-index={ri}
                aria-selected={active}
                onClick={() => onSelectRoad(ri)}
                className={clsx(
                  'kz-bili-road',
                  active && 'kz-bili-road--active',
                )}
                title={label}
              >
                <span className="kz-bili-road-label">{label}</span>
                {playingHere && !active ? (
                  <span className="kz-bili-road-live">在播</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      {/* Long anime (> 40 eps) range tabs (1-50, 51-100...) */}
      {hasSelection && isMultiRange && displayedBuckets.length > 1 && (
        <div
          ref={rangeTabsRef}
          className="kz-bili-range-tabs"
          role="tablist"
          aria-label="剧集区间"
        >
          {displayedBuckets.map((bucket) => {
            const active = bucket.rangeIndex === selectedRangeIndex
            const containsPlaying =
              playingRoad === activeRoadIndex &&
              Boolean(
                playingEpisode &&
                  playingEpisode >= bucket.startEp &&
                  playingEpisode <= bucket.endEp,
              )
            return (
              <button
                key={`range-${bucket.rangeIndex}`}
                type="button"
                role="tab"
                data-range-index={bucket.rangeIndex}
                aria-selected={active}
                onClick={() => setSelectedRangeIndex(bucket.rangeIndex)}
                className={clsx(
                  'kz-bili-range-tab',
                  active && 'kz-bili-range-tab--active',
                )}
                title={`查看第 ${bucket.label} 集`}
              >
                <span>{bucket.label}</span>
                {containsPlaying && !active ? (
                  <span className="kz-bili-range-live" title="在播集数所在区间" />
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      <div className="kz-watch-eps-body kz-bili-eps-body">
        {roadLoading && (
          <p className="kz-bili-empty">
            加载分集
            {pendingPluginName ? `（${pendingPluginName}）` : ''}
            …
          </p>
        )}
        {roadError && !hasSelection && <p className="kz-bili-error">{roadError}</p>}
        {!hasSelection && !roadLoading && (
          <div className="kz-bili-hint my-2 rounded-xl bg-[var(--kz-bg-soft)]/50 p-4 border border-[var(--kz-border)]">
            <p className="text-[var(--kz-fg)] font-medium">
              <span className="kz-watch-step bg-[var(--kz-accent)] text-white shadow-sm">1</span>
              在「视频源」选择播放源或点击搜索
            </p>
            <p className="text-[var(--kz-fg-muted)]">
              <span className="kz-watch-step bg-[var(--kz-bg-hover)] text-[var(--kz-fg-dim)]">2</span>
              选中关联资源条目即可加载全集播放
            </p>
          </div>
        )}
        {hasSelection && !roadLoading && activeRoad && (
          <div
            ref={stripRef}
            className={clsx(
              'kz-watch-ep-strip',
              listExpanded
                ? 'kz-bili-ep-grid'
                : 'kz-bili-ep-strip',
            )}
          >
            {visibleEpisodes.map((item) => {
              const epIndex = item.actualIndex
              const playing =
                playingRoad === activeRoadIndex &&
                playingEpisode === epIndex + 1
              return (
                <button
                  key={activeRoad.data[epIndex] + item.title + epIndex}
                  type="button"
                  data-ep-index={epIndex}
                  onClick={() => onPickEpisode(epIndex, activeRoadIndex)}
                  title={item.title}
                  className={clsx(
                    'kz-watch-ep-card kz-bili-ep',
                    playing && 'kz-bili-ep--playing',
                  )}
                >
                  {playing ? (
                    <span className="kz-bili-ep-bars" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : null}
                  <span className="kz-bili-ep-text">{item.title}</span>
                </button>
              )
            })}
          </div>
        )}
        {hasSelection && !roadLoading && !activeRoad && roads.length > 0 && (
          <p className="kz-bili-empty">请选择上方线路查看集数</p>
        )}
      </div>
    </section>
  )
}
