import type { HistoryStatsSummary } from '@animaku/shared'

interface HistoryStatsBarProps {
  stats: HistoryStatsSummary
}

export function HistoryStatsBar({ stats }: HistoryStatsBarProps) {
  if (stats.totalCount === 0) return null

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60 px-4 py-3 text-xs sm:text-sm">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--kz-accent)]" />
        <span className="text-[var(--kz-fg-muted)]">累计记录</span>
        <span className="font-semibold text-[var(--kz-fg)]">
          {stats.totalCount} 条记录
        </span>
      </div>

      <div className="h-3 w-px bg-[var(--kz-border)] hidden sm:block" />

      <div className="flex items-center gap-2">
        <span className="text-[var(--kz-fg-muted)]">今日观看</span>
        <span className="font-semibold text-[var(--kz-accent)]">
          {stats.todayCount} 集
        </span>
      </div>

      <div className="h-3 w-px bg-[var(--kz-border)] hidden sm:block" />

      <div className="flex items-center gap-2">
        <span className="text-[var(--kz-fg-muted)]">已看完</span>
        <span className="font-semibold text-emerald-500">
          {stats.finishedCount} 集
        </span>
      </div>

      <div className="h-3 w-px bg-[var(--kz-border)] hidden sm:block" />

      <div className="flex items-center gap-2">
        <span className="text-[var(--kz-fg-muted)]">累计播放</span>
        <span className="font-semibold text-[var(--kz-fg)]">
          {stats.totalWatchHoursText}
        </span>
      </div>
    </div>
  )
}
