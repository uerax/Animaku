import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type {
  DanmakuAnime,
  DanmakuEpisode,
  DanmakuSettings,
} from '@animaku/shared'
import {
  type DanmakuPoolId,
  type DanmakuSourceChip,
} from '../lib/danmaku-pools'
import type { PointerMode } from './chrome/usePointerMode'

export type DanmakuPanelTab = 'search' | 'settings' | 'import'

interface Props {
  open: boolean
  tab: DanmakuPanelTab
  onTabChange: (t: DanmakuPanelTab) => void
  onClose: () => void
  status: string
  /** total loaded across all sources */
  commentsCount: number
  /** currently drawn (enabled sources) */
  visibleCount?: number
  danmaku: DanmakuSettings
  onDanmakuChange: (partial: Partial<DanmakuSettings>) => void
  keyword: string
  onKeywordChange: (v: string) => void
  onSearch: () => void
  searchBusy?: boolean
  animes: DanmakuAnime[]
  episodes: DanmakuEpisode[]
  animeId: number | ''
  episodeId: number | ''
  onAnimeChange: (id: number) => void
  onEpisodeChange: (id: number) => void
  bvInput: string
  onBvInputChange: (v: string) => void
  bvPage: number
  onBvPageChange: (p: number) => void
  onLoadBilibili: () => void
  bilibiliBusy?: boolean
  onPickXmlFile: () => void
  filterDraft: string
  onFilterDraftChange: (v: string) => void
  onAddFilter: () => void
  onRemoveFilter: (rule: string) => void
  /** Multi-source chips under panel content */
  sources?: DanmakuSourceChip[]
  onToggleSource?: (id: DanmakuPoolId) => void
  /** Per-pool time offsets map */
  poolOffsets?: Record<DanmakuPoolId, number>
  /** Callback to set per-pool time offset */
  onSetPoolOffset?: (id: DanmakuPoolId, offset: number) => void
  /** Relative offset for danmaku episode alignment (e.g. -1 for prologue shift) */
  danmakuOffset?: number
  onResetOffset?: () => void
  /** Bottom offset so desktop panel sits above player controls */
  bottomOffset?: number
  /**
   * chrome layout — mobile gets a compact bottom sheet;
   * desktop keeps the floating side card. Defaults to desktop.
   */
  layout?: PointerMode
}

const TABS = [
  ['search', '弹弹搜索'],
  ['settings', '弹幕设置'],
  ['import', '导入/屏蔽'],
] as const

export function DanmakuPanel(props: Props) {
  if (!props.open) return null

  const layout = props.layout ?? 'desktop'
  if (layout === 'mobile') {
    if (typeof document !== 'undefined') {
      const portalTarget =
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element })
          .webkitFullscreenElement ||
        document.body
      return createPortal(<MobileSheet {...props} />, portalTarget)
    }
    return <MobileSheet {...props} />
  }
  return <DesktopCard {...props} />
}

/* ─── Desktop floating card ─── */

function DesktopCard(props: Props) {
  const {
    tab,
    onTabChange,
    onClose,
    status,
    commentsCount,
    visibleCount,
    danmaku,
    onDanmakuChange,
    sources,
    onToggleSource,
  } = props

  const shown =
    typeof visibleCount === 'number' ? visibleCount : commentsCount

  return (
    <div
      className="kz-danmaku-panel kz-danmaku-panel--desktop absolute z-[85] flex w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/95 text-[var(--kz-fg)] shadow-2xl backdrop-blur-2xl"
      style={{
        maxHeight: 'min(27rem, calc(100dvh - 6rem))',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="弹幕面板"
      data-player-chrome
    >
      {/* Header Tabs */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--kz-border)] px-3 py-2 bg-[var(--kz-bg-soft)]/60">
        <div className="flex gap-1 bg-[var(--kz-bg)]/80 p-0.5 rounded-xl border border-[var(--kz-border)]/60">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-active={tab === id}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150 data-[active=true]:bg-[var(--kz-accent)] data-[active=true]:text-white data-[active=true]:shadow-xs data-[active=false]:text-[var(--kz-fg-muted)] data-[active=false]:hover:bg-[var(--kz-bg-soft)] data-[active=false]:hover:text-[var(--kz-fg)] border-0 bg-transparent cursor-pointer select-none"
              onClick={() => onTabChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-xs text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-soft)] hover:text-[var(--kz-fg)] transition-colors border-0 bg-transparent cursor-pointer"
          aria-label="关闭弹幕面板"
        >
          ✕
        </button>
      </div>

      {/* Status Bar */}
      <div className="shrink-0 border-b border-[var(--kz-border)] px-3.5 py-1.5 text-[11.5px] leading-snug text-[var(--kz-fg-muted)] bg-[var(--kz-bg-soft)]/30 flex items-center justify-between gap-2">
        <span className="truncate min-w-0 flex-1">{status || '—'}</span>
        {commentsCount > 0 ? (
          <span className="shrink-0 text-[var(--kz-accent)] font-medium font-mono text-[11px]">
            {shown !== commentsCount ? `${shown}/${commentsCount}条` : `${commentsCount}条`}
          </span>
        ) : null}
      </div>

      {/* Tab Body */}
      <div className="kz-danmaku-panel-body flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="kz-danmaku-panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 text-sm text-[var(--kz-fg)] space-y-3">
          {tab === 'search' && <SearchTab {...props} compact={false} />}
          {tab === 'settings' && (
            <SettingsTab
              {...props}
              danmaku={danmaku}
              onDanmakuChange={onDanmakuChange}
              compact={false}
            />
          )}
          {tab === 'import' && <ImportTab {...props} compact={false} />}
        </div>
      </div>

      {/* Sources Footer */}
      <SourcesFooter sources={sources} onToggleSource={onToggleSource} compact={false} />
    </div>
  )
}

/* ─── Mobile centered modal (No dark overlay backdrop) ─── */

function MobileSheet(props: Props) {
  const {
    tab,
    onTabChange,
    onClose,
    status,
    commentsCount,
    visibleCount,
    danmaku,
    onDanmakuChange,
    sources,
    onToggleSource,
  } = props

  const shown =
    typeof visibleCount === 'number' ? visibleCount : commentsCount

  const modalRef = useRef<HTMLDivElement>(null)

  // Listen for outside clicks to close without dark backdrop overlay
  useEffect(() => {
    const handleGlobalPointer = (e: MouseEvent | TouchEvent) => {
      if (!modalRef.current) return
      const target = e.target as Node
      if (!modalRef.current.contains(target)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleGlobalPointer, true)
      window.addEventListener('touchstart', handleGlobalPointer, true)
    }, 60)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleGlobalPointer, true)
      window.removeEventListener('touchstart', handleGlobalPointer, true)
    }
  }, [onClose])

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[99999] m-auto flex flex-col w-[90%] max-w-[23rem] h-[68dvh] max-h-[28rem] bg-[var(--kz-bg-elevated)]/95 text-[var(--kz-fg)] backdrop-blur-2xl border border-[var(--kz-border)] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-150"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="弹幕面板"
      data-player-chrome
    >
      {/* Header Tabs */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60">
        <div className="flex-1 flex gap-1 p-0.5 rounded-xl bg-[var(--kz-bg)] border border-[var(--kz-border)]/60 min-w-0" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              className={
                tab === id
                  ? 'flex-1 h-7 rounded-lg text-xs font-semibold bg-[var(--kz-accent)] text-white shadow-xs transition-all border-0 cursor-pointer'
                  : 'flex-1 h-7 rounded-lg text-xs font-semibold text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] transition-all border-0 bg-transparent cursor-pointer'
              }
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] rounded-lg hover:bg-[var(--kz-bg-soft)] transition-colors text-sm border-0 bg-transparent cursor-pointer shrink-0"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {/* Status Bar */}
      <div className="shrink-0 border-b border-[var(--kz-border)] px-3.5 py-1.5 text-[11.5px] leading-snug text-[var(--kz-fg-muted)] bg-[var(--kz-bg-soft)]/30 flex items-center justify-between gap-2">
        <span className="truncate min-w-0 flex-1">{status || '—'}</span>
        {commentsCount > 0 ? (
          <span className="ml-2 text-[var(--kz-accent)] font-medium font-mono text-[11px] shrink-0">
            {shown !== commentsCount ? `${shown}/${commentsCount}条` : `${commentsCount}条`}
          </span>
        ) : null}
      </div>

      {/* Content Body */}
      <div className="flex-1 min-h-0 h-full overflow-y-auto overscroll-contain p-3.5 space-y-3 text-sm text-[var(--kz-fg)]">
        {tab === 'search' && <SearchTab {...props} compact />}
        {tab === 'settings' && (
          <SettingsTab
            {...props}
            danmaku={danmaku}
            onDanmakuChange={onDanmakuChange}
            compact
          />
        )}
        {tab === 'import' && <ImportTab {...props} compact />}
      </div>

      {/* Sources Footer */}
      <SourcesFooter sources={sources} onToggleSource={onToggleSource} compact />
    </div>
  )
}

/* ─── Sources Footer (Clean & Minimal) ─── */

function SourcesFooter({
  sources,
  onToggleSource,
  compact,
}: {
  sources?: DanmakuSourceChip[]
  onToggleSource?: (id: DanmakuPoolId) => void
  compact: boolean
}) {
  if (!sources?.some((s) => s.loaded) || !onToggleSource) return null
  const loaded = sources.filter((s) => s.loaded)
  return (
    <div
      className={
        compact
          ? 'kz-danmaku-panel-sources shrink-0 border-t border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60 px-3 py-1.5 text-[var(--kz-fg-muted)]'
          : 'kz-danmaku-panel-sources shrink-0 border-t border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60 px-3 py-1.5 text-[var(--kz-fg-muted)]'
      }
    >
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-medium text-[var(--kz-fg-muted)]">
        <span>弹幕源池</span>
        <span className="text-[10px] opacity-70">点击可独立开/关</span>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth">
        {loaded.map((s) => {
          let activeClass =
            'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
          let badgeActive =
            'bg-emerald-500 text-white font-bold'

          if (s.id === 'bilibili_auto') {
            activeClass =
              'border-pink-500/40 bg-pink-500/10 text-pink-600 dark:text-pink-400 font-semibold'
            badgeActive = 'bg-pink-500 text-white font-bold'
          } else if (s.id === 'bilibili_manual') {
            activeClass =
              'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold'
            badgeActive = 'bg-purple-500 text-white font-bold'
          } else if (s.id === 'upload') {
            activeClass =
              'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold'
            badgeActive = 'bg-sky-500 text-white font-bold'
          }

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggleSource(s.id)}
              title={
                s.enabled
                  ? `点击关闭「${s.label}」${s.meta ? ` · ${s.meta}` : ''}`
                  : `点击显示「${s.label}」${s.meta ? ` · ${s.meta}` : ''}`
              }
              className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full border pl-2 pr-1 py-0.5 text-[10.5px] leading-tight transition-all duration-150 cursor-pointer select-none ${
                s.enabled
                  ? `${activeClass} shadow-xs`
                  : 'border-[var(--kz-border)] bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)] opacity-60 hover:opacity-100 hover:border-[var(--kz-border-hover)]'
              }`}
            >
              <span>{s.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono leading-none tracking-tight shadow-2xs ${
                  s.enabled
                    ? badgeActive
                    : 'bg-black/15 dark:bg-white/15 text-[var(--kz-fg-muted)] font-medium'
                }`}
              >
                {s.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Offset Stepper Widget (Reusable & Touch-friendly) ─── */

function OffsetStepper({
  value,
  onChange,
  onReset,
  label,
  subLabel,
}: {
  value: number
  onChange: (next: number) => void
  onReset: () => void
  label?: string
  subLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [inputStr, setInputStr] = useState(String(value))

  useEffect(() => {
    setInputStr(String(value))
  }, [value])

  const commitInput = () => {
    const parsed = Number(inputStr)
    if (Number.isFinite(parsed)) {
      onChange(Math.round(parsed * 10) / 10)
    } else {
      setInputStr(String(value))
    }
    setEditing(false)
  }

  const formatOffset = (v: number) => {
    if (v === 0) return '0.0s'
    return v > 0 ? `+${v.toFixed(1)}s` : `${v.toFixed(1)}s`
  }

  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between text-xs text-[var(--kz-fg-muted)]">
          <span className="font-medium">{label}</span>
          {subLabel ? <span className="text-[10px] opacity-75">{subLabel}</span> : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-1 w-full bg-[var(--kz-bg-soft)]/70 border border-[var(--kz-border)] p-1 rounded-xl">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(Math.round((value - 1) * 10) / 10)}
            className="h-7 px-1.5 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)]/70 text-[11px] font-mono text-[var(--kz-fg)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 transition-all cursor-pointer"
            title="快退 1 秒"
          >
            -1s
          </button>
          <button
            type="button"
            onClick={() => onChange(Math.round((value - 0.5) * 10) / 10)}
            className="h-7 px-1.5 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)]/70 text-[11px] font-mono text-[var(--kz-fg)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 transition-all cursor-pointer"
            title="微退 0.5 秒"
          >
            -0.5s
          </button>
        </div>

        {/* Middle display / edit box */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-1">
          {editing ? (
            <input
              autoFocus
              type="number"
              step={0.5}
              value={inputStr}
              onChange={(e) => setInputStr(e.target.value)}
              onBlur={commitInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInput()
                if (e.key === 'Escape') {
                  setInputStr(String(value))
                  setEditing(false)
                }
              }}
              className="w-16 h-7 text-center font-mono text-xs font-bold bg-[var(--kz-bg)] border border-[var(--kz-accent)] rounded-lg text-[var(--kz-fg)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              onDoubleClick={onReset}
              title="点击手动输入，双击重置为 0.0s"
              className={`h-7 px-2 rounded-lg border flex items-center justify-center font-mono text-xs font-bold transition-all cursor-pointer truncate max-w-full ${
                value !== 0
                  ? 'border-[var(--kz-accent)]/50 bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] shadow-2xs'
                  : 'border-transparent bg-transparent text-[var(--kz-fg)] hover:bg-[var(--kz-bg-elevated)]'
              }`}
            >
              {formatOffset(value)}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(Math.round((value + 0.5) * 10) / 10)}
            className="h-7 px-1.5 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)]/70 text-[11px] font-mono text-[var(--kz-fg)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 transition-all cursor-pointer"
            title="微进 0.5 秒"
          >
            +0.5s
          </button>
          <button
            type="button"
            onClick={() => onChange(Math.round((value + 1) * 10) / 10)}
            className="h-7 px-1.5 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)]/70 text-[11px] font-mono text-[var(--kz-fg)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 transition-all cursor-pointer"
            title="快进 1 秒"
          >
            +1s
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Settings Tab ─── */

type OffsetTarget = 'global' | DanmakuPoolId

function SettingsTab({
  danmaku,
  onDanmakuChange,
  sources,
  poolOffsets,
  onSetPoolOffset,
}: Props & { compact: boolean }) {
  // Determine available offset tabs based on loaded sources
  const availableTargets = useMemo(() => {
    const list: Array<{ id: OffsetTarget; label: string; offset: number }> = [
      { id: 'global', label: '全局', offset: danmaku.timeOffset || 0 },
    ]
    const loadedSources = (sources || []).filter((s) => s.loaded)

    for (const s of loadedSources) {
      const offset = poolOffsets?.[s.id] ?? s.timeOffset ?? 0
      list.push({
        id: s.id,
        label: s.label,
        offset,
      })
    }
    return list
  }, [sources, poolOffsets, danmaku.timeOffset])

  const [selectedTarget, setSelectedTarget] = useState<OffsetTarget>('global')

  // Keep target valid if active source disappears
  useEffect(() => {
    if (!availableTargets.some((t) => t.id === selectedTarget)) {
      setSelectedTarget('global')
    }
  }, [availableTargets, selectedTarget])

  const currentTargetObj = availableTargets.find((t) => t.id === selectedTarget) || availableTargets[0]
  const currentOffset = currentTargetObj.offset

  const handleOffsetChange = (nextOffset: number) => {
    if (selectedTarget === 'global') {
      onDanmakuChange({ timeOffset: nextOffset })
    } else if (onSetPoolOffset) {
      onSetPoolOffset(selectedTarget, nextOffset)
    }
  }

  const handleResetCurrentOffset = () => {
    handleOffsetChange(0)
  }

  return (
    <div className="space-y-3.5">
      {/* Group 1: Time Offset Alignment Center */}
      <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--kz-fg)]">时间轴校准 (Offset)</span>
          <button
            type="button"
            onClick={() => {
              onDanmakuChange({ timeOffset: 0 })
              if (onSetPoolOffset) {
                for (const t of availableTargets) {
                  if (t.id !== 'global') onSetPoolOffset(t.id, 0)
                }
              }
            }}
            className="text-[10.5px] text-[var(--kz-fg-muted)] hover:text-[var(--kz-accent)] transition-colors border-0 bg-transparent cursor-pointer"
          >
            全部归零
          </button>
        </div>

        {/* Dynamic Source Tabs with Distinct High-Contrast Accent Background on Active */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--kz-bg)] border border-[var(--kz-border)] overflow-x-auto no-scrollbar">
          {availableTargets.map((t) => {
            const active = selectedTarget === t.id
            const hasShift = t.offset !== 0
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTarget(t.id)}
                className={`flex-1 min-w-[3.5rem] py-1.5 px-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1 border-0 cursor-pointer select-none truncate ${
                  active
                    ? 'bg-[var(--kz-accent)] text-white shadow-xs font-bold'
                    : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] bg-transparent font-medium'
                }`}
              >
                <span className="truncate">{t.label}</span>
                {hasShift ? (
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded-full font-bold ${
                      active
                        ? 'bg-white/25 text-white'
                        : 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)]'
                    }`}
                  >
                    {t.offset > 0 ? `+${t.offset}` : t.offset}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {/* Offset Stepper for active target */}
        <OffsetStepper
          value={currentOffset}
          onChange={handleOffsetChange}
          onReset={handleResetCurrentOffset}
          subLabel={
            selectedTarget === 'global'
              ? '作用于所有弹幕（修复视频自身片头）'
              : `单独调节「${currentTargetObj.label}」源时间轴`
          }
        />
      </div>

      {/* Group 2: Danmaku Toggles */}
      <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-2">
        <label className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--kz-fg)] cursor-pointer select-none">
          <span>显示弹幕</span>
          <input
            type="checkbox"
            checked={danmaku.enabled}
            onChange={(e) => onDanmakuChange({ enabled: e.target.checked })}
            className="w-4 h-4 rounded text-[var(--kz-accent)] accent-[var(--kz-accent)] cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--kz-fg)] cursor-pointer select-none">
          <span>弹幕精简 (合并刷屏)</span>
          <input
            type="checkbox"
            checked={Boolean(danmaku.simplify)}
            onChange={(e) => onDanmakuChange({ simplify: e.target.checked })}
            className="w-4 h-4 rounded text-[var(--kz-accent)] accent-[var(--kz-accent)] cursor-pointer"
          />
        </label>
      </div>

      {/* Group 3: Appearance Sliders */}
      <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-2.5">
        <RangeRow
          label="不透明度"
          value={danmaku.opacity}
          min={0.1}
          max={1}
          step={0.05}
          display={`${Math.round(danmaku.opacity * 100)}%`}
          onChange={(v) => onDanmakuChange({ opacity: v })}
        />
        <RangeRow
          label="弹幕字号"
          value={danmaku.fontSize}
          min={0.5}
          max={2}
          step={0.05}
          display={`${danmaku.fontSize.toFixed(2)}×`}
          onChange={(v) => onDanmakuChange({ fontSize: v })}
        />
        <RangeRow
          label="弹幕速度"
          value={danmaku.speed}
          min={0.5}
          max={2}
          step={0.05}
          display={`${danmaku.speed.toFixed(2)}×`}
          onChange={(v) => onDanmakuChange({ speed: v })}
        />
        <RangeRow
          label="显示区域"
          value={danmaku.area}
          min={0.2}
          max={1}
          step={0.05}
          display={`${Math.round(danmaku.area * 100)}%`}
          onChange={(v) => onDanmakuChange({ area: v })}
        />
      </div>

      {/* Group 4: Danmaku Type Filter Chips */}
      <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-1.5">
        <div className="text-[11px] font-medium text-[var(--kz-fg-muted)]">弹幕类型过滤</div>
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              ['showScroll', '滚动'],
              ['showTop', '顶部'],
              ['showBottom', '底部'],
              ['showColor', '彩色'],
            ] as const
          ).map(([key, label]) => {
            const active = Boolean(danmaku[key])
            return (
              <button
                key={key}
                type="button"
                onClick={() => onDanmakuChange({ [key]: !active })}
                className={`h-7.5 rounded-lg text-xs font-medium border transition-all flex items-center justify-center cursor-pointer select-none ${
                  active
                    ? 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] border-[var(--kz-accent)]/50 font-bold shadow-2xs'
                    : 'bg-[var(--kz-bg)] text-[var(--kz-fg-muted)] border-[var(--kz-border)] hover:border-[var(--kz-border-hover)]'
                }`}
              >
                {active ? `✓ ${label}` : label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Search Tab (Dandanplay) ─── */

function SearchTab(props: Props & { compact: boolean }) {
  return (
    <div className="space-y-3">
      {/* Search Input Box */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--kz-fg)]">弹弹play 番剧搜索</span>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-3 py-2 text-xs text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)] transition-all"
            value={props.keyword}
            onChange={(e) => props.onKeywordChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onSearch()
            }}
            placeholder="搜索番剧名称…"
          />
          <button
            type="button"
            disabled={props.searchBusy}
            onClick={props.onSearch}
            className="shrink-0 rounded-xl bg-[var(--kz-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 transition-all border-0 cursor-pointer shadow-xs"
          >
            {props.searchBusy ? '…' : '搜索'}
          </button>
        </div>
      </div>

      {/* Anime Pick */}
      <div className="space-y-1">
        <span className="text-xs text-[var(--kz-fg-muted)]">选择番剧</span>
        <CustomSelect
          value={props.animeId}
          placeholder="选择番剧…"
          options={props.animes.map((a) => ({
            value: a.animeId,
            label: `${a.animeTitle}${a.typeDescription ? ` (${a.typeDescription})` : ''}`,
          }))}
          onChange={(val) => props.onAnimeChange(val as number)}
        />
      </div>

      {/* Episode Pick */}
      <div className="space-y-1">
        <span className="text-xs text-[var(--kz-fg-muted)]">选择章节</span>
        <CustomSelect
          value={props.episodeId}
          placeholder="选择章节…"
          options={props.episodes.map((ep) => ({
            value: ep.episodeId,
            label: ep.episodeTitle,
          }))}
          onChange={(val) => props.onEpisodeChange(val as number)}
        />
      </div>

      {/* Episode Alignment Shift Info */}
      {props.danmakuOffset !== undefined && props.danmakuOffset !== 0 ? (
        <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="flex items-center gap-1.5 font-medium">
            <span>⚡</span>
            <span>
              已校准集数偏移: {props.danmakuOffset > 0 ? `+${props.danmakuOffset}` : props.danmakuOffset} 集
            </span>
          </span>
          {props.onResetOffset && (
            <button
              type="button"
              onClick={props.onResetOffset}
              className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/30 dark:text-amber-300 transition-colors"
              title="重置当前源弹幕集数偏移为 0"
            >
              重置偏移
            </button>
          )}
        </div>
      ) : null}

      <p className="text-[11px] leading-relaxed text-[var(--kz-fg-muted)]">
        弹弹play 匹配写入「弹弹」基准源。可在底部开关各源，或在设置页对齐时间轴。
      </p>
    </div>
  )
}

/* ─── Import & Filters Tab ─── */

function ImportTab(props: Props & { compact: boolean }) {
  const { poolOffsets, onSetPoolOffset } = props
  const biliManualOffset = poolOffsets?.bilibili_manual ?? 0
  const uploadOffset = poolOffsets?.upload ?? 0

  return (
    <div className="space-y-3.5">
      {/* Card 1: Bilibili Manual Import */}
      <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-2">
        <div className="text-xs font-semibold text-[var(--kz-fg)]">Bilibili 视频 / 番剧链接</div>
        <input
          className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)] transition-all"
          value={props.bvInput}
          onChange={(e) => props.onBvInputChange(e.target.value)}
          placeholder="BV号 / ep86012 / ss28277 / av号 / 完整链接"
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onLoadBilibili()
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[var(--kz-fg-muted)]">
            <span className="font-medium">分P</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={props.bvPage}
              onChange={(e) =>
                props.onBvPageChange(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-14 h-7.5 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 text-center text-xs font-mono font-bold text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)]"
            />
          </div>
          <button
            type="button"
            disabled={props.bilibiliBusy}
            onClick={props.onLoadBilibili}
            className="h-7.5 px-3.5 rounded-lg bg-[var(--kz-accent)] text-white text-xs font-semibold hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 transition-all border-0 cursor-pointer shadow-2xs"
          >
            {props.bilibiliBusy ? '拉取中…' : '追加 B 站弹幕'}
          </button>
        </div>

        {/* Dedicated Stepper for Bilibili Manual */}
        <OffsetStepper
          value={biliManualOffset}
          onChange={(v) => onSetPoolOffset?.('bilibili_manual', v)}
          onReset={() => onSetPoolOffset?.('bilibili_manual', 0)}
          label="BV源独立时移"
          subLabel="解决剪辑/片头差异"
        />
      </div>

      {/* Card 2: Local XML File Import */}
      <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-2">
        <div className="text-xs font-semibold text-[var(--kz-fg)]">本地 XML 弹幕文件</div>
        <button
          type="button"
          onClick={props.onPickXmlFile}
          className="flex items-center justify-between gap-2 w-full p-2.5 rounded-xl bg-[var(--kz-bg)] border border-dashed border-[var(--kz-border)] text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] transition-all cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">📁</span>
            <span className="text-xs font-semibold">选择本地 XML 弹幕文件</span>
          </div>
          <span className="text-[10px] text-[var(--kz-fg-muted)]">B 站 / pakku</span>
        </button>

        {/* Dedicated Stepper for XML Upload */}
        <OffsetStepper
          value={uploadOffset}
          onChange={(v) => onSetPoolOffset?.('upload', v)}
          onReset={() => onSetPoolOffset?.('upload', 0)}
          label="XML源独立时移"
        />
      </div>

      {/* Card 3: Danmaku Filters List */}
      <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-2">
        <div className="text-xs font-semibold text-[var(--kz-fg)]">
          屏蔽词列表 · {props.danmaku.filters.length} 条
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-1.5 text-xs text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)] transition-all"
            value={props.filterDraft}
            onChange={(e) => props.onFilterDraftChange(e.target.value)}
            placeholder="关键词 或 /regex/"
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onAddFilter()
            }}
          />
          <button
            type="button"
            onClick={props.onAddFilter}
            className="h-7.5 px-3 rounded-lg bg-[var(--kz-accent)] text-white text-xs font-semibold hover:bg-[var(--kz-accent-hover)] active:scale-95 transition-all cursor-pointer border-0 shrink-0 shadow-2xs"
          >
            添加
          </button>
        </div>
        {props.danmaku.filters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-[var(--kz-bg)]/80 rounded-xl border border-[var(--kz-border)]">
            {props.danmaku.filters.map((rule) => (
              <span
                key={rule}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[var(--kz-bg-soft)] border border-[var(--kz-border)] text-xs text-[var(--kz-fg)] max-w-full truncate"
              >
                <span className="truncate font-mono">{rule}</span>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300 border-0 bg-transparent cursor-pointer font-bold text-xs p-0 leading-none"
                  onClick={() => props.onRemoveFilter(rule)}
                  aria-label="删除屏蔽词"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── UI Helper: Slider Row ─── */

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[var(--kz-fg-muted)] font-medium shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 bg-[var(--kz-bg)] rounded-full accent-[var(--kz-accent)] cursor-pointer"
        />
        <span className="w-11 text-right font-mono font-semibold text-[11px] text-[var(--kz-accent)] shrink-0">
          {display}
        </span>
      </div>
    </div>
  )
}

/* ─── Custom Select component (Portal based, no overflow clipping) ─── */

function CustomSelect<T extends number | string>({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: T | ''
  options: Array<{ value: T; label: string }>
  placeholder: string
  onChange: (val: T) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{
    top: number
    left: number
    width: number
    openUp: boolean
  }>({ top: 0, left: 0, width: 0, openUp: false })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const updateCoords = () => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < 160 && rect.top > spaceBelow
    setCoords({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUp,
    })
  }

  const handleToggle = () => {
    if (!open) {
      updateCoords()
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onDocDismiss = (e: Event) => {
      const target = e.target as Node
      if (
        !buttonRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const onScrollOrResize = () => {
      updateCoords()
    }
    window.addEventListener('click', onDocDismiss, true)
    window.addEventListener('pointerdown', onDocDismiss, true)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize, true)
    return () => {
      window.removeEventListener('click', onDocDismiss, true)
      window.removeEventListener('pointerdown', onDocDismiss, true)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize, true)
    }
  }, [open])

  const selectedOpt = options.find((o) => o.value === value)

  const portalTarget =
    typeof document !== 'undefined'
      ? document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element })
          .webkitFullscreenElement ||
        document.body
      : null

  return (
    <div className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between w-full h-8.5 px-3 rounded-xl bg-[var(--kz-bg-soft)] border border-[var(--kz-border)] text-[var(--kz-fg)] text-xs font-medium outline-none hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] active:scale-[0.99] transition-all cursor-pointer text-left"
      >
        <span className="truncate min-w-0 flex-1">
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <svg
          className={`w-3.5 h-3.5 ml-1.5 text-[var(--kz-fg-muted)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6.2L8 10.2L12 6.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        portalTarget &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              top: coords.openUp ? 'auto' : `${coords.top}px`,
              bottom: coords.openUp
                ? `${window.innerHeight - coords.top}px`
                : 'auto',
              zIndex: 999999,
            }}
            className="max-h-44 overflow-y-auto overscroll-contain py-1 rounded-xl bg-[var(--kz-bg-elevated)]/98 border border-[var(--kz-border)] shadow-2xl backdrop-blur-2xl text-[var(--kz-fg)] animate-in fade-in-50 zoom-in-95 duration-100"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onChange('' as T)
                setOpen(false)
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-soft)] transition-colors border-0 bg-transparent cursor-pointer"
            >
              {placeholder}
            </button>
            {options.map((opt) => {
              const active = opt.value === value
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  title={opt.label}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`flex items-center justify-between w-full px-3 py-2 text-left text-xs transition-colors border-0 cursor-pointer ${
                    active
                      ? 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] font-bold'
                      : 'text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)]'
                  }`}
                >
                  <span className="truncate min-w-0 flex-1">{opt.label}</span>
                  {active && (
                    <span className="ml-2 text-xs text-[var(--kz-accent)]">✓</span>
                  )}
                </button>
              )
            })}
          </div>,
          portalTarget,
        )}
    </div>
  )
}
