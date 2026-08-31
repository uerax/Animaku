import { memo, useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { bangumiApi } from '../../../lib/bangumi'
import { CommentCard } from './CommentCard'
import { CommentPagination } from './CommentPagination'
import { CommentSkeleton } from './CommentSkeleton'

const PAGE_SIZE = 10

export const WatchComments = memo(function WatchComments({
  bangumiId,
}: {
  bangumiId: number
}) {
  const [page, setPage] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  // 当番剧 ID 切换时，重置页码为第一页
  useEffect(() => {
    setPage(1)
  }, [bangumiId])

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['bangumi-comments', bangumiId, page],
    queryFn: ({ signal }) =>
      bangumiApi.comments(bangumiId, {
        page,
        pageSize: PAGE_SIZE,
        signal,
      }),
    enabled: Number.isFinite(bangumiId) && bangumiId > 0,
    staleTime: 3 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  })

  const comments = data?.data || []
  const total = data?.total || 0

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    // 平滑滚动回评论区顶部
    if (containerRef.current) {
      const top = containerRef.current.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  // 若非首次加载且确认条目不存在吐槽数据，优雅渲染精简空状态
  const isEmpty = !isLoading && !isError && comments.length === 0

  return (
    <section
      ref={containerRef}
      className="kz-watch-comments rounded-2xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-card)]/30 p-4 sm:p-5 space-y-4 shadow-xs"
      aria-label="番剧吐槽"
    >
      {/* 头部标题与数量统计 */}
      <div className="flex items-center justify-between border-b border-[var(--kz-border)]/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-[var(--kz-fg)]">
            💭 吐槽
          </span>
          {total > 0 && (
            <span className="rounded-full bg-[var(--kz-bg-soft)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--kz-fg-muted)]">
              {total.toLocaleString()}
            </span>
          )}
        </div>
        {isFetching && !isLoading && (
          <span className="text-xs text-[var(--kz-fg-dim)] animate-pulse">
            刷新中…
          </span>
        )}
      </div>

      {/* 列表渲染区 */}
      {isLoading ? (
        <CommentSkeleton count={5} />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-[var(--kz-fg-muted)] space-y-2">
          <span>吐槽列表加载暂不可用</span>
          <button
            type="button"
            onClick={() => setPage(page)}
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-card)] px-3 py-1 text-xs text-[var(--kz-accent)] hover:underline"
          >
            重试
          </button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-[var(--kz-fg-muted)]">
          <span>暂无相关吐槽记录</span>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <CommentCard key={c.id} comment={c} />
          ))}
        </div>
      )}

      {/* 底部数字分页器 */}
      {!isLoading && !isError && total > PAGE_SIZE && (
        <CommentPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          loading={isFetching}
          onPageChange={handlePageChange}
        />
      )}
    </section>
  )
})
