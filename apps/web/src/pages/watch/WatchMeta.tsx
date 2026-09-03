import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  CollectType,
  CollectTypeLabel,
  airProgressLabel,
  bangumiSubjectUrl,
  coverOf,
  estimateAirProgress,
  formatDoingCount,
  type BangumiItem,
} from '@animaku/shared'

/**
 * Collapsed mobile bar — keep text-xs + py-2 so height stays aligned with
 * the 弹幕 status strip (behavior constraint; do not inflate padding).
 */
const META_BAR =
  'kz-watch-panel flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs font-normal leading-none text-[var(--kz-fg-muted)] transition hover:bg-[var(--kz-bg-hover)]'
const META_TOGGLE =
  'kz-watch-panel-action shrink-0 text-xs hover:underline'

function airChipClass(
  status: ReturnType<typeof estimateAirProgress>['status'],
): string {
  switch (status) {
    case 'finished':
      return 'kz-watch-chip kz-watch-chip-air-finished'
    case 'airing':
      return 'kz-watch-chip kz-watch-chip-air-airing'
    case 'upcoming':
      return 'kz-watch-chip kz-watch-chip-air-upcoming'
    default:
      return 'kz-watch-chip'
  }
}

function MetaCover({
  item,
  className,
  width,
  height,
  priority,
  size = 'thumb',
}: {
  item: BangumiItem
  className: string
  width: number
  height: number
  priority?: boolean
  size?: 'thumb' | 'large'
}) {
  const src = coverOf(item, size)
  if (!src) return null

  const img = (
    <img
      src={src}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'low' : undefined}
      width={width}
      height={height}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  )

  if (item.id > 0) {
    return (
      <a
        href={bangumiSubjectUrl(item.id)}
        target="_blank"
        rel="noopener noreferrer"
        title={`在 Bangumi 查看「${item.nameCn || item.name}」页面`}
        className={`group relative block shrink-0 overflow-hidden bg-[var(--kz-bg-soft)] shadow-sm ring-1 ring-[var(--kz-border)] transition hover:ring-2 hover:ring-[var(--kz-accent)] ${className}`}
      >
        {img}
      </a>
    )
  }

  return (
    <div
      className={`shrink-0 overflow-hidden bg-[var(--kz-bg-soft)] shadow-sm ring-1 ring-[var(--kz-border)] ${className}`}
    >
      {img}
    </div>
  )
}

function MetaChips({ item }: { item: BangumiItem }) {
  const airLabel = airProgressLabel(item)
  const air = estimateAirProgress(item)
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.ratingScore > 0 && (
        <span className="kz-watch-chip kz-watch-chip-score tabular-nums">
          ★ {item.ratingScore.toFixed(1)}
        </span>
      )}
      {Boolean(item.doing && item.doing > 0) && (
        <span className="kz-watch-chip tabular-nums text-amber-500/90 dark:text-amber-400">
          {formatDoingCount(item.doing)} 在看
        </span>
      )}
      {airLabel && (
        <span className={airChipClass(air.status)}>{airLabel}</span>
      )}
      {item.airDate && <span className="kz-watch-chip">{item.airDate}</span>}
      {item.tags?.slice(0, 6).map((t) => (
        <span key={t.name} className="kz-watch-chip max-w-[8rem] truncate">
          {t.name}
        </span>
      ))}
    </div>
  )
}

function MetaSubline({
  pluginName,
  episodeLabel,
  mediaHint,
  className = 'truncate text-[13px] text-[var(--kz-fg-muted)]',
}: {
  pluginName?: string
  episodeLabel?: string | null
  mediaHint?: string | null
  className?: string
}) {
  const parts: string[] = []
  if (pluginName) parts.push(pluginName)
  else parts.push('未选源')
  if (episodeLabel) parts.push(episodeLabel)
  if (mediaHint) parts.push(mediaHint)
  return <p className={className}>{parts.join(' · ')}</p>
}

interface CollectOptionMeta {
  label: string
  sublabel: string
  icon: (cls?: string) => React.ReactNode
  badgeClass: string
  activeOptionClass: string
}

const COLLECT_CONFIG: Record<CollectType, CollectOptionMeta> = {
  [CollectType.watching]: {
    label: '在看',
    sublabel: '追更中',
    icon: (cls = 'w-3 h-3') => (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <polygon points="6 4 20 12 6 20 6 4" />
      </svg>
    ),
    badgeClass: 'bg-[var(--kz-accent)]/12 text-[var(--kz-accent)] border-[var(--kz-accent)]/30 hover:bg-[var(--kz-accent)]/20',
    activeOptionClass: 'text-[var(--kz-accent)] bg-[var(--kz-accent)]/10 font-medium',
  },
  [CollectType.planToWatch]: {
    label: '想看',
    sublabel: '计划看',
    icon: (cls = 'w-3 h-3') => (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    badgeClass: 'bg-amber-500/12 text-amber-500 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
    activeOptionClass: 'text-amber-500 dark:text-amber-400 bg-amber-500/10 font-medium',
  },
  [CollectType.watched]: {
    label: '看过',
    sublabel: '已补完',
    icon: (cls = 'w-3 h-3') => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    badgeClass: 'bg-emerald-500/12 text-emerald-500 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
    activeOptionClass: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 font-medium',
  },
  [CollectType.onHold]: {
    label: '搁置',
    sublabel: '稍后看',
    icon: (cls = 'w-3 h-3') => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="9" y1="5" x2="9" y2="19" />
        <line x1="15" y1="5" x2="15" y2="19" />
      </svg>
    ),
    badgeClass: 'bg-purple-500/12 text-purple-500 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/20',
    activeOptionClass: 'text-purple-500 dark:text-purple-400 bg-purple-500/10 font-medium',
  },
  [CollectType.abandoned]: {
    label: '抛弃',
    sublabel: '弃番',
    icon: (cls = 'w-3 h-3') => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    badgeClass: 'bg-rose-500/12 text-rose-500 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
    activeOptionClass: 'text-rose-500 dark:text-rose-400 bg-rose-500/10 font-medium',
  },
  [CollectType.none]: {
    label: '未收藏',
    sublabel: '未加入',
    icon: (cls = 'w-3 h-3') => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
    badgeClass: 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)] border-[var(--kz-border)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)]',
    activeOptionClass: 'text-[var(--kz-fg-muted)]',
  },
}

function CollectControl({
  token,
  collectType,
  collectOptions,
  onCollectChange,
  collectPending: _pending,
  compact: _compact,
}: {
  token: string
  collectType: CollectType
  collectOptions: CollectType[]
  onCollectChange: (t: CollectType) => void
  collectPending?: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!token) {
    return (
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/60 px-2 py-0.5 text-xs text-[var(--kz-fg-muted)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] transition-colors leading-none"
      >
        <span>+ 登录同步追番</span>
      </Link>
    )
  }

  const currentConfig = COLLECT_CONFIG[collectType] || COLLECT_CONFIG[CollectType.none]
  const isCollected = collectType !== CollectType.none

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={clsx(
          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-normal transition-all duration-150 shadow-xs select-none cursor-pointer active:scale-95 leading-none',
          currentConfig.badgeClass,
          open && 'ring-1.5 ring-[var(--kz-accent)]/30',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="设置 Bangumi 追番状态"
      >
        <span className="shrink-0">{currentConfig.icon('h-3 w-3')}</span>
        <span>{isCollected ? currentConfig.label : '追番'}</span>
        <svg
          className={clsx(
            'h-2.5 w-2.5 shrink-0 opacity-60 transition-transform duration-200 ml-0.5',
            open && 'rotate-180',
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[8.5rem] overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-1 shadow-lg backdrop-blur-xl"
        >
          <div className="space-y-0.5">
            {collectOptions.map((t) => {
              const opt = COLLECT_CONFIG[t]
              const isSelected = collectType === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onCollectChange(t)
                    setOpen(false)
                  }}
                  className={clsx(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all cursor-pointer select-none',
                    isSelected
                      ? opt.activeOptionClass
                      : 'text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)]',
                  )}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={clsx(
                        'shrink-0 rounded p-1 transition-colors',
                        isSelected ? 'bg-current/15' : 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)]',
                      )}
                    >
                      {opt.icon('h-3 w-3')}
                    </span>
                    <span className="font-medium text-xs leading-none">{opt.label}</span>
                  </div>
                  {isSelected && (
                    <span className="shrink-0 text-xs font-bold mr-0.5">✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function WatchMeta({
  item,
  title,
  pluginName,
  episodeLabel,
  mediaHint,
  summaryOpen,
  onToggleSummary,
  token,
  collectType,
  collectOptions,
  onCollectChange,
  collectPending,
  compact,
  /** Mobile: whole card collapsed to brief bar until expanded */
  metaOpen = true,
  onToggleMeta,
}: {
  item: BangumiItem | null | undefined
  title: string
  pluginName?: string
  episodeLabel?: string | null
  mediaHint?: string | null
  summaryOpen: boolean
  onToggleSummary: () => void
  token: string
  collectType: CollectType
  collectOptions: CollectType[]
  onCollectChange: (t: CollectType) => void
  collectPending?: boolean
  /** Mobile layout: enable bar-style collapsed chrome */
  compact?: boolean
  metaOpen?: boolean
  onToggleMeta?: () => void
}) {
  /* Mobile collapsed — height locked to 弹幕 bar (xs + py-2) */
  if (compact && !metaOpen) {
    return (
      <div className="kz-watch-meta">
        <button
          type="button"
          onClick={onToggleMeta}
          className={META_BAR}
          aria-expanded={false}
        >
          <span
            className="h-3 w-0.5 shrink-0 rounded-full bg-[var(--kz-accent)]/70"
            aria-hidden
          />
          <span className="kz-watch-panel-title">简介</span>
          <span className="min-w-0 flex-1 truncate text-xs font-normal text-[var(--kz-fg)]">
            {title}
            {(episodeLabel || pluginName || mediaHint) && (
              <span className="text-xs font-normal text-[var(--kz-fg-muted)]">
                {' · '}
                {[episodeLabel, pluginName, mediaHint]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </span>
          <span className={META_TOGGLE}>展开</span>
        </button>
      </div>
    )
  }

  /* Mobile expanded */
  if (compact) {
    return (
      <div className="kz-watch-meta kz-watch-panel space-y-2.5 px-3 py-2.5 text-[var(--kz-fg-muted)]">
        <div className="flex items-start gap-2.5">
          {item && (
            <MetaCover
              item={item}
              className="h-16 w-12 rounded-lg"
              width={48}
              height={64}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start gap-2">
              <h1 className="min-w-0 flex-1 text-sm font-semibold leading-snug tracking-tight text-[var(--kz-fg)]">
                {title}
              </h1>
              {onToggleMeta ? (
                <button
                  type="button"
                  onClick={onToggleMeta}
                  className={META_TOGGLE}
                  aria-expanded={true}
                >
                  收起
                </button>
              ) : null}
            </div>
            {item?.nameCn && item.name && item.nameCn !== item.name && (
              <p className="truncate text-xs text-[var(--kz-fg-muted)]">
                {item.name}
              </p>
            )}
            <MetaSubline
              pluginName={pluginName}
              episodeLabel={episodeLabel}
              mediaHint={mediaHint}
              className="truncate text-xs text-[var(--kz-fg-muted)]"
            />
          </div>
        </div>

        {item && <MetaChips item={item} />}

        {item?.summary && (
          <div className="text-xs leading-relaxed text-[var(--kz-fg-muted)]">
            <p className={summaryOpen ? '' : 'line-clamp-2'}>{item.summary}</p>
            {item.summary.length > 60 && (
              <button
                type="button"
                className="mt-0.5 text-xs font-medium text-[var(--kz-accent)] hover:underline"
                onClick={onToggleSummary}
              >
                {summaryOpen ? '收起简介' : '展开简介'}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <CollectControl
            token={token}
            collectType={collectType}
            collectOptions={collectOptions}
            onCollectChange={onCollectChange}
            collectPending={collectPending}
            compact
          />
          {item?.alias && item.alias.length > 0 && (
            <span className="text-xs text-[var(--kz-fg-dim)]">
              别名 {item.alias.length} 个
            </span>
          )}
        </div>
      </div>
    )
  }

  /* Desktop — elevated meta card */
  return (
    <div className="kz-watch-meta kz-watch-panel flex gap-4 p-4 sm:gap-5 sm:p-5">
      {item && (
        <MetaCover
          item={item}
          className="h-[13rem] w-[9.75rem] rounded-xl sm:h-[14rem] sm:w-[10.5rem] sm:rounded-2xl lg:h-[15rem] lg:w-[11.25rem]"
          width={180}
          height={240}
          priority
          size="large"
        />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <h1 className="text-lg font-semibold leading-snug tracking-tight text-[var(--kz-fg)] sm:text-xl">
          {title}
        </h1>
        {item?.nameCn && item.name && item.nameCn !== item.name && (
          <p className="text-[13px] text-[var(--kz-fg-muted)]">{item.name}</p>
        )}
        <MetaSubline
          pluginName={pluginName}
          episodeLabel={episodeLabel}
          mediaHint={mediaHint}
        />
        {item && <MetaChips item={item} />}
        {item?.summary && (
          <div className="text-[13px] leading-relaxed text-[var(--kz-fg-muted)]">
            <p className={summaryOpen ? '' : 'line-clamp-3'}>{item.summary}</p>
            {item.summary.length > 80 && (
              <button
                type="button"
                className="mt-0.5 font-medium text-[var(--kz-accent)] hover:underline"
                onClick={onToggleSummary}
              >
                {summaryOpen ? '收起' : '展开'}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <CollectControl
            token={token}
            collectType={collectType}
            collectOptions={collectOptions}
            onCollectChange={onCollectChange}
            collectPending={collectPending}
          />
          {item?.alias && item.alias.length > 0 && (
            <span className="text-[11px] text-[var(--kz-fg-dim)]">
              别名 {item.alias.length} 个（可用于换关键词）
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
