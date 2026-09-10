import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { bangumiApi } from '../lib/bangumi'
import { useSearchHistoryStore } from '../stores/search-history'
import {
  BangumiGrid,
  BangumiGridSkeleton,
  ErrorState,
  PageHeader,
} from '../components/ui'

export function SearchPage() {
  const [params, setSearchParams] = useSearchParams()
  const keyword = (params.get('q') || '').trim()
  const historyQueries = useSearchHistoryStore((s) => s.queries)
  const removeSearch = useSearchHistoryStore((s) => s.removeSearch)
  const clearAll = useSearchHistoryStore((s) => s.clearAll)

  const q = useQuery({
    queryKey: ['search', keyword],
    queryFn: ({ signal }) => bangumiApi.search(keyword, { signal }),
    enabled: keyword.length > 0,
    // Align with anime browse + server POST /search TTL (2h)
    staleTime: 30 * 60_000,
    gcTime: 2 * 60 * 60_000,
  })

  const onSelectHistory = (item: string) => {
    setSearchParams({ q: item })
  }

  return (
    <div>
      <PageHeader
        title={keyword ? `搜索「${keyword}」` : '搜索'}
        description="在 Bangumi 中搜索 · 使用右上角搜索框"
      />
      {!keyword && (
        <div className="space-y-6">
          {historyQueries.length > 0 ? (
            <div className="rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-5 shadow-sm">
              <div className="mb-3.5 flex items-center justify-between text-sm text-[var(--kz-fg-muted)]">
                <div className="flex items-center gap-2 font-semibold text-[var(--kz-fg)]">
                  <svg
                    className="h-4 w-4 text-[var(--kz-accent)]"
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
                  className="rounded px-2 py-1 text-xs text-[var(--kz-fg-dim)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
                >
                  清空历史
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {historyQueries.map((item) => (
                  <div
                    key={item}
                    className="group flex items-center gap-1.5 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] py-1.5 pl-3 pr-2 text-sm text-[var(--kz-fg)] transition-all hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectHistory(item)}
                      className="max-w-[240px] truncate text-left"
                    >
                      {item}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSearch(item)
                      }}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--kz-fg-dim)] transition-colors hover:bg-[var(--kz-accent)] hover:text-white group-hover:text-[var(--kz-fg-muted)]"
                      title={`删除「${item}」`}
                      aria-label={`删除历史记录 ${item}`}
                    >
                      <svg
                        className="h-3 w-3"
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
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--kz-border)] py-16 text-center text-sm text-[var(--kz-fg-muted)]">
              在右上角输入关键词后回车或点「搜索」
            </div>
          )}
        </div>
      )}
      {keyword && q.isLoading && <BangumiGridSkeleton count={12} />}
      {keyword && q.isError && (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      )}
      {keyword && q.data && <BangumiGrid items={q.data.data} />}
    </div>
  )
}
