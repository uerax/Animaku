import { useQuery, useQueryClient } from '@tanstack/react-query'
import { bangumiImageUrl } from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import {
  BangumiGrid,
  BangumiGridSkeleton,
  ErrorState,
} from '../components/ui'
import { HeroCoverFlow, HeroCoverFlowSkeleton } from '../components/HeroCoverFlow'
import { useHistoryStore } from '../stores/history'
import { useSettingsStore } from '../stores/settings'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { EMPTY_ARRAY } from '../lib/stable'
import { preloadVideoPlayer } from '../player/lazy'
import { useInView } from '../lib/use-in-view'
import { DESKTOP_MEDIA_QUERY } from '../components/hero-cover-flow.constants'

const SECTION_LIMIT = 18
const SECTION_STALE_TIME = 2 * 60 * 60_000
const SECTION_GC_TIME = 12 * 60 * 60_000

const MOVIES_QUERY_KEY = ['home-movies', SECTION_LIMIT] as const
const moviesQueryFn = ({ signal }: { signal?: AbortSignal }) =>
  bangumiApi.search('', {
    tags: ['剧场版'],
    sort: 'heat',
    limit: SECTION_LIMIT,
    signal,
  })

const OVAS_QUERY_KEY = ['home-ovas', SECTION_LIMIT] as const
const ovasQueryFn = ({ signal }: { signal?: AbortSignal }) =>
  bangumiApi.search('', {
    tags: ['OVA'],
    sort: 'heat',
    limit: SECTION_LIMIT,
    signal,
  })

export function HomePage() {
  const queryClient = useQueryClient()
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true
    }
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    setIsDesktop(mq.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])

  const trending = useQuery({
    queryKey: ['trending', SECTION_LIMIT],
    queryFn: ({ signal }) => bangumiApi.trending(SECTION_LIMIT, 0, { signal }),
    staleTime: SECTION_STALE_TIME,
    gcTime: SECTION_GC_TIME,
  })

  // 深度复用 trending 首屏前 10 项作为焦点舞台数据，提供充足的 3D 环形缓冲池，彻底消除重复的并发 API 请求
  const heroItems = useMemo(
    () => (trending.data?.data ? trending.data.data.slice(0, 10) : EMPTY_ARRAY),
    [trending.data],
  )

  const { ref: moviesRef, inView: moviesInView } = useInView()
  const movies = useQuery({
    queryKey: MOVIES_QUERY_KEY,
    queryFn: moviesQueryFn,
    enabled: moviesInView,
    staleTime: SECTION_STALE_TIME,
    gcTime: SECTION_GC_TIME,
  })

  const { ref: ovasRef, inView: ovasInView } = useInView()
  const ovas = useQuery({
    queryKey: OVAS_QUERY_KEY,
    queryFn: ovasQueryFn,
    enabled: ovasInView,
    staleTime: SECTION_STALE_TIME,
    gcTime: SECTION_GC_TIME,
  })

  // 数据层空闲预取：当首屏核心内容（热门番剧）加载完成且处于浏览器空闲时，低优先级静默拉取剧场版与 OVA 数据列表
  // 消除滚动到达时因等待 API 请求造成的整块骨架屏卡死与瞬间跳变；仅预取 JSON 元数据，不下载图片
  useEffect(() => {
    if (!trending.data || typeof window === 'undefined') return

    const schedule =
      'requestIdleCallback' in window
        ? (window.requestIdleCallback as (cb: () => void, opts?: { timeout: number }) => number)
        : (cb: () => void) => window.setTimeout(cb, 1200)
    const cancel =
      'cancelIdleCallback' in window
        ? (window.cancelIdleCallback as (id: number) => void)
        : (id: number) => window.clearTimeout(id)

    const handle = schedule(
      () => {
        queryClient.prefetchQuery({
          queryKey: MOVIES_QUERY_KEY,
          queryFn: moviesQueryFn,
          staleTime: SECTION_STALE_TIME,
        })
        queryClient.prefetchQuery({
          queryKey: OVAS_QUERY_KEY,
          queryFn: ovasQueryFn,
          staleTime: SECTION_STALE_TIME,
        })
      },
      { timeout: 3000 },
    )

    return () => cancel(handle)
  }, [trending.data, queryClient])

  const openInNewTab = useSettingsStore((s) => s.nav.openInNewTab)
  const items = useHistoryStore((s) =>
    Array.isArray(s.items) ? s.items : EMPTY_ARRAY,
  )
  const recent = useMemo(() => items.slice(0, 4), [items])

  // Idle preload: warm player bundle during browser idle time so mobile taps never stall
  useEffect(() => {
    if (typeof window === 'undefined') return
    const schedule =
      'requestIdleCallback' in window
        ? (window.requestIdleCallback as (cb: () => void, opts?: { timeout: number }) => number)
        : (cb: () => void) => window.setTimeout(cb, 1500)
    const cancel =
      'cancelIdleCallback' in window
        ? (window.cancelIdleCallback as (id: number) => void)
        : (id: number) => window.clearTimeout(id)

    const handle = schedule(() => {
      preloadVideoPlayer()
    }, { timeout: 3000 })

    return () => cancel(handle)
  }, [])

  return (
    <div className="space-y-12 sm:space-y-14">
      {/* 语义化全站顶级主标题：对齐移动优先索引与无障碍辅助树，视觉上通过 sr-only 隐式呈现 */}
      <h1 className="sr-only">Animaku 动漫 - 在线高清动画多源聚合弹幕平台</h1>

      {/* 顶部 3D Cover Flow 焦点舞台 */}
      {trending.isLoading ? (
        <section aria-label="热门聚焦加载中">
          <HeroCoverFlowSkeleton />
        </section>
      ) : heroItems.length >= 3 ? (
        <section aria-label="热门聚焦">
          <HeroCoverFlow items={heroItems} limit={10} />
        </section>
      ) : null}

      {recent.length > 0 && (
        <section>
          <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
            <h2 className="kz-section-title font-black">历史观看</h2>
            <Link
              to="/history"
              className="text-[13px] font-semibold text-[var(--kz-accent)] hover:underline"
            >
              查看更多
            </Link>
          </div>
          {/*
            min-w-0 on grid + items: iOS Safari keeps min-width:auto on grid
            children, so horizontal resume cards (long plugin names) can grow
            wider than the page shell / Bangumi grid.
          */}
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((h, idx) => (
              <Link
                key={h.id}
                to={`/play/${h.bangumiId}?plugin=${encodeURIComponent(h.pluginName)}&ep=${h.episode}${h.road > 0 ? `&road=${h.road}` : ''}`}
                target={openInNewTab ? '_blank' : undefined}
                rel={openInNewTab ? 'noopener noreferrer' : undefined}
                onMouseEnter={preloadVideoPlayer}
                onFocus={preloadVideoPlayer}
                onTouchStart={preloadVideoPlayer}
                className={`kz-surface kz-surface-interactive flex min-w-0 max-w-full items-center gap-3 overflow-hidden p-3 ${
                  idx >= 2 ? 'hidden sm:flex' : ''
                }`}
              >
                {h.cover ? (
                  <img
                    src={bangumiImageUrl(h.cover)}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    width={48}
                    height={64}
                    className="h-16 w-12 shrink-0 rounded-lg object-cover shadow-md ring-1 ring-[var(--kz-border)]"
                  />
                ) : (
                  <div className="h-16 w-12 shrink-0 rounded-lg bg-[var(--kz-bg-soft)]" />
                )}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="truncate text-[13px] font-semibold text-[var(--kz-fg)]">
                    {h.title}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-[var(--kz-fg-muted)]">
                    第 {h.episode} 集 · {h.pluginName}
                    {h.duration > 0 &&
                      ` · ${Math.floor((h.position / h.duration) * 100)}%`}
                  </div>
                  {h.duration > 0 && (
                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--kz-border)]">
                      <div
                        className="h-full rounded-full bg-[var(--kz-accent)]"
                        style={{
                          width: `${Math.min(100, Math.round((h.position / h.duration) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 热门番剧 */}
      <section>
        <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
          <h2 className="kz-section-title font-black">热门番剧</h2>
          <Link
            to="/anime"
            className="text-[13px] font-semibold text-[var(--kz-accent)] hover:underline"
          >
            查看更多
          </Link>
        </div>
        {trending.isLoading && <BangumiGridSkeleton count={SECTION_LIMIT} />}
        {trending.isError && (
          <ErrorState error={trending.error} onRetry={() => trending.refetch()} />
        )}
        {trending.data && (
          // 【性能与体验契约防线】：
          // 桌面端（>= 768px）必须严格保持 eagerCount=6，完全对齐 lg:grid-cols-6 第一排满行展示，杜绝首排右侧留白滞后；
          // 移动端（< 768px）网格为 2 列（grid-cols-2）且上方有轮播图，适配为 eagerCount=2，消解首屏过度并发竞争。
          <BangumiGrid
            items={trending.data.data}
            eagerCount={isDesktop ? 6 : 2}
          />
        )}
      </section>

      {/* 剧场版 */}
      <section ref={moviesRef}>
        <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
          <h2 className="kz-section-title font-black">剧场版</h2>
          <Link
            to="/anime?tag=%E5%89%A7%E5%9C%BA%E7%89%88&year=all&month=all"
            className="text-[13px] font-semibold text-[var(--kz-accent)] hover:underline"
          >
            查看更多
          </Link>
        </div>
        {movies.isError ? (
          <ErrorState error={movies.error} onRetry={() => movies.refetch()} />
        ) : movies.data ? (
          <BangumiGrid items={movies.data.data} />
        ) : (
          <BangumiGridSkeleton count={SECTION_LIMIT} />
        )}
      </section>

      {/* OVA / 特别篇 */}
      <section ref={ovasRef}>
        <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
          <h2 className="kz-section-title font-black">OVA / 特别篇</h2>
          <Link
            to="/anime?tag=OVA&year=all&month=all"
            className="text-[13px] font-semibold text-[var(--kz-accent)] hover:underline"
          >
            查看更多
          </Link>
        </div>
        {ovas.isError ? (
          <ErrorState error={ovas.error} onRetry={() => ovas.refetch()} />
        ) : ovas.data ? (
          <BangumiGrid items={ovas.data.data} />
        ) : (
          <BangumiGridSkeleton count={SECTION_LIMIT} />
        )}
      </section>
    </div>
  )
}
