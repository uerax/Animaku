import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type {
  DanmakuAnime,
  DanmakuEpisode,
  DanmakuSettings,
} from '@animaku/shared'
import type { DanmakuSourceChip } from '../lib/danmaku-pools'
import type { DanmakuPoolId } from '../lib/danmaku-pools'
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
  /** Bottom offset so desktop panel sits above player controls */
  bottomOffset?: number
  /**
   * chrome layout — mobile gets a compact bottom sheet;
   * desktop keeps the floating side card. Defaults to desktop.
   */
  layout?: PointerMode
}

const TABS = [
  ['search', '搜索'],
  ['settings', '弹幕'],
  ['import', '导入'],
] as const

export function DanmakuPanel(props: Props) {
  if (!props.open) return null

  const layout = props.layout ?? 'desktop'
  if (layout === 'mobile') {
    if (typeof document !== 'undefined') {
      const portalTarget =
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        document.body
      return createPortal(<MobileSheet {...props} />, portalTarget)
    }
    return <MobileSheet {...props} />
  }
  return <DesktopCard {...props} />
}

/* ─── Desktop floating card (unchanged interaction model) ─── */

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
      className="kz-danmaku-panel kz-danmaku-panel--desktop absolute z-[85] flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/95 text-[var(--kz-fg)] shadow-2xl backdrop-blur-2xl"
      style={{
        maxHeight: 'min(26rem, calc(100dvh - 6rem))',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="弹幕面板"
      data-player-chrome
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--kz-border)] px-3 py-2 bg-[var(--kz-bg-soft)]/60">
        <div className="flex gap-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-active={tab === id}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors data-[active=true]:bg-[var(--kz-accent)] data-[active=true]:text-white data-[active=true]:shadow-sm data-[active=false]:text-[var(--kz-fg-muted)] data-[active=false]:hover:bg-[var(--kz-bg-soft)] data-[active=false]:hover:text-[var(--kz-fg)] border-0 bg-transparent cursor-pointer"
              onClick={() => onTabChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-soft)] hover:text-[var(--kz-fg)] transition-colors border-0 bg-transparent cursor-pointer"
          aria-label="关闭弹幕面板"
        >
          ✕
        </button>
      </div>

      <div className="kz-danmaku-panel-body flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--kz-border)] px-3 py-2 text-xs leading-snug text-[var(--kz-fg-muted)] bg-[var(--kz-bg-soft)]/30">
          {status || '—'}
          {commentsCount > 0 ? (
            <span className="ml-2 text-[var(--kz-accent)] font-medium">
              · 共 {commentsCount} 条
              {shown !== commentsCount ? ` · 显示 ${shown}` : ''}
            </span>
          ) : null}
        </div>
        <div className="kz-danmaku-panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 text-sm text-[var(--kz-fg)]">
          {tab === 'search' && <SearchTab {...props} compact={false} />}
          {tab === 'settings' && (
            <SettingsTab
              danmaku={danmaku}
              onDanmakuChange={onDanmakuChange}
              compact={false}
            />
          )}
          {tab === 'import' && <ImportTab {...props} compact={false} />}
        </div>
      </div>

      <SourcesFooter sources={sources} onToggleSource={onToggleSource} compact={false} />
    </div>
  )
}

/* ─── Mobile bottom sheet / right drawer: dense, touch-first ─── */

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

  return (
    <>
      {/* Fullscreen dimmed backdrop — tap closes */}
      <button
        type="button"
        className="fixed inset-0 z-[99998] bg-black/65 backdrop-blur-sm cursor-pointer border-0 p-0 m-0 animate-in fade-in duration-150"
        aria-label="关闭弹幕面板"
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {/* Bottom Sheet (Portrait) / Right Drawer (Landscape) */}
      <div
        className="fixed inset-x-0 bottom-0 z-[99999] flex flex-col max-h-[82dvh] w-full rounded-t-3xl border-t border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/98 text-[var(--kz-fg)] backdrop-blur-2xl shadow-2xl overflow-hidden pb-safe animate-in slide-in-from-bottom duration-200 pointer-events-auto landscape:fixed landscape:right-0 landscape:top-0 landscape:bottom-0 landscape:left-auto landscape:w-88 landscape:max-w-[85vw] landscape:h-full landscape:max-h-full landscape:rounded-l-2xl landscape:rounded-r-none landscape:border-l landscape:border-t-0 landscape:slide-in-from-right"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="弹幕面板"
        data-player-chrome
      >
        {/* Top drag handle indicator (portrait only) */}
        <div className="w-10 h-1 rounded-full bg-[var(--kz-border)] hover:bg-[var(--kz-fg-muted)] mx-auto mt-2.5 mb-1 shrink-0 landscape:hidden transition-colors" />

        {/* Header with Segmented Tabs & Close */}
        <div className="flex items-center gap-2 px-3.5 py-2 shrink-0 border-b border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60">
          <div className="flex-1 flex gap-1 p-1 rounded-xl bg-[var(--kz-bg)] border border-[var(--kz-border)] min-w-0" role="tablist">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => onTabChange(id)}
                className={
                  tab === id
                    ? 'flex-1 h-7.5 rounded-lg text-xs font-bold bg-[var(--kz-accent)] text-white shadow-md transition-all border-0 cursor-pointer'
                    : 'flex-1 h-7.5 rounded-lg text-xs font-semibold text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] transition-all border-0 bg-transparent cursor-pointer'
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] rounded-xl hover:bg-[var(--kz-bg-soft)] active:scale-95 transition-colors text-sm border-0 bg-transparent cursor-pointer shrink-0"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Sub-header status & total count bar */}
        <div className="shrink-0 flex items-center justify-between border-b border-[var(--kz-border)] px-4 py-1.5 text-xs text-[var(--kz-fg-muted)] bg-[var(--kz-bg-soft)]/30">
          <span className="truncate min-w-0 flex-1">{status || '—'}</span>
          {commentsCount > 0 && (
            <span className="shrink-0 ml-2 font-semibold text-[var(--kz-accent)]">
              共 {commentsCount} 条{shown !== commentsCount ? ` · 显示 ${shown}` : ''}
            </span>
          )}
        </div>

        {/* Scrollable Tab Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5 text-sm text-[var(--kz-fg)]">
          {tab === 'search' && <SearchTab {...props} compact />}
          {tab === 'settings' && (
            <SettingsTab
              danmaku={danmaku}
              onDanmakuChange={onDanmakuChange}
              compact
            />
          )}
          {tab === 'import' && <ImportTab {...props} compact />}
        </div>

        {/* Multi-source chips footer */}
        <SourcesFooter sources={sources} onToggleSource={onToggleSource} compact={true} />
      </div>
    </>
  )
}

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
          ? 'kz-danmaku-panel-sources shrink-0 border-t border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/70 px-4 py-2.5 text-[var(--kz-fg-muted)]'
          : 'kz-danmaku-panel-sources shrink-0 border-t border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60 px-3 py-2 text-[var(--kz-fg-muted)]'
      }
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-[var(--kz-fg-muted)]">弹幕源（点击切换）</span>
        {compact && <span className="text-[10px] text-[var(--kz-fg-dim)]">多源自动合并</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {loaded.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggleSource(s.id)}
            title={
              s.enabled
                ? `点击关闭「${s.label}」${s.meta ? ` · ${s.meta}` : ''}`
                : `点击显示「${s.label}」${s.meta ? ` · ${s.meta}` : ''}`
            }
            className={clsx(
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer border active:scale-95 flex items-center gap-1',
              s.enabled
                ? 'bg-[var(--kz-accent-soft)] border-[var(--kz-accent)] text-[var(--kz-accent)] shadow-sm'
                : 'bg-[var(--kz-bg-soft)] border-[var(--kz-border)] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]'
            )}
          >
            <span>{s.label}</span>
            <span className="opacity-80 font-bold">
              {s.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Custom Select component (Lock 100% width, no OS popup overflow) ─── */

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
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocDismiss = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('click', onDocDismiss, true)
    window.addEventListener('pointerdown', onDocDismiss, true)
    return () => {
      window.removeEventListener('click', onDocDismiss, true)
      window.removeEventListener('pointerdown', onDocDismiss, true)
    }
  }, [open])

  const selectedOpt = options.find((o) => o.value === value)

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full h-8.5 px-3 rounded-lg bg-[var(--kz-bg-soft)] border border-[var(--kz-border)] text-[var(--kz-fg)] text-xs font-medium outline-none hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] active:scale-[0.99] transition-all cursor-pointer text-left"
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

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[100000] max-h-36 overflow-y-auto overscroll-contain py-1 rounded-xl bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)] shadow-2xl backdrop-blur-xl animate-in fade-in-50 duration-100">
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
                {active && <span className="ml-2 text-xs text-[var(--kz-accent)]">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Tab bodies ─── */

function SearchTab({ compact, ...props }: Props & { compact: boolean }) {
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-[var(--kz-bg-soft)] border border-[var(--kz-border)] text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)] transition-colors"
            value={props.keyword}
            onChange={(e) => props.onKeywordChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onSearch()
            }}
            placeholder="搜索弹弹play 番名…"
            enterKeyHint="search"
          />
          <button
            type="button"
            disabled={props.searchBusy}
            onClick={props.onSearch}
            className="h-9 px-4 rounded-xl bg-[var(--kz-accent)] text-white text-xs font-semibold hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 transition-all border-0 cursor-pointer shadow-sm"
          >
            {props.searchBusy ? '…' : '搜索'}
          </button>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-[var(--kz-fg-muted)]">匹配番剧</span>
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

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-[var(--kz-fg-muted)]">匹配章节</span>
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

        <p className="text-[11px] leading-relaxed text-[var(--kz-fg-muted)]">
          弹弹play 匹配后写入「弹弹」源。可在面板底部开关各源，或在「导入」中追加 B 站/本地 XML 弹幕。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <label className="block space-y-1">
        <span className="text-xs text-[var(--kz-fg-muted)]">弹弹play 番名</span>
        <div className="flex gap-2">
          <input
            className="w-full rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2.5 py-1.5 text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)]"
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
            className="shrink-0 rounded-lg bg-[var(--kz-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--kz-accent-hover)] disabled:opacity-50 border-0 cursor-pointer"
          >
            {props.searchBusy ? '…' : '搜索'}
          </button>
        </div>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-[var(--kz-fg-muted)]">番剧</span>
        <CustomSelect
          value={props.animeId}
          placeholder="选择番剧…"
          options={props.animes.map((a) => ({
            value: a.animeId,
            label: `${a.animeTitle}${a.typeDescription ? ` (${a.typeDescription})` : ''}`,
          }))}
          onChange={(val) => props.onAnimeChange(val as number)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-[var(--kz-fg-muted)]">章节</span>
        <CustomSelect
          value={props.episodeId}
          placeholder="选择章节…"
          options={props.episodes.map((ep) => ({
            value: ep.episodeId,
            label: ep.episodeTitle,
          }))}
          onChange={(val) => props.onEpisodeChange(val as number)}
        />
      </label>

      <p className="text-[11px] leading-relaxed text-[var(--kz-fg-muted)]">
        弹弹play 匹配会写入「弹弹」源。B 站 / XML 导入默认追加，不会覆盖弹弹；可在面板底部开关各源。
      </p>
    </div>
  )
}

function SettingsTab({
  danmaku,
  onDanmakuChange,
  compact,
}: {
  danmaku: DanmakuSettings
  onDanmakuChange: (partial: Partial<DanmakuSettings>) => void
  compact: boolean
}) {
  if (compact) {
    return (
      <div className="space-y-3">
        {/* Switch Card: 显示弹幕 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onDanmakuChange({ enabled: !danmaku.enabled })}
          className="flex items-center justify-between p-3 rounded-2xl bg-[var(--kz-bg-soft)]/60 border border-[var(--kz-border)] cursor-pointer select-none active:scale-[0.99] transition-all"
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[var(--kz-fg)]">显示弹幕</span>
            <span className="text-[10px] text-[var(--kz-fg-muted)]">开启后在屏幕上浮动显示弹幕</span>
          </div>
          <div
            className={clsx(
              'w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0',
              danmaku.enabled ? 'bg-[var(--kz-accent)]' : 'bg-[var(--kz-border)]'
            )}
          >
            <div
              className={clsx(
                'w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                danmaku.enabled ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </div>
        </div>

        {/* Switch Card: 弹幕精简 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onDanmakuChange({ simplify: !danmaku.simplify })}
          className="flex items-center justify-between p-3 rounded-2xl bg-[var(--kz-bg-soft)]/60 border border-[var(--kz-border)] cursor-pointer select-none active:scale-[0.99] transition-all"
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[var(--kz-fg)]">弹幕精简</span>
            <span className="text-[10px] text-[var(--kz-fg-muted)]">智能合并连续复读与刷屏 (xN)</span>
          </div>
          <div
            className={clsx(
              'w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0',
              danmaku.simplify ? 'bg-[var(--kz-accent)]' : 'bg-[var(--kz-border)]'
            )}
          >
            <div
              className={clsx(
                'w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                danmaku.simplify ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </div>
        </div>

        {/* 4 Range Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <RangeRow
            label="透明度"
            value={danmaku.opacity}
            min={0.1}
            max={1}
            step={0.05}
            display={`${Math.round(danmaku.opacity * 100)}%`}
            onChange={(v) => onDanmakuChange({ opacity: v })}
            compact
          />
          <RangeRow
            label="字号"
            value={danmaku.fontSize}
            min={0.5}
            max={2}
            step={0.05}
            display={`${danmaku.fontSize.toFixed(2)}×`}
            onChange={(v) => onDanmakuChange({ fontSize: v })}
            compact
          />
          <RangeRow
            label="速度"
            value={danmaku.speed}
            min={0.5}
            max={2}
            step={0.05}
            display={`${danmaku.speed.toFixed(2)}×`}
            onChange={(v) => onDanmakuChange({ speed: v })}
            compact
          />
          <RangeRow
            label="显示区域"
            value={danmaku.area}
            min={0.2}
            max={1}
            step={0.05}
            display={`${Math.round(danmaku.area * 100)}%`}
            onChange={(v) => onDanmakuChange({ area: v })}
            compact
          />
        </div>

        {/* Time Offset Card */}
        <div className="p-2.5 rounded-2xl bg-[var(--kz-bg-soft)]/50 border border-[var(--kz-border)]/70 flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--kz-fg)]">时间偏移</span>
            <span className="text-[10px] text-[var(--kz-fg-muted)]">正数延后，负数提前</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDanmakuChange({ timeOffset: Number(((danmaku.timeOffset || 0) - 0.5).toFixed(1)) })}
              className="h-7 px-2.5 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)] text-xs font-bold text-[var(--kz-fg)] active:scale-95 transition-all cursor-pointer"
            >
              -0.5s
            </button>
            <input
              type="number"
              step={0.5}
              inputMode="decimal"
              value={danmaku.timeOffset || 0}
              onChange={(e) => onDanmakuChange({ timeOffset: Number(e.target.value) || 0 })}
              className="w-14 h-7 text-center rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)] text-xs font-bold text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] tabular-nums"
            />
            <button
              type="button"
              onClick={() => onDanmakuChange({ timeOffset: Number(((danmaku.timeOffset || 0) + 0.5).toFixed(1)) })}
              className="h-7 px-2.5 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)] text-xs font-bold text-[var(--kz-fg)] active:scale-95 transition-all cursor-pointer"
            >
              +0.5s
            </button>
          </div>
        </div>

        {/* Type Filter Chips */}
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              ['showScroll', '滚动'],
              ['showTop', '顶部'],
              ['showBottom', '底部'],
              ['showColor', '彩色'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onDanmakuChange({ [key]: !danmaku[key] })}
              className={clsx(
                'h-8 rounded-xl text-xs font-bold transition-all border cursor-pointer active:scale-95 flex items-center justify-center',
                danmaku[key]
                  ? 'bg-[var(--kz-accent)] text-white border-[var(--kz-accent)] shadow-sm'
                  : 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)] border-[var(--kz-border)] hover:text-[var(--kz-fg)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-2 text-[var(--kz-fg)] cursor-pointer">
        <span>显示弹幕 (D)</span>
        <input
          type="checkbox"
          checked={danmaku.enabled}
          onChange={(e) => onDanmakuChange({ enabled: e.target.checked })}
        />
      </label>

      <label className="flex items-center justify-between gap-2 text-[var(--kz-fg)] cursor-pointer">
        <div className="flex flex-col">
          <span>弹幕精简 (合并刷屏)</span>
          <span className="text-[11px] text-[var(--kz-fg-muted)]">
            智能合并相邻重复弹幕并显示次数 (xN)
          </span>
        </div>
        <input
          type="checkbox"
          checked={Boolean(danmaku.simplify)}
          onChange={(e) => onDanmakuChange({ simplify: e.target.checked })}
        />
      </label>

      <RangeRow
        label="透明度"
        value={danmaku.opacity}
        min={0.1}
        max={1}
        step={0.05}
        display={`${Math.round(danmaku.opacity * 100)}%`}
        onChange={(v) => onDanmakuChange({ opacity: v })}
        compact={false}
      />
      <RangeRow
        label="字号"
        value={danmaku.fontSize}
        min={0.5}
        max={2}
        step={0.05}
        display={`${danmaku.fontSize.toFixed(2)}×`}
        onChange={(v) => onDanmakuChange({ fontSize: v })}
        compact={false}
      />
      <RangeRow
        label="速度"
        value={danmaku.speed}
        min={0.5}
        max={2}
        step={0.05}
        display={`${danmaku.speed.toFixed(2)}×`}
        onChange={(v) => onDanmakuChange({ speed: v })}
        compact={false}
      />
      <RangeRow
        label="显示区域"
        value={danmaku.area}
        min={0.2}
        max={1}
        step={0.05}
        display={`${Math.round(danmaku.area * 100)}%`}
        onChange={(v) => onDanmakuChange({ area: v })}
        compact={false}
      />
      <label className="flex items-center justify-between gap-2 text-[var(--kz-fg)]">
        <span>时间偏移 (秒)</span>
        <input
          type="number"
          step={0.5}
          value={danmaku.timeOffset}
          onChange={(e) =>
            onDanmakuChange({ timeOffset: Number(e.target.value) || 0 })
          }
          className="w-20 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2 py-1 text-right text-sm text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)]"
        />
      </label>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--kz-fg-muted)]">
        {(
          [
            ['showScroll', '滚动'],
            ['showTop', '顶部'],
            ['showBottom', '底部'],
            ['showColor', '彩色'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 cursor-pointer text-[var(--kz-fg)]">
            <input
              type="checkbox"
              checked={danmaku[key]}
              onChange={(e) => onDanmakuChange({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  )
}

function ImportTab({ compact, ...props }: Props & { compact: boolean }) {
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-2xl bg-[var(--kz-bg-soft)]/50 border border-[var(--kz-border)]/70 space-y-2">
          <div className="text-xs font-semibold text-[var(--kz-fg)]">B 站 BV 号 / 视频链接</div>
          <input
            className="w-full h-8.5 px-3 rounded-xl bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)] text-xs text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)] transition-colors"
            value={props.bvInput}
            onChange={(e) => props.onBvInputChange(e.target.value)}
            placeholder="BV1… 或完整链接"
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onLoadBilibili()
            }}
          />
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--kz-fg-muted)]">分P</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={props.bvPage}
                onChange={(e) =>
                  props.onBvPageChange(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-14 h-7.5 px-1.5 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)] text-[var(--kz-fg)] text-center text-xs font-bold outline-none focus:border-[var(--kz-accent)]"
              />
            </div>
            <button
              type="button"
              disabled={props.bilibiliBusy}
              onClick={props.onLoadBilibili}
              className="h-7.5 px-3 rounded-lg bg-[var(--kz-accent)] text-white text-xs font-semibold hover:bg-[var(--kz-accent-hover)] active:scale-95 transition-all cursor-pointer border-0 shadow-sm disabled:opacity-50"
            >
              {props.bilibiliBusy ? '拉取中…' : '追加 B 站弹幕'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={props.onPickXmlFile}
          className="flex items-center justify-between gap-2 w-full p-3 rounded-2xl bg-[var(--kz-bg-soft)]/50 border border-dashed border-[var(--kz-border)] text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-[0.99] transition-all cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📁</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold">导入本地 XML 弹幕</span>
              <span className="text-[10px] text-[var(--kz-fg-muted)]">支持 B 站 / pakku 导出的 XML 文件</span>
            </div>
          </div>
          <span className="text-xs text-[var(--kz-accent)] font-semibold">选择文件 →</span>
        </button>

        <div className="p-3 rounded-2xl bg-[var(--kz-bg-soft)]/50 border border-[var(--kz-border)]/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--kz-fg)]">屏蔽词过滤</span>
            <span className="text-[10px] text-[var(--kz-fg-muted)]">{props.danmaku.filters.length} 条已生效</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 min-w-0 h-8 px-2.5 rounded-xl bg-[var(--kz-bg-elevated)] border border-[var(--kz-border)] text-[var(--kz-fg)] text-xs outline-none focus:border-[var(--kz-accent)] placeholder:text-[var(--kz-fg-muted)]"
              value={props.filterDraft}
              onChange={(e) => props.onFilterDraftChange(e.target.value)}
              placeholder="输入关键词 或 /正则表达式/"
              onKeyDown={(e) => {
                if (e.key === 'Enter') props.onAddFilter()
              }}
            />
            <button
              type="button"
              onClick={props.onAddFilter}
              className="h-8 px-3 rounded-xl bg-[var(--kz-accent)] text-white text-xs font-semibold hover:bg-[var(--kz-accent-hover)] active:scale-95 transition-all cursor-pointer border-0 shrink-0"
            >
              添加
            </button>
          </div>
          {props.danmaku.filters.length > 0 && (
            <ul className="max-h-28 space-y-1 overflow-y-auto m-0 p-0 list-none">
              {props.danmaku.filters.map((rule) => (
                <li
                  key={rule}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--kz-bg-elevated)] px-2.5 py-1 text-xs text-[var(--kz-fg)]"
                >
                  <span className="truncate font-mono text-[var(--kz-fg)] text-[11px]">{rule}</span>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300 active:scale-90 border-0 bg-transparent cursor-pointer font-bold px-1"
                    onClick={() => props.onRemoveFilter(rule)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-xs text-[var(--kz-fg-muted)]">Bilibili BV 号 / 链接</div>
        <input
          className="w-full rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2.5 py-1.5 text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)]"
          value={props.bvInput}
          onChange={(e) => props.onBvInputChange(e.target.value)}
          placeholder="BV1… 或完整视频链接"
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onLoadBilibili()
          }}
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-[var(--kz-fg-muted)]">
            分P
            <input
              type="number"
              min={1}
              value={props.bvPage}
              onChange={(e) =>
                props.onBvPageChange(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-14 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2 py-1 text-sm text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] text-center"
            />
          </label>
          <button
            type="button"
            disabled={props.bilibiliBusy}
            onClick={props.onLoadBilibili}
            className="rounded-lg bg-[var(--kz-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--kz-accent-hover)] disabled:opacity-50 border-0 cursor-pointer"
          >
            {props.bilibiliBusy ? '拉取中…' : '追加 B 站弹幕'}
          </button>
        </div>
        <p className="text-[11px] text-[var(--kz-fg-muted)]">
          默认追加到现有弹幕，不会清空弹弹源。
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs text-[var(--kz-fg-muted)]">本地弹幕文件</div>
        <button
          type="button"
          onClick={props.onPickXmlFile}
          className="w-full rounded-lg border border-dashed border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-3 py-3 text-xs text-[var(--kz-fg)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] transition-all cursor-pointer text-left"
        >
          选择 XML（B 站 / pakku 导出）
          <div className="mt-1 text-[11px] text-[var(--kz-fg-muted)]">
            默认追加 · 也可把 .xml 拖到播放器上
          </div>
        </button>
      </div>

      <div className="space-y-1.5 border-t border-[var(--kz-border)] pt-2">
        <div className="text-xs text-[var(--kz-fg-muted)]">
          屏蔽词（支持 /正则/）· {props.danmaku.filters.length} 条
        </div>
        <div className="flex gap-2">
          <input
            className="w-full rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2.5 py-1.5 text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-muted)] outline-none focus:border-[var(--kz-accent)]"
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
            className="shrink-0 rounded-lg bg-[var(--kz-accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--kz-accent-hover)] border-0 cursor-pointer"
          >
            添加
          </button>
        </div>
        {props.danmaku.filters.length > 0 && (
          <ul className="max-h-28 space-y-1 overflow-y-auto m-0 p-0 list-none">
            {props.danmaku.filters.map((rule) => (
              <li
                key={rule}
                className="flex items-center justify-between gap-2 rounded-md bg-[var(--kz-bg-soft)] px-2 py-1 text-xs text-[var(--kz-fg)]"
              >
                <span className="truncate font-mono text-[var(--kz-fg)]">{rule}</span>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300 border-0 bg-transparent cursor-pointer font-bold"
                  onClick={() => props.onRemoveFilter(rule)}
                >
                  删
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  compact,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
  compact: boolean
}) {
  if (compact) {
    return (
      <div className="p-2.5 rounded-2xl bg-[var(--kz-bg-soft)]/50 border border-[var(--kz-border)]/70 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--kz-fg)]">{label}</span>
          <span className="font-bold tabular-nums text-[var(--kz-accent)] text-xs">{display}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-5 appearance-none bg-transparent cursor-pointer accent-[var(--kz-accent)]"
        />
      </div>
    )
  }

  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs text-[var(--kz-fg-muted)]">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--kz-accent)] font-semibold">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--kz-bg-soft)] accent-[var(--kz-accent)]"
      />
    </label>
  )
}
