import { memo, useMemo } from 'react'
import clsx from 'clsx'

export interface CommentPaginationProps {
  page: number
  pageSize: number
  total: number
  loading?: boolean
  onPageChange: (page: number) => void
}

export const CommentPagination = memo(function CommentPagination({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
}: CommentPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const items: (number | 'ellipsis')[] = []
    if (page <= 4) {
      for (let i = 1; i <= 5; i++) items.push(i)
      items.push('ellipsis', totalPages)
    } else if (page >= totalPages - 3) {
      items.push(1, 'ellipsis')
      for (let i = totalPages - 4; i <= totalPages; i++) items.push(i)
    } else {
      items.push(1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages)
    }
    return items
  }, [page, totalPages])

  if (totalPages <= 1) return null

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1.5 pt-2 select-none"
      aria-label="吐槽分页导航"
    >
      {/* 上一页按键 */}
      <button
        type="button"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
        className="flex h-8 items-center gap-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-card)] px-2.5 text-xs font-medium text-[var(--kz-fg-muted)] transition-colors hover:border-[var(--kz-border-hover)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] disabled:opacity-40 disabled:pointer-events-none"
      >
        <span>‹</span>
        <span className="hidden sm:inline">上一页</span>
      </button>

      {/* 页码序列 */}
      {pages.map((p, idx) => {
        if (p === 'ellipsis') {
          return (
            <span
              key={`ellipsis-${idx}`}
              className="flex h-8 w-6 items-center justify-center text-xs text-[var(--kz-fg-dim)]"
            >
              …
            </span>
          )
        }

        const isCurrent = p === page
        return (
          <button
            key={p}
            type="button"
            disabled={loading}
            onClick={() => onPageChange(p)}
            className={clsx(
              'flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums transition-colors',
              isCurrent
                ? 'bg-[var(--kz-accent)] text-white shadow-xs'
                : 'border border-[var(--kz-border)] bg-[var(--kz-bg-card)] text-[var(--kz-fg-muted)] hover:border-[var(--kz-border-hover)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]',
            )}
          >
            {p}
          </button>
        )
      })}

      {/* 下一页按键 */}
      <button
        type="button"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
        className="flex h-8 items-center gap-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-card)] px-2.5 text-xs font-medium text-[var(--kz-fg-muted)] transition-colors hover:border-[var(--kz-border-hover)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] disabled:opacity-40 disabled:pointer-events-none"
      >
        <span className="hidden sm:inline">下一页</span>
        <span>›</span>
      </button>
    </div>
  )
})
