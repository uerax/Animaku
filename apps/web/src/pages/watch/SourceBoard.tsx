import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type FormEvent,
  type MouseEvent,
  startTransition,
} from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import type { BangumiItem, PluginMeta, SearchItem } from '@animaku/shared'
import {
  useSourceAggregator,
  type AggregatedSourceState,
} from '../../lib/use-source-aggregator'
import type { SourceSelection } from '../../lib/use-watch-session'

export interface SourceBoardProps {
  bangumiId: number
  sourcesOpen: boolean
  onToggleSourcesOpen: () => void
  activePluginName: string
  activeEpisodeNumber?: number
  plugins: PluginMeta[]
  pluginOrder: string[]
  titleRefs: string[]
  bangumiItem?: BangumiItem | null
  defaultKeyword: string
  keywordOptions: string[]
  onSwitchSource: (plugin: PluginMeta, targetItem?: SearchItem) => void
  selection: SourceSelection | null
  pendingSource: { pluginName: string; src: string } | null
  roadLoading: boolean
  defaultSourceName: string
}

export function SourceBoard({
  bangumiId,
  sourcesOpen,
  onToggleSourcesOpen,
  activePluginName,
  activeEpisodeNumber,
  plugins,
  pluginOrder,
  titleRefs,
  bangumiItem,
  defaultKeyword,
  keywordOptions,
  onSwitchSource,
  selection,
  pendingSource,
  defaultSourceName,
}: SourceBoardProps) {
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const [cardKwInputs, setCardKwInputs] = useState<Record<string, string>>({})
  const [hoverTip, setHoverTip] = useState<{
    text: string
    x: number
    y: number
    isNearTop: boolean
  } | null>(null)
  const hoverTimerRef = useRef<number | null>(null)

  const showHoverTip = useCallback(
    (text: string, e: MouseEvent<HTMLElement>) => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current)
      }
      const rect = e.currentTarget.getBoundingClientRect()
      hoverTimerRef.current = window.setTimeout(() => {
        const isNearTop = rect.top < 45
        const y = isNearTop ? rect.bottom + 6 : rect.top - 6
        const x = Math.max(12, Math.min(window.innerWidth - 300, rect.left))
        setHoverTip({ text, x, y, isNearTop })
      }, 120)
    },
    [],
  )

  const hideHoverTip = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHoverTip(null)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current)
      }
    }
  }, [])

  const { sources, prioritizePlugin, reProbePlugin } = useSourceAggregator({
    bangumiId,
    plugins,
    pluginOrder,
    titleRefs,
    item: bangumiItem,
    defaultKeyword,
    isOpen: sourcesOpen,
    activePluginName,
    selection,
  })

  function handleCardKeywordSubmit(pluginName: string, e: FormEvent) {
    e.preventDefault()
    const kw = (cardKwInputs[pluginName] || '').trim()
    if (!kw) return
    reProbePlugin(pluginName, kw)
  }

  const sourcesTotal = plugins.length
  const sourcesReadyCount = Object.values(sources).filter(
    (s) => s.status === 'ready',
  ).length

  return (
    <section
      className={clsx(
        'kz-watch-panel shrink-0 overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-sm transition-all duration-300',
        sourcesOpen && 'kz-watch-sources',
      )}
    >
      {/* Header bar */}
      <button
        type="button"
        onClick={() => startTransition(onToggleSourcesOpen)}
        className="kz-bili-sec-head kz-bili-sec-head--btn flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--kz-bg-hover)]"
        aria-expanded={sourcesOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-xs sm:text-[13px] text-[var(--kz-fg)] tracking-tight flex items-center gap-1.5">
            视频源
            {sourcesTotal > 0 && (
              <span className="text-[11px] font-normal text-[var(--kz-fg-muted)]">
                ({sourcesReadyCount}/{sourcesTotal} 就绪)
              </span>
            )}
          </span>
          <span
            className="truncate text-[11px] text-[var(--kz-fg-muted)]"
            title={
              selection
                ? `${activePluginName || selection.plugin.name}${
                    activeEpisodeNumber ? ` · 第 ${activeEpisodeNumber} 集` : ''
                  }`
                : '点选源切换'
            }
          >
            {selection
              ? `${activePluginName || selection.plugin.name}${
                  activeEpisodeNumber ? ` · 第 ${activeEpisodeNumber} 集` : ''
                }`
              : '点此展开多源'}
          </span>
        </div>

        <span className="kz-bili-sec-more text-[var(--kz-fg-muted)]" aria-hidden>
          <svg
            className={clsx(
              'kz-bili-chevron h-3.5 w-3.5 transition-transform duration-200',
              sourcesOpen && 'rotate-180',
            )}
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
        </span>
      </button>

      {/* Expanded body */}
      {sourcesOpen && (
        <div className="border-t border-[var(--kz-border-subtle)] px-2.5 py-2.5 space-y-2">
          {/* Sources List */}
          <div className="flex flex-col gap-1.5">
            {!plugins.length && (
              <div className="p-3 text-center text-xs text-[var(--kz-fg-muted)]">
                <p>没有启用的规则。请到设置中启用或导入。</p>
                <Link
                  to="/settings"
                  className="mt-1 inline-block font-medium text-[var(--kz-accent)] hover:underline"
                >
                  打开设置
                </Link>
              </div>
            )}

            {plugins.map((plugin) => {
              const state: AggregatedSourceState = sources[plugin.name] || {
                plugin,
                status: 'idle',
                items: [],
                searched: false,
              }

              const isActive =
                selection?.plugin.name.toLowerCase() ===
                plugin.name.toLowerCase()
              const isDefault =
                plugin.name.toLowerCase() === defaultSourceName.toLowerCase()
              const isPending =
                pendingSource?.pluginName.toLowerCase() ===
                plugin.name.toLowerCase()

              const isExpanded = expandedPlugin === plugin.name
              const matchedTitle = state.matchedItem?.name || state.binding?.title || ''

              return (
                <div
                  key={plugin.id || plugin.name}
                  className={clsx(
                    'group relative rounded-xl border transition-all duration-200 overflow-hidden',
                    isActive
                      ? 'border-[var(--kz-accent)] bg-[var(--kz-accent-soft)] shadow-xs'
                      : 'border-[var(--kz-border-subtle)] bg-[var(--kz-bg-elevated)] hover:border-[var(--kz-border)] hover:bg-[var(--kz-bg-hover)]',
                  )}
                >
                  {/* Card Main Row */}
                  <div
                    onClick={() => {
                      prioritizePlugin(plugin.name)
                      if (isActive) {
                        return
                      }
                      if (state.status === 'ready' && state.matchedItem) {
                        onSwitchSource(plugin, state.matchedItem)
                      } else if (state.status === 'needs_pick') {
                        setExpandedPlugin((cur) =>
                          cur === plugin.name ? null : plugin.name,
                        )
                      } else if (state.status === 'error' || state.status === 'empty') {
                        setExpandedPlugin((cur) =>
                          cur === plugin.name ? null : plugin.name,
                        )
                      } else {
                        onSwitchSource(plugin)
                      }
                    }}
                    className="flex w-full items-center gap-2.5 p-2 text-left cursor-pointer select-none"
                  >
                    {/* Avatar with Status Dot */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={clsx(
                          'flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold uppercase transition-colors',
                          isActive
                            ? 'bg-[var(--kz-accent)] text-white'
                            : 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)] border border-[var(--kz-border-subtle)]',
                        )}
                      >
                        {(plugin.name.trim().charAt(0) || '?').toUpperCase()}
                      </div>

                      {/* Status indicator dot */}
                      <span
                        className={clsx(
                          'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[var(--kz-bg-elevated)]',
                          state.status === 'ready' &&
                            'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.9)]',
                          state.status === 'needs_pick' &&
                            'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.9)]',
                          state.status === 'probing' &&
                            'bg-[var(--kz-accent)] animate-ping',
                          (state.status === 'empty' || state.status === 'error') &&
                            'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.7)]',
                          state.status === 'idle' && 'bg-[var(--kz-fg-dim)]',
                        )}
                      />
                    </div>

                    {/* Source Name & Sub Info */}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={clsx(
                            'truncate text-[12px] sm:text-[13px] font-semibold tracking-tight',
                            isActive ? 'text-[var(--kz-accent)]' : 'text-[var(--kz-fg)]',
                          )}
                        >
                          {plugin.name}
                        </span>

                        {isDefault && (
                          <span className="rounded bg-[var(--kz-bg-soft)] px-1.5 py-0.5 text-[9.5px] font-medium leading-none text-[var(--kz-fg-muted)] border border-[var(--kz-border-subtle)]">
                            默认
                          </span>
                        )}

                        {isActive && (
                          <span className="rounded bg-[var(--kz-accent)] px-1.5 py-0.5 text-[9.5px] font-medium leading-none text-white shadow-xs">
                            播放中
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 min-w-0 max-w-full text-[11px] leading-tight text-[var(--kz-fg-muted)]">
                        {state.status === 'probing' && (
                          <span className="flex items-center gap-1 text-[var(--kz-accent)] truncate">
                            <span className="inline-block h-1.5 w-1.5 animate-spin rounded-full border border-[var(--kz-accent)] border-t-transparent flex-shrink-0" />
                            探活中…
                          </span>
                        )}

                        {state.status === 'ready' && (
                          <span
                            className="truncate block"
                            title={matchedTitle || plugin.name}
                          >
                            {matchedTitle || plugin.name}
                          </span>
                        )}

                        {state.status === 'needs_pick' && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium truncate block">
                            搜到 {state.items.length} 条候选
                          </span>
                        )}

                        {state.status === 'empty' && (
                          <span className="text-[var(--kz-fg-dim)] truncate block">
                            未收录此番剧
                          </span>
                        )}

                        {state.status === 'error' && (
                          <span className="text-rose-500 dark:text-rose-400 truncate block">
                            {state.errorMsg || '源站超时'}
                          </span>
                        )}

                        {state.status === 'idle' && (
                          <span className="text-[var(--kz-fg-dim)] truncate block">
                            待探活 (点击探测)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Pill Button */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isPending ? (
                        <span className="kz-source-pill kz-source-pill--probing">
                          探活中
                        </span>
                      ) : isActive ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedPlugin((cur) =>
                              cur === plugin.name ? null : plugin.name,
                            )
                          }}
                          className="kz-source-pill kz-source-pill--active cursor-pointer"
                          title="点击展开当前源条目与换词"
                        >
                          当前
                        </button>
                      ) : state.status === 'ready' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedPlugin((cur) =>
                              cur === plugin.name ? null : plugin.name,
                            )
                          }}
                          className="kz-source-pill kz-source-pill--ready cursor-pointer"
                          title="点击展开条目列表与换词"
                        >
                          切换
                        </button>
                      ) : state.status === 'needs_pick' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedPlugin((cur) =>
                              cur === plugin.name ? null : plugin.name,
                            )
                          }}
                          className="kz-source-pill kz-source-pill--pick"
                          title="点击点选匹配条目"
                        >
                          选条目
                        </button>
                      ) : state.status === 'error' || state.status === 'empty' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedPlugin((cur) =>
                              cur === plugin.name ? null : plugin.name,
                            )
                          }}
                          className="kz-source-pill kz-source-pill--retry"
                          title="点击换词重搜"
                        >
                          换词
                        </button>
                      ) : state.status === 'idle' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            prioritizePlugin(plugin.name)
                            setExpandedPlugin((cur) =>
                              cur === plugin.name ? null : plugin.name,
                            )
                          }}
                          className="kz-source-pill kz-source-pill--idle"
                          title="点击探活此源"
                        >
                          探活
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Unified Expandable Drawer */}
                  {isExpanded && (
                    <div className="border-t border-[var(--kz-border-subtle)] bg-[var(--kz-bg-soft)] p-2.5 space-y-2.5 animate-in fade-in duration-150">
                      {/* Candidate Items List */}
                      {state.items.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between px-0.5 text-[10.5px] font-medium">
                            <span
                              className={clsx(
                                state.status === 'needs_pick'
                                  ? 'text-amber-600 dark:text-amber-300'
                                  : 'text-[var(--kz-fg-muted)]',
                              )}
                            >
                              {state.status === 'needs_pick'
                                ? '请点选匹配的番剧条目以绑定：'
                                : `搜到 ${state.items.length} 条候选条目，点选切换绑定：`}
                            </span>
                            {state.keyword && (
                              <span className="text-[9.5px] text-[var(--kz-fg-dim)] truncate max-w-[140px]">
                                词: {state.keyword}
                              </span>
                            )}
                          </div>
                          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                            {state.items.map((it, idx) => {
                              const isItemSelected =
                                isActive && selection?.source.src === it.src
                              return (
                                <button
                                  key={`${it.src}:${idx}`}
                                  type="button"
                                  onClick={() => {
                                    hideHoverTip()
                                    onSwitchSource(plugin, it)
                                  }}
                                  onMouseEnter={(e) => showHoverTip(it.name, e)}
                                  onMouseLeave={hideHoverTip}
                                  className={clsx(
                                    'flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-left text-[11.5px] transition-colors cursor-pointer gap-2',
                                    isItemSelected
                                      ? 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] border border-[var(--kz-accent)] font-medium'
                                      : 'bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] border border-[var(--kz-border-subtle)]',
                                  )}
                                >
                                  <span className="flex-1 min-w-0 truncate text-[11.5px]">
                                    {it.name}
                                  </span>
                                  <span
                                    className={clsx(
                                      'text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 select-none transition-colors',
                                      isItemSelected
                                        ? 'bg-[var(--kz-accent)] text-white'
                                        : 'text-[var(--kz-fg-muted)] bg-[var(--kz-bg-soft)] border border-[var(--kz-border-subtle)]',
                                    )}
                                  >
                                    {isItemSelected ? '在播' : '选用'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        /* Empty or Error state notice */
                        <div className="px-0.5 text-[11px] text-[var(--kz-fg-muted)]">
                          {state.status === 'probing' ? (
                            <span className="flex items-center gap-1.5 text-[var(--kz-accent)]">
                              <span className="inline-block h-2 w-2 animate-spin rounded-full border border-[var(--kz-accent)] border-t-transparent flex-shrink-0" />
                              正在检索该源，请稍候…
                            </span>
                          ) : state.status === 'empty' ? (
                            <span className="text-[var(--kz-fg-dim)]">
                              源站未收录此番剧，可尝试下方候选词或自定义关键词重搜：
                            </span>
                          ) : state.status === 'error' ? (
                            <span className="text-rose-500 dark:text-rose-400">
                              {state.errorMsg || '源站超时，请尝试换词重搜：'}
                            </span>
                          ) : state.status === 'idle' ? (
                            <span className="text-[var(--kz-fg-dim)]">
                              尚未探活，点击上方「探活」或下方关键词发起检索：
                            </span>
                          ) : null}
                        </div>
                      )}

                      {/* Candidate keyword rows */}
                      {keywordOptions.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-[var(--kz-border-subtle)]">
                          <div className="flex items-center justify-between text-[10.5px] font-medium text-[var(--kz-fg-muted)] px-0.5">
                            <span>候选关键词：</span>
                            <span className="text-[9.5px] text-[var(--kz-fg-dim)]">
                              共 {Math.min(keywordOptions.length, 8)} 个
                            </span>
                          </div>
                          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                            {keywordOptions.slice(0, 8).map((kw, idx) => (
                              <button
                                key={`${kw}:${idx}`}
                                type="button"
                                onClick={() => {
                                  hideHoverTip()
                                  reProbePlugin(plugin.name, kw)
                                }}
                                onMouseEnter={(e) => showHoverTip(kw, e)}
                                onMouseLeave={hideHoverTip}
                                className="flex w-full items-center justify-between rounded-lg bg-[var(--kz-bg-elevated)] hover:bg-[var(--kz-bg-hover)] border border-[var(--kz-border-subtle)] hover:border-[var(--kz-accent)] px-2.5 py-1 text-left transition-colors cursor-pointer group/kw gap-2"
                              >
                                <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-[var(--kz-fg-muted)] group-hover/kw:text-[var(--kz-accent)]">
                                  {kw}
                                </span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-[var(--kz-fg-muted)] group-hover/kw:text-[var(--kz-accent)] group-hover/kw:border-[var(--kz-accent)] bg-[var(--kz-bg-soft)] border border-[var(--kz-border-subtle)] flex-shrink-0 select-none transition-colors">
                                  重搜
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Custom keyword search input */}
                      <form
                        onSubmit={(e) => handleCardKeywordSubmit(plugin.name, e)}
                        className="flex gap-1.5 pt-1 border-t border-[var(--kz-border-subtle)]"
                      >
                        <input
                          value={cardKwInputs[plugin.name] || ''}
                          onChange={(e) =>
                            setCardKwInputs((prev) => ({
                              ...prev,
                              [plugin.name]: e.target.value,
                            }))
                          }
                          placeholder={`输入针对 ${plugin.name} 的关键词…`}
                          className="min-w-0 flex-1 rounded-md bg-[var(--kz-bg-elevated)] px-2.5 py-1 text-[11px] text-[var(--kz-fg)] border border-[var(--kz-border-subtle)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)] focus:ring-1 focus:ring-[var(--kz-accent)] transition-all"
                        />
                        <button
                          type="submit"
                          disabled={!(cardKwInputs[plugin.name] || '').trim()}
                          className="rounded-md bg-[var(--kz-accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--kz-accent-hover)] disabled:opacity-40 transition-all cursor-pointer select-none"
                        >
                          重搜
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Fast 120ms Glassmorphic Hover Tooltip */}
      {hoverTip && (
        <div
          className="fixed z-[100] pointer-events-none max-w-[280px] sm:max-w-xs rounded-lg border border-pink-500/30 dark:border-pink-400/30 bg-[var(--kz-bg-elevated)]/95 backdrop-blur-md px-2.5 py-1.5 text-[11px] font-medium leading-snug text-pink-600 dark:text-pink-300 shadow-lg animate-in fade-in duration-100 select-none break-all"
          style={{
            top: hoverTip.y,
            left: hoverTip.x,
            transform: hoverTip.isNearTop ? 'none' : 'translateY(-100%)',
          }}
        >
          {hoverTip.text}
        </div>
      )}
    </section>
  )
}
