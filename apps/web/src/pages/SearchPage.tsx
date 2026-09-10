import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import type { BangumiItem } from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import { useSearchHistoryStore } from '../stores/search-history'
import {
  BangumiGrid,
  BangumiGridSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
} from '../components/ui'

type SearchFilterType = 'all' | 'anime' | 'non-anime'
type SearchSortType = 'default' | 'date-desc' | 'date-asc'

const SORT_OPTIONS: Array<{
  key: SearchSortType
  label: string
}> = [
  { key: 'date-desc', label: '最新放送' },
  { key: 'default', label: '默认匹配' },
  { key: 'date-asc', label: '最早放送' },
]

export function SearchPage() {
  const [params, setSearchParams] = useSearchParams()
  const keyword = (params.get('q') || '').trim()
  const historyQueries = useSearchHistoryStore((s) => s.queries)
  const removeSearch = useSearchHistoryStore((s) => s.removeSearch)
  const clearAll = useSearchHistoryStore((s) => s.clearAll)

  // 默认只显示动漫类型
  const [filter, setFilter] = useState<SearchFilterType>('anime')
  // 默认按最新放送排序
  const [sort, setSort] = useState<SearchSortType>('date-desc')

  useEffect(() => {
    setFilter('anime')
    setSort('date-desc')
  }, [keyword])

  const q = useQuery({
    queryKey: ['search', keyword],
    queryFn: ({ signal }) => bangumiApi.search(keyword, { signal }),
    enabled: keyword.length > 0,
    // Align with anime browse + server POST /search TTL (2h)
    staleTime: 30 * 60_000,
    gcTime: 2 * 60 * 60_000,
  })

  const allItems = useMemo(() => q.data?.data || [], [q.data?.data])

  const { filteredItems, counts } = useMemo(() => {
    const anime: BangumiItem[] = []
    const nonAnime: BangumiItem[] = []

    for (const item of allItems) {
      if (item.type === 2) {
        anime.push(item)
      } else {
        nonAnime.push(item)
      }
    }

    let filtered = filter === 'anime' ? anime : filter === 'non-anime' ? nonAnime : allItems

    if (sort === 'date-desc') {
      filtered = [...filtered].sort((a, b) => {
        const da = a.airDate || ''
        const db = b.airDate || ''
        if (da === db) return 0
        if (!da) return 1
        if (!db) return -1
        return db.localeCompare(da)
      })
    } else if (sort === 'date-asc') {
      filtered = [...filtered].sort((a, b) => {
        const da = a.airDate || ''
        const db = b.airDate || ''
        if (da === db) return 0
        if (!da) return 1
        if (!db) return -1
        return da.localeCompare(db)
      })
    }

    return {
      filteredItems: filtered,
      counts: {
        all: allItems.length,
        anime: anime.length,
        nonAnime: nonAnime.length,
      },
    }
  }, [allItems, filter, sort])

  const filterTabs: Array<{
    key: SearchFilterType
    label: string
    count: number
  }> = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'anime', label: '动漫', count: counts.anime },
    { key: 'non-anime', label: '非动漫', count: counts.nonAnime },
  ]

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
      {keyword && q.data && (
        <div>
          {allItems.length > 0 ? (
            <>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {filterTabs.map((tab) => {
                    const active = filter === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setFilter(tab.key)}
                        className={clsx(
                          'kz-pill min-h-[32px] px-3.5 py-1 text-xs font-medium transition-all sm:text-sm',
                          active
                            ? 'kz-pill-active border-transparent shadow-sm'
                            : 'kz-pill-idle border border-[var(--kz-border)] hover:border-[var(--kz-accent)]',
                        )}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={clsx(
                            'ml-1.5 text-[11px] tabular-nums sm:text-xs',
                            active ? 'text-white/90' : 'text-[var(--kz-fg-dim)]',
                          )}
                        >
                          ({tab.count})
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                  <span className="mr-0.5 text-xs text-[var(--kz-fg-dim)]">排序:</span>
                  {SORT_OPTIONS.map((opt) => {
                    const active = sort === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSort(opt.key)}
                        className={clsx(
                          'kz-pill min-h-[28px] px-2.5 py-0.5 text-xs font-medium transition-all',
                          active
                            ? 'kz-pill-active border-transparent shadow-sm'
                            : 'kz-pill-idle border border-[var(--kz-border)] hover:border-[var(--kz-accent)]',
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <div className="kz-surface rounded-2xl border border-dashed border-[var(--kz-border)] px-4 py-16 text-center text-sm text-[var(--kz-fg-dim)] shadow-none">
                  <p>
                    当前搜索结果暂无
                    {filter === 'anime'
                      ? '动漫'
                      : filter === 'non-anime'
                        ? '非动漫'
                        : ''}
                    内容
                    {filter === 'anime' && counts.nonAnime > 0 && (
                      <span className="mt-1 block text-xs text-[var(--kz-fg-muted)]">
                        在非动漫分类中找到了 {counts.nonAnime} 条相关结果
                      </span>
                    )}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {filter === 'anime' && counts.nonAnime > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilter('non-anime')}
                        className="kz-pill kz-pill-active border-transparent px-3.5 py-1 text-xs"
                      >
                        查看非动漫 ({counts.nonAnime})
                      </button>
                    )}
                    {filter !== 'all' && counts.all > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilter('all')}
                        className="kz-pill kz-pill-idle border border-[var(--kz-border)] px-3.5 py-1 text-xs hover:border-[var(--kz-accent)]"
                      >
                        查看全部 ({counts.all})
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <BangumiGrid items={filteredItems} />
              )}
            </>
          ) : (
            <EmptyState text={`未找到与「${keyword}」相关的结果`} />
          )}
        </div>
      )}
    </div>
  )
}
