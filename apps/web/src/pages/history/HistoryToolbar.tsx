import { KzButton, KzInput } from '../../components/ui'

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
  totalCount,
  onToggleSelectAll,
  onBatchDelete,
}: HistoryToolbarProps) {
  if (!hasItems) return null

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 搜索框 */}
        <KzInput
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onClear={() => onSearchChange('')}
          clearable
          placeholder="搜索番剧标题或视频源…"
          containerClassName="flex-1 max-w-md"
          leftIcon={
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
          }
        />

        {/* 模式切换与操作 */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <KzButton
            variant={isBatchMode ? 'primary' : 'outline'}
            size="sm"
            onClick={onToggleBatchMode}
          >
            {isBatchMode ? '完成管理' : '批量管理'}
          </KzButton>
          {!isBatchMode && (
            <KzButton
              variant="danger-outline"
              size="sm"
              onClick={onClearAll}
            >
              清空全部
            </KzButton>
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
              disabled={totalCount === 0}
              className="flex items-center gap-1.5 font-medium text-[var(--kz-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
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
            <KzButton
              variant="danger"
              size="sm"
              disabled={selectedCount === 0}
              onClick={onBatchDelete}
            >
              删除所选 ({selectedCount})
            </KzButton>
            <KzButton
              variant="outline"
              size="sm"
              onClick={onToggleBatchMode}
            >
              取消
            </KzButton>
          </div>
        </div>
      )}
    </div>
  )
}
