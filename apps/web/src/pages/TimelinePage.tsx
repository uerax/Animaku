import { useMemo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { bangumiApi } from '../lib/bangumi'
import {
  BangumiGrid,
  BangumiGridSkeleton,
  ErrorState,
  PageHeader,
} from '../components/ui'
import { EMPTY_ARRAY } from '../lib/stable'

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

export function TimelinePage() {
  const today = new Date().getDay() // 0 Sun
  const defaultDay = today === 0 ? 6 : today - 1
  const [day, setDay] = useState(defaultDay)

  const q = useQuery({
    queryKey: ['calendar'],
    queryFn: ({ signal }) => bangumiApi.calendar({ signal }),
    // Align with server calendar TTL (24h)
    staleTime: 12 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
  })

  const days = q.data?.data
  const items = useMemo(() => {
    if (!days || !Array.isArray(days[day])) return EMPTY_ARRAY
    return days[day]
  }, [days, day])

  const onSelectDay = useCallback((i: number) => {
    setDay(i)
  }, [])

  return (
    <div>
      <PageHeader
        title="放送时间表"
        description={`本季每日放送（Bangumi）${items.length ? ` · 当日 ${items.length} 部` : ''}`}
      />
      <div className="mb-6 flex flex-wrap gap-2.5">
        {WEEKDAYS.map((label, i) => {
          const isToday = i === defaultDay
          const active = day === i
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelectDay(i)}
              className={
                active
                  ? 'kz-pill kz-pill-active relative shadow-[0_4px_16px_rgba(29,155,240,0.35)]'
                  : 'kz-pill kz-pill-idle border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] hover:border-[var(--kz-accent-ring)]'
              }
            >
              {isToday && (
                <span
                  className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                    active ? 'bg-white shadow-[0_0_8px_#fff]' : 'bg-[var(--kz-accent)] animate-pulse'
                  }`}
                  aria-hidden
                />
              )}
              {label}
              {isToday ? <span className="ml-1 text-xs opacity-90 font-bold">今日</span> : null}
              {days?.[i]?.length ? (
                <span className={`ml-1.5 text-xs font-normal ${active ? 'opacity-85' : 'text-[var(--kz-fg-muted)]'}`}>
                  ({days[i].length})
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {q.isLoading && <BangumiGridSkeleton count={12} />}
      {q.isError && (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      )}
      {q.data && <BangumiGrid items={items} />}
    </div>
  )
}
