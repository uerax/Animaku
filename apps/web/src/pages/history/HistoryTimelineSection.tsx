import type { HistoryTimeGroup, HistoryTimeGroupKey } from '@animaku/shared'
import { HistoryCard } from './HistoryCard'

interface HistoryTimelineSectionProps {
  group: HistoryTimeGroup
  isBatchMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onDeleteEntry: (id: string) => void
  onClearGroup: (key: HistoryTimeGroupKey, label: string) => void
}

export function HistoryTimelineSection({
  group,
  isBatchMode,
  selectedIds,
  onToggleSelect,
  onDeleteEntry,
  onClearGroup,
}: HistoryTimelineSectionProps) {
  const isToday = group.key === 'today'

  return (
    <section className="relative pl-6 sm:pl-8">
      {/* 贯穿时间轴的竖向线条 */}
      <div
        className="absolute left-2.5 sm:left-3 top-4 bottom-0 w-0.5 bg-[var(--kz-border)] -translate-x-1/2"
        aria-hidden="true"
      />

      {/* 时间节点圆圈 */}
      <div
        className={`absolute left-2.5 sm:left-3 top-2.5 -translate-x-1/2 flex items-center justify-center rounded-full transition-all ${
          isToday
            ? 'h-4 w-4 bg-[var(--kz-accent)] shadow-[0_0_12px_var(--kz-accent)] ring-4 ring-[var(--kz-accent-soft)]'
            : 'h-3.5 w-3.5 border-2 border-[var(--kz-border)] bg-[var(--kz-bg)]'
        }`}
        aria-hidden="true"
      >
        {isToday && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </div>

      {/* 分组标头 */}
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base sm:text-lg font-bold text-[var(--kz-fg)]">
            {group.label}
          </h2>
          <span className="text-xs font-mono text-[var(--kz-fg-dim)]">
            {group.subLabel}
          </span>
          <span className="rounded-full bg-[var(--kz-bg-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--kz-fg-muted)]">
            {group.items.length}
          </span>
        </div>

        {/* 单组清空按钮 */}
        {!isBatchMode && (
          <button
            type="button"
            onClick={() => onClearGroup(group.key, group.label)}
            className="rounded-lg px-2.5 py-1 text-xs text-[var(--kz-fg-dim)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-danger)]"
          >
            清空{group.label}
          </button>
        )}
      </div>

      {/* 组内条目列表 */}
      <div className="space-y-2.5 mb-8">
        {group.items.map((item) => (
          <HistoryCard
            key={item.id}
            entry={item}
            isBatchMode={isBatchMode}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={onToggleSelect}
            onDelete={onDeleteEntry}
          />
        ))}
      </div>
    </section>
  )
}
