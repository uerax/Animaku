import { useMemo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
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
  const isReducedMotion = useReducedMotion()
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
              className="relative inline-flex items-center justify-center min-h-[2.25rem] rounded-full px-3.5 text-sm font-semibold select-none cursor-pointer border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] transition-colors hover:border-[var(--kz-accent-ring)]"
            >
              {active && (
                <motion.span
                  layoutId={isReducedMotion ? undefined : 'timeline-active-pill'}
                  className="absolute inset-0 rounded-full bg-[var(--kz-accent)] shadow-[0_4px_16px_rgba(29,155,240,0.35)]"
                  transition={{
                    type: 'spring',
                    stiffness: 450,
                    damping: 32,
                  }}
                />
              )}
              <span
                className={`relative z-10 flex items-center transition-colors duration-150 ${
                  active ? 'text-white' : 'text-[var(--kz-fg-muted)]'
                }`}
              >
                {isToday && (
                  <span
                    className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                      active
                        ? 'bg-white shadow-[0_0_8px_#fff]'
                        : 'bg-[var(--kz-accent)] animate-pulse'
                    }`}
                    aria-hidden
                  />
                )}
                <span>{label}</span>
                {days?.[i]?.length ? (
                  <span
                    className={`ml-1.5 text-xs font-normal ${
                      active ? 'opacity-85' : 'text-[var(--kz-fg-dim)]'
                    }`}
                  >
                    ({days[i].length})
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
      {q.isLoading && <BangumiGridSkeleton />}
      {q.isError && (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      )}
      {q.data && <BangumiGrid items={items} />}
    </div>
  )
}
