import { useState, type FormEvent, startTransition } from 'react'
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
                          <span className="rounded bg-[var(--kz-bg-soft)] px-1 py-0.2 text-[9.5px] font-medium text-[var(--kz-fg-muted)] border border-[var(--kz-border-subtle)]">
                            默认
                          </span>
                        )}

                        {isActive && (
                          <span className="rounded bg-[var(--kz-accent)] px-1 py-0.2 text-[9.5px] font-medium text-white shadow-xs">
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
                          <span className="text-[var(--kz-fg-dim)] truncate block">等待探测</span>
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
                        <span className="kz-source-pill kz-source-pill--active">
                          当前
                        </span>
                      ) : state.status === 'ready' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (state.matchedItem) {
                              onSwitchSource(plugin, state.matchedItem)
                            } else {
                              onSwitchSource(plugin)
                            }
                          }}
                          className="kz-source-pill kz-source-pill--ready"
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
                        >
                          换词
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Expandable Hits Section for needs_pick */}
                  {isExpanded && state.status === 'needs_pick' && (
                    <div className="border-t border-[var(--kz-border-subtle)] bg-[var(--kz-bg-soft)] p-2 space-y-2 animate-in fade-in duration-150">
                      {state.items.length > 0 && (
                        <>
                          <div className="px-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                            请点选匹配的番剧条目以绑定：
                          </div>
                          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                            {state.items.map((it, idx) => {
                              const isItemSelected =
                                isActive && selection?.source.src === it.src
                              return (
                                <button
                                  key={`${it.src}:${idx}`}
                                  type="button"
                                  onClick={() => {
                                    onSwitchSource(plugin, it)
                                  }}
                                  className={clsx(
                                    'flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition-colors cursor-pointer',
                                    isItemSelected
                                      ? 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] border border-[var(--kz-accent)] font-medium'
                                      : 'bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] border border-[var(--kz-border-subtle)]',
                                  )}
                                >
                                  <span className="truncate flex-1 pr-2">
                                    {it.name}
                                  </span>
                                  <span className="text-[10px] text-[var(--kz-fg-muted)] flex-shrink-0">
                                    {isItemSelected ? '当前选用' : '点击选用'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}

                      {/* Also allow custom search if candidate items are not correct */}
                      <form
                        onSubmit={(e) => handleCardKeywordSubmit(plugin.name, e)}
                        className="flex gap-1 pt-1 border-t border-[var(--kz-border-subtle)]"
                      >
                        <input
                          value={cardKwInputs[plugin.name] || ''}
                          onChange={(e) =>
                            setCardKwInputs((prev) => ({
                              ...prev,
                              [plugin.name]: e.target.value,
                            }))
                          }
                          placeholder={`换词重搜 ${plugin.name}…`}
                          className="min-w-0 flex-1 rounded bg-[var(--kz-bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--kz-fg)] border border-[var(--kz-border)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)]"
                        />
                        <button
                          type="submit"
                          disabled={!(cardKwInputs[plugin.name] || '').trim()}
                          className="rounded bg-[var(--kz-accent)] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[var(--kz-accent-hover)] disabled:opacity-40 transition-all cursor-pointer"
                        >
                          重搜
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Expandable Keyword Search/Retry for error or empty states */}
                  {isExpanded && (state.status === 'error' || state.status === 'empty') && (
                    <div className="border-t border-[var(--kz-border-subtle)] bg-[var(--kz-bg-soft)] p-2 space-y-2 animate-in fade-in duration-150">
                      {keywordOptions.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-medium text-[var(--kz-fg-muted)]">
                            点选候选关键词重新探活：
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {keywordOptions.slice(0, 6).map((kw) => (
                              <button
                                key={kw}
                                type="button"
                                onClick={() => {
                                  reProbePlugin(plugin.name, kw)
                                }}
                                className="rounded bg-[var(--kz-bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--kz-fg)] border border-[var(--kz-border)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] transition-colors cursor-pointer"
                              >
                                {kw}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <form
                        onSubmit={(e) => handleCardKeywordSubmit(plugin.name, e)}
                        className="flex gap-1"
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
                          className="min-w-0 flex-1 rounded bg-[var(--kz-bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--kz-fg)] border border-[var(--kz-border)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)]"
                        />
                        <button
                          type="submit"
                          disabled={!(cardKwInputs[plugin.name] || '').trim()}
                          className="rounded bg-[var(--kz-accent)] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[var(--kz-accent-hover)] disabled:opacity-40 transition-all cursor-pointer"
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
    </section>
  )
}
