import React from 'react'
import clsx from 'clsx'
import { useSearchHistoryStore } from '../stores/search-history'

interface SearchHistoryDropdownProps {
  /** 选中某条历史搜索词时的回调 */
  onSelect: (keyword: string) => void
  /** 自定义外层样式容器类名 */
  className?: string
  /** 是否为移动端模式（移动端可采用更大间距与扁平化设计） */
  isMobile?: boolean
}

export function SearchHistoryDropdown({
  onSelect,
  className,
  isMobile = false,
}: SearchHistoryDropdownProps) {
  const queries = useSearchHistoryStore((s) => s.queries)
  const removeSearch = useSearchHistoryStore((s) => s.removeSearch)
  const clearAll = useSearchHistoryStore((s) => s.clearAll)

  if (queries.length === 0) {
    return null
  }

  return (
    <div
      // 防止点击浮层内部组件导致外部 input 触发 onBlur
      onMouseDown={(e) => e.preventDefault()}
      className={clsx(
        'z-50 overflow-hidden border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] backdrop-blur-2xl transition-all duration-150',
        isMobile
          ? 'rounded-2xl p-3 shadow-xl'
          : 'rounded-2xl p-3 shadow-2xl',
        className,
      )}
      role="region"
      aria-label="搜索历史"
    >
      {/* 头部：标题与清空全部 */}
      <div className="mb-2.5 flex items-center justify-between px-1 text-xs text-[var(--kz-fg-muted)]">
        <div className="flex items-center gap-1.5 font-medium">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 15" />
          </svg>
          <span>搜索历史</span>
        </div>
        <button
          type="button"
          onClick={clearAll}
          className="rounded px-1.5 py-0.5 text-[11px] text-[var(--kz-fg-dim)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
          title="清空全部历史记录"
        >
          清空
        </button>
      </div>

      {/* 标签流式布局 */}
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-0.5">
        {queries.map((item) => (
          <div
            key={item}
            className="group flex max-w-full items-center gap-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] py-1 pl-2.5 pr-1.5 text-xs text-[var(--kz-fg)] transition-all hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
          >
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="min-w-0 max-w-[180px] truncate text-left select-none"
              title={item}
            >
              {item}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeSearch(item)
              }}
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[var(--kz-fg-dim)] transition-colors hover:bg-[var(--kz-accent)] hover:text-white group-hover:text-[var(--kz-fg-muted)]"
              title={`删除「${item}」`}
              aria-label={`删除历史记录 ${item}`}
            >
              <svg
                className="h-2.5 w-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
