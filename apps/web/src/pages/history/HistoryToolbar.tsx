interface HistoryToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  isBatchMode: boolean
  onToggleBatchMode: () => void
  onClearAll: () => void
  hasItems: boolean
  isAllSelected: boolean
  selectedCount: number
  totalCount: number
  onToggleSelectAll: () => void
  onBatchDelete: () => void
}

export function HistoryToolbar({
  searchQuery,
  onSearchChange,
  isBatchMode,
  onToggleBatchMode,
  onClearAll,
  hasItems,
  isAllSelected,
  selectedCount,
  onToggleSelectAll,
  onBatchDelete,
}: HistoryToolbarProps) {
  if (!hasItems) return null

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--kz-fg-dim)]">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索番剧标题或视频源…"
            className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-card)] py-2 pl-9 pr-8 text-sm text-[var(--kz-fg)] placeholder-[var(--kz-fg-dim)] transition-colors focus:border-[var(--kz-accent)] focus:outline-hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)]"
              title="清空搜索"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>

        {/* 模式切换与操作 */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={onToggleBatchMode}
            className={`rounded-xl border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              isBatchMode
                ? 'border-[var(--kz-accent)] bg-[var(--kz-accent-soft)] text-[var(--kz-accent)]'
                : 'border-[var(--kz-border)] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)]'
            }`}
          >
            {isBatchMode ? '完成管理' : '批量管理'}
          </button>
          {!isBatchMode && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-xl border border-[var(--kz-border)] px-3.5 py-1.5 text-sm font-medium text-[var(--kz-danger)] transition-colors hover:bg-[var(--kz-bg-hover)]"
            >
              清空全部
            </button>
          )}
        </div>
      </div>

      {/* 批量管理操作横条 */}
      {isBatchMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--kz-accent-ring)] bg-[var(--kz-accent-soft)]/50 px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={onToggleSelectAll}
              className="flex items-center gap-1.5 font-medium text-[var(--kz-accent)] hover:underline"
            >
              <span>{isAllSelected ? '取消全选' : '全选全部'}</span>
            </button>
            <span className="text-[var(--kz-fg-dim)]">·</span>
            <span className="text-[var(--kz-fg-muted)]">
              已选择{' '}
              <strong className="text-[var(--kz-fg)]">{selectedCount}</strong>{' '}
              项
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBatchDelete}
              disabled={selectedCount === 0}
              className="rounded-lg bg-[var(--kz-danger)] px-3.5 py-1.5 text-sm font-semibold text-white shadow-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              删除所选 ({selectedCount})
            </button>
            <button
              type="button"
              onClick={onToggleBatchMode}
              className="rounded-lg border border-[var(--kz-border)] px-3 py-1.5 text-sm text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)]"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
