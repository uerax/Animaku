import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CollectType,
  toBangumiCollectionType,
  type BangumiItem,
} from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import { useSettingsStore } from '../stores/settings'
import { useAuthStore } from '../stores/auth'
import {
  BangumiGrid,
  BangumiGridSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
} from '../components/ui'
import clsx from 'clsx'

const TABS: { label: string; key: string; type?: CollectType }[] = [
  { label: '全部', key: 'all' },
  { label: '在看', key: 'watching', type: CollectType.watching },
  { label: '想看', key: 'wish', type: CollectType.planToWatch },
  { label: '看过', key: 'watched', type: CollectType.watched },
  { label: '搁置', key: 'on_hold', type: CollectType.onHold },
  { label: '抛弃', key: 'dropped', type: CollectType.abandoned },
]

const PAGE_SIZE = 24

function computePaginationPages(
  page: number,
  totalPages: number,
): (number | 'ellipsis')[] {
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
}

function parseTab(raw: string | null): number {
  if (!raw) return 0
  const idx = TABS.findIndex((t) => t.key === raw)
  if (idx >= 0) return idx
  const num = Number(raw)
  if (Number.isFinite(num) && num >= 0 && num < TABS.length) {
    return Math.floor(num)
  }
  return 0
}

export function CollectPage() {
  const token = useSettingsStore((s) => s.bangumiToken)
  const [params, setParams] = useSearchParams()

  const tab = parseTab(params.get('tab'))
  const page = Math.max(1, Number(params.get('page') || '1') || 1)
  const offset = (page - 1) * PAGE_SIZE

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: ({ signal }) => bangumiApi.me({ signal }),
    enabled: Boolean(token),
  })

  const bgmType = TABS[tab].type
    ? toBangumiCollectionType(TABS[tab].type!) ?? undefined
    : undefined

  const collections = useQuery({
    queryKey: ['collections', token, bgmType, page],
    queryFn: ({ signal }) =>
      bangumiApi.collections({
        limit: PAGE_SIZE,
        offset,
        type: bgmType,
        signal,
      }),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
  })

  const total = collections.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const items = useMemo(() => {
    const list: BangumiItem[] = []
    for (const c of collections.data?.data || []) {
      if (c.subject) list.push(c.subject)
    }
    return list
  }, [collections.data])

  const pages = useMemo(
    () => computePaginationPages(page, totalPages),
    [page, totalPages],
  )

  const patchParams = useCallback(
    (patch: Record<string, string | null>, opts?: { resetPage?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '' || (k === 'tab' && v === 'all')) {
              next.delete(k)
            } else {
              next.set(k, v)
            }
          }
          if (opts?.resetPage !== false) {
            if (!('page' in patch)) next.delete('page')
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const handleTabChange = useCallback(
    (newTab: number) => {
      const key = TABS[newTab].key
      patchParams({ tab: key === 'all' ? null : key, page: null })
    },
    [patchParams],
  )

  const handlePageChange = useCallback(
    (newPage: number) => {
      patchParams(
        { page: newPage <= 1 ? null : String(newPage) },
        { resetPage: false },
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [patchParams],
  )

  const authUser = useAuthStore((s) => s.getUser())

  if (!token) {
    return (
      <div>
        <PageHeader title="我的追番" />
        <EmptyState text="未登录账号或未配置 Bangumi Access Token" />
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <Link to="/settings#bangumi-token" className="text-[var(--kz-accent)] hover:underline">
            前往设置绑定 Bangumi 账号
          </Link>
        </div>
      </div>
    )
  }

  const descParts: string[] = []
  if (me.data?.data) {
    descParts.push(`${me.data.data.nickname || me.data.data.username} 的收藏`)
  } else if (authUser?.nickname && authUser.nickname !== '未登录') {
    descParts.push(`${authUser.nickname} 的收藏`)
  } else {
    descParts.push('同步自 Bangumi')
  }
  if (TABS[tab].label !== '全部') {
    descParts.push(TABS[tab].label)
  }
  if (total > 0) {
    descParts.push(`共 ${total} 部`)
  }

  return (
    <div>
      <PageHeader
        title="我的追番"
        description={descParts.join(' · ')}
      />
      {me.isError && (
        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          Token 校验失败：{(me.error as Error).message}
        </div>
      )}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => handleTabChange(i)}
            className={
              tab === i
                ? 'kz-pill kz-pill-active'
                : 'kz-pill kz-pill-idle border border-[var(--kz-border)]'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {collections.isLoading && !collections.data && <BangumiGridSkeleton count={12} />}
      {collections.isError && (
        <ErrorState error={collections.error} onRetry={() => collections.refetch()} />
      )}
      {collections.data && (
        <>
          {items.length === 0 ? (
            <EmptyState
              text={
                TABS[tab].label === '全部'
                  ? '暂无收藏'
                  : `暂无「${TABS[tab].label}」记录`
              }
            />
          ) : (
            <div className={clsx(collections.isFetching && 'opacity-70 transition-opacity')}>
              <BangumiGrid items={items} />
            </div>
          )}

          {totalPages > 1 && (
            <nav
              className="mt-8 flex flex-wrap items-center justify-center gap-1.5 pt-2 select-none"
              aria-label="收藏分页导航"
            >
              <button
                type="button"
                disabled={page <= 1 || collections.isFetching}
                onClick={() => handlePageChange(page - 1)}
                className="flex h-8 items-center gap-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-card)] px-2.5 text-xs font-medium text-[var(--kz-fg-muted)] transition-colors hover:border-[var(--kz-border-hover)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] disabled:opacity-40 disabled:pointer-events-none"
              >
                <span>‹</span>
                <span className="hidden sm:inline">上一页</span>
              </button>

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
                    disabled={collections.isFetching}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => handlePageChange(p)}
                    className={clsx(
                      'flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums transition-colors',
                      isCurrent
                        ? 'bg-[var(--kz-accent)] text-white shadow-xs pointer-events-none'
                        : 'border border-[var(--kz-border)] bg-[var(--kz-bg-card)] text-[var(--kz-fg-muted)] hover:border-[var(--kz-border-hover)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]',
                    )}
                  >
                    {p}
                  </button>
                )
              })}

              <button
                type="button"
                disabled={page >= totalPages || collections.isFetching}
                onClick={() => handlePageChange(page + 1)}
                className="flex h-8 items-center gap-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-card)] px-2.5 text-xs font-medium text-[var(--kz-fg-muted)] transition-colors hover:border-[var(--kz-border-hover)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="hidden sm:inline">下一页</span>
                <span>›</span>
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
