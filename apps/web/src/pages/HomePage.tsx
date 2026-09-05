import { useQuery } from '@tanstack/react-query'
import { bangumiImageUrl } from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import {
  BangumiGrid,
  BangumiGridSkeleton,
  ErrorState,
} from '../components/ui'
import { HeroCoverFlow } from '../components/HeroCoverFlow'
import { useHistoryStore } from '../stores/history'
import { Link } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { EMPTY_ARRAY } from '../lib/stable'
import { preloadVideoPlayer } from '../player/lazy'

const SECTION_LIMIT = 18

export function HomePage() {
  const trending = useQuery({
    queryKey: ['trending', SECTION_LIMIT],
    queryFn: ({ signal }) => bangumiApi.trending(SECTION_LIMIT, 0, { signal }),
    staleTime: 2 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
  })

  // 深度复用 trending 首屏前 10 项作为焦点舞台数据，提供充足的 3D 环形缓冲池，彻底消除重复的并发 API 请求
  const heroItems = useMemo(
    () => (trending.data?.data ? trending.data.data.slice(0, 10) : EMPTY_ARRAY),
    [trending.data],
  )

  const movies = useQuery({
    queryKey: ['home-movies', SECTION_LIMIT],
    queryFn: ({ signal }) =>
      bangumiApi.search('', {
        tags: ['剧场版'],
        sort: 'heat',
        limit: SECTION_LIMIT,
        signal,
      }),
    staleTime: 2 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
  })

  const ovas = useQuery({
    queryKey: ['home-ovas', SECTION_LIMIT],
    queryFn: ({ signal }) =>
      bangumiApi.search('', {
        tags: ['OVA'],
        sort: 'heat',
        limit: SECTION_LIMIT,
        signal,
      }),
    staleTime: 2 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
  })

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
      {/* 顶部 3D Cover Flow 焦点舞台 */}
      {trending.isLoading && (
        <div className="relative -mx-4 overflow-hidden px-4 pt-6 pb-6 sm:mx-0 sm:px-6 sm:pt-8 sm:pb-8">
          <div className="mx-auto h-[270px] w-full animate-pulse rounded-2xl bg-[var(--kz-bg-soft)]/60 sm:h-[340px] md:h-[370px] lg:h-[390px] xl:h-[410px] max-w-5xl lg:max-w-6xl xl:max-w-[1360px] 2xl:max-w-[1480px]" />
          <div className="mx-auto mt-6 h-6 w-56 animate-pulse rounded-full bg-[var(--kz-bg-soft)]" />
          <div className="mx-auto mt-3 h-4 w-40 animate-pulse rounded-full bg-[var(--kz-bg-soft)]/60" />
        </div>
      )}
      {!trending.isLoading && heroItems.length >= 3 && (
        <section aria-label="热门聚焦">
          <HeroCoverFlow items={heroItems} limit={10} />
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
            <h2 className="kz-section-title font-black">继续观看</h2>
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
            {recent.map((h) => (
              <Link
                key={h.id}
                to={`/play/${h.bangumiId}?plugin=${encodeURIComponent(h.pluginName)}&ep=${h.episode}${h.road > 0 ? `&road=${h.road}` : ''}`}
                onMouseEnter={preloadVideoPlayer}
                onFocus={preloadVideoPlayer}
                onTouchStart={preloadVideoPlayer}
                className="kz-surface kz-surface-interactive flex min-w-0 max-w-full items-center gap-3 overflow-hidden p-3"
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
          // 【性能与体验红线】：
          // 此处的 eagerCount={6} 必须严格保持 >= 桌面端最大断点列数 (lg:grid-cols-6)。
          // 严禁调小此数值（如改成 3 或 4），否则桌面端首屏第一排右侧的卡片会被错误判定为 loading="lazy"，
          // 导致首屏右侧卡片出现明显的加载空缺与滞后，重新引入全站懒加载拖慢首屏的 Bug！
          <BangumiGrid items={trending.data.data} eagerCount={6} />
        )}
      </section>

      {/* 剧场版 */}
      <section>
        <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
          <h2 className="kz-section-title font-black">剧场版</h2>
          <Link
            to="/anime?tag=%E5%89%A7%E5%9C%BA%E7%89%88&year=all&month=all"
            className="text-[13px] font-semibold text-[var(--kz-accent)] hover:underline"
          >
            查看更多
          </Link>
        </div>
        {movies.isLoading && <BangumiGridSkeleton count={SECTION_LIMIT} />}
        {movies.isError && (
          <ErrorState error={movies.error} onRetry={() => movies.refetch()} />
        )}
        {movies.data && (
          <BangumiGrid items={movies.data.data} eagerCount={0} />
        )}
      </section>

      {/* OVA / 特别篇 */}
      <section>
        <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
          <h2 className="kz-section-title font-black">OVA / 特别篇</h2>
          <Link
            to="/anime?tag=OVA&year=all&month=all"
            className="text-[13px] font-semibold text-[var(--kz-accent)] hover:underline"
          >
            查看更多
          </Link>
        </div>
        {ovas.isLoading && <BangumiGridSkeleton count={SECTION_LIMIT} />}
        {ovas.isError && (
          <ErrorState error={ovas.error} onRetry={() => ovas.refetch()} />
        )}
        {ovas.data && (
          <BangumiGrid items={ovas.data.data} eagerCount={0} />
        )}
      </section>
    </div>
  )
}
