import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type FormEvent,
  startTransition,
} from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  type BangumiItem,
  type PluginMeta,
  type SearchItem,
  resolveBoostedPluginNames,
} from '@animaku/shared'
import { DEFAULT_PLUGIN_RULES } from '../../data/default-plugins'
import {
  useSourceAggregator,
  type AggregatedSourceState,
} from '../../lib/use-source-aggregator'
import type { SourceSelection, SearchRow } from '../../lib/use-watch-session'
import { useAutoSourcePick } from './use-auto-source-pick'
import { useSiteConfigStore } from '../../stores/site-config'
import { KzButton, KzInput } from '../../components/ui'

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
  onSwitchSource: (
    plugin: PluginMeta,
    targetItem?: SearchItem,
    opts?: { hudMessage?: string; autoFallback?: boolean },
  ) => void
  selection: SourceSelection | null
  pendingSource: { pluginName: string; src: string } | null
  roadLoading: boolean
  defaultSourceName: string
  searchResults?: SearchRow[]
  defaultSearchEmpty?: boolean
  onAllFallbacksFailed?: () => void
  onAutoProbingChange?: (isProbing: boolean) => void
  embedded?: boolean
}

const DEFAULT_RULE_MAP = new Map(
  DEFAULT_PLUGIN_RULES.map((r) => [(r.name || '').toLowerCase(), r]),
)

/**
 * 视频源站点图标（Favicon 优先加载，加载失败或无 URL 时优雅回退至首字母徽章）
 */
function SourceFavicon({
  iconUrl,
  baseURL,
  name,
  isActive,
}: {
  iconUrl?: string
  baseURL?: string
  name: string
  isActive: boolean
}) {
  const [imgError, setImgError] = useState(false)

  const faviconUrl = useMemo(() => {
    if (iconUrl) return iconUrl
    if (!baseURL) return null
    try {
      const url = new URL(baseURL.startsWith('http') ? baseURL : `https://${baseURL}`)
      return `${url.origin}/favicon.ico`
    } catch {
      return null
    }
  }, [iconUrl, baseURL])

  // Reset image status if faviconUrl changes
  useEffect(() => {
    setImgError(false)
  }, [faviconUrl])

  const initial = (name.trim().charAt(0) || '?').toUpperCase()

  return (
    <div
      className={clsx(
        'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold uppercase overflow-hidden shadow-2xs',
        isActive
          ? 'bg-[var(--kz-accent)]/15 border border-[var(--kz-accent)]/40 shadow-xs'
          : 'bg-[var(--kz-bg-soft)] border border-[var(--kz-border-subtle)]',
      )}
    >
      {faviconUrl && !imgError ? (
        <img
          src={faviconUrl}
          alt=""
          className="h-4.5 w-4.5 object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <span
          className={clsx(
            'select-none transition-colors duration-200',
            isActive ? 'text-[var(--kz-accent)] font-extrabold' : 'text-[var(--kz-fg-muted)]',
          )}
        >
          {initial}
        </span>
      )}
    </div>
  )
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
  searchResults,
  defaultSearchEmpty,
  onAllFallbacksFailed,
  onAutoProbingChange,
  embedded = false,
}: SourceBoardProps) {
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const [cardKwInputs, setCardKwInputs] = useState<Record<string, string>>({})
  const prevBangumiIdRef = useRef(bangumiId)

  // Immediate synchronous reset during render when subject changes
  if (prevBangumiIdRef.current !== bangumiId) {
    prevBangumiIdRef.current = bangumiId
    if (expandedPlugin !== null) setExpandedPlugin(null)
    if (Object.keys(cardKwInputs).length > 0) setCardKwInputs({})
  }

  // Reset expanded drawer & manual keyword inputs on subject switch
  useEffect(() => {
    setExpandedPlugin(null)
    setCardKwInputs({})
  }, [bangumiId])

  const {
    sources,
    prioritizePlugin,
    reProbePlugin,
    inFlightPlugins,
    isAutoProbing,
    allFallbacksExhausted,
  } = useSourceAggregator({
    bangumiId,
    plugins,
    pluginOrder,
    titleRefs,
    item: bangumiItem,
    defaultKeyword,
    isOpen: sourcesOpen,
    activePluginName,
    selection,
    searchResults,
    autoProbeOnFallback: Boolean(defaultSearchEmpty && !selection),
  })

  // Sync auto-probing status to parent (WatchPage & Episode section)
  useEffect(() => {
    onAutoProbingChange?.(isAutoProbing)
  }, [isAutoProbing, onAutoProbingChange])

  const sourceBangumiIds = useSiteConfigStore((s) => s.defaultSettings?.sourceBangumiIds)
  const boostedPluginNames = useMemo(
    () => resolveBoostedPluginNames(bangumiId, sourceBangumiIds),
    [bangumiId, sourceBangumiIds],
  )

  const { onUserAction, pendingCandidateName } = useAutoSourcePick({
    bangumiId,
    enabled: Boolean(defaultSearchEmpty && !selection),
    sources,
    pluginOrder,
    inFlightPlugins,
    boostedPluginNames,
    allFallbacksExhausted,
    onSwitchSource,
    onAllFallbacksFailed,
  })

  function handleCardKeywordSubmit(pluginName: string, e: FormEvent) {
    e.preventDefault()
    onUserAction()
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
      id="kz-watch-sources"
      className={
        embedded
          ? 'kz-watch-sources-embedded w-full min-w-0'
          : clsx(
              'kz-watch-panel shrink-0 overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-sm transition-all duration-300',
              sourcesOpen && 'kz-watch-sources',
            )
      }
    >
      {/* Standalone header bar */}
      {!embedded && (
        <button
          type="button"
          onClick={() => {
            onUserAction()
            startTransition(onToggleSourcesOpen)
          }}
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
      )}

      {/* Expanded body */}
      {sourcesOpen && (
        <div className={clsx(!embedded && 'border-t border-[var(--kz-border-subtle)]', 'px-2.5 py-2.5 space-y-2')}>
          {/* Embedded mode sub-header */}
          {embedded && (
            <div className="flex items-center justify-between px-1 pb-0.5 text-[11px] text-[var(--kz-fg-muted)]">
              <span className="font-medium flex items-center gap-1.5">
                <span>已启用 {sourcesTotal} 个视频源</span>
                {sourcesTotal > 0 && (
                  <span className="rounded bg-[var(--kz-bg-soft)] px-1.5 py-0.5 text-[9.5px] text-[var(--kz-fg-dim)] border border-[var(--kz-border-subtle)]">
                    {sourcesReadyCount} 就绪
                  </span>
                )}
              </span>
              {isAutoProbing && (
                <span className="flex items-center gap-1 text-[var(--kz-accent)] text-[10.5px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--kz-accent)] animate-ping" />
                  探测中…
                </span>
              )}
            </div>
          )}

          {/* Sources List */}
          <div className="flex flex-col gap-2">
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
                    'group relative rounded-xl border transition-colors duration-200 overflow-hidden',
                    isActive
                      ? 'border-[var(--kz-accent)] bg-[var(--kz-accent-soft)]/50 shadow-xs'
                      : 'border-[var(--kz-border-subtle)] bg-[var(--kz-bg-elevated)] hover:border-[var(--kz-border)] hover:bg-[var(--kz-bg-hover)]',
                  )}
                >
                  {/* Card Main Row: Clicking card body ONLY toggles expanded drawer */}
                  <div
                    onClick={() => {
                      onUserAction()
                      setExpandedPlugin((cur) => (cur === plugin.name ? null : plugin.name))
                    }}
                    className="relative z-10 flex w-full items-center gap-2.5 p-2 text-left cursor-pointer select-none"
                  >
                    {/* Avatar with Favicon + Status Beacon */}
                    <div className="relative shrink-0">
                      <SourceFavicon
                        iconUrl={
                          plugin.iconUrl ||
                          DEFAULT_RULE_MAP.get((plugin.name || '').toLowerCase())?.iconUrl
                        }
                        baseURL={plugin.baseURL}
                        name={plugin.name}
                        isActive={isActive}
                      />

                      {/* Status indicator beacon dot */}
                      <span
                        className={clsx(
                          'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--kz-bg-elevated)] transition-all',
                          state.status === 'ready' &&
                            'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]',
                          state.status === 'needs_pick' &&
                            'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.9)]',
                          state.status === 'probing' &&
                            'bg-[var(--kz-accent)] animate-ping',
                          (state.status === 'empty' || state.status === 'error') &&
                            'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]',
                          state.status === 'idle' && 'bg-[var(--kz-fg-dim)]',
                        )}
                      />
                    </div>

                    {/* Source Name & Sub Info */}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={clsx(
                            'truncate text-xs sm:text-[13px] font-semibold tracking-tight',
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
                          <span className="rounded bg-[var(--kz-accent)] px-1.5 py-0.5 text-[9.5px] font-medium leading-none text-white shadow-2xs">
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
                            className={clsx(
                              'truncate block',
                              pendingCandidateName === plugin.name && !isActive && 'text-[var(--kz-accent)] font-medium',
                            )}
                            title={matchedTitle || plugin.name}
                          >
                            {pendingCandidateName === plugin.name && !isActive
                              ? `就绪中 (准备切换…)`
                              : matchedTitle || plugin.name}
                          </span>
                        )}

                        {state.status === 'needs_pick' && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium truncate block">
                            搜到 {state.items.length} 条候选
                          </span>
                        )}

                        {state.status === 'empty' && (
                          <span className="text-[var(--kz-fg-dim)] truncate block">
                            未搜到结果
                          </span>
                        )}

                        {state.status === 'error' && (
                          <span className="text-rose-500 dark:text-rose-400 truncate block">
                            {state.errorMsg || '请求失败'}
                          </span>
                        )}

                        {state.status === 'idle' && (
                          <span className="text-[var(--kz-fg-dim)] truncate block">
                            待探活 (点击探测)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Area: Only clicking this pill triggers source selection or core action */}
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isPending ? (
                        <KzButton
                          size="xs"
                          variant="outline"
                          pill
                          loading
                          disabled
                          className="h-7 px-2.5 !text-[11.5px] !font-semibold"
                        >
                          探测中
                        </KzButton>
                      ) : isActive ? (
                        <KzButton
                          size="xs"
                          variant="primary"
                          pill
                          onClick={(e) => {
                            e.stopPropagation()
                            onUserAction()
                            setExpandedPlugin((cur) => (cur === plugin.name ? null : plugin.name))
                          }}
                          className="h-7 px-3 !text-[11.5px] !font-semibold"
                          title="当前播放源（点击展开调优）"
                        >
                          当前
                        </KzButton>
                      ) : state.status === 'ready' ? (
                        <KzButton
                          size="xs"
                          variant="outline"
                          pill
                          onClick={(e) => {
                            e.stopPropagation()
                            onUserAction()
                            prioritizePlugin(plugin.name)
                            if (state.matchedItem) {
                              onSwitchSource(plugin, state.matchedItem)
                            } else {
                              onSwitchSource(plugin)
                            }
                          }}
                          className="h-7 px-3 !text-[11.5px] !font-semibold border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                          title="点击切换至此源播放"
                        >
                          切换
                        </KzButton>
                      ) : state.status === 'needs_pick' ? (
                        <KzButton
                          size="xs"
                          variant="outline"
                          pill
                          onClick={(e) => {
                            e.stopPropagation()
                            onUserAction()
                            setExpandedPlugin((cur) => (cur === plugin.name ? null : plugin.name))
                          }}
                          className="h-7 px-2.5 !text-[11.5px] !font-semibold border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                          title="搜到多个候选，点击选条目"
                        >
                          选条目
                        </KzButton>
                      ) : state.status === 'empty' ? (
                        <KzButton
                          size="xs"
                          variant="secondary"
                          pill
                          onClick={(e) => {
                            e.stopPropagation()
                            onUserAction()
                            setExpandedPlugin((cur) => (cur === plugin.name ? null : plugin.name))
                          }}
                          className="h-7 px-2.5 !text-[11.5px] !font-semibold"
                          title="未搜到结果，点击换词重搜"
                        >
                          换词
                        </KzButton>
                      ) : state.status === 'error' ? (
                        (() => {
                          const isCooldown = Boolean(
                            state.rateLimitedUntil && Date.now() < state.rateLimitedUntil,
                          )
                          const remainingSec = isCooldown
                            ? Math.max(1, Math.ceil((state.rateLimitedUntil! - Date.now()) / 1000))
                            : 0
                          return (
                            <KzButton
                              size="xs"
                              variant="danger-outline"
                              pill
                              disabled={isCooldown}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isCooldown) return
                                onUserAction()
                                reProbePlugin(plugin.name)
                              }}
                              className="h-7 px-2.5 !text-[11.5px] !font-semibold"
                              title={
                                isCooldown
                                  ? `该源请求过于频繁，请等待冷却 (${remainingSec}s)`
                                  : '请求失败，点击重试探测'
                              }
                            >
                              {isCooldown ? `${remainingSec}s` : '重试'}
                            </KzButton>
                          )
                        })()
                      ) : state.status === 'idle' ? (
                        <KzButton
                          size="xs"
                          variant="secondary"
                          pill
                          onClick={(e) => {
                            e.stopPropagation()
                            onUserAction()
                            prioritizePlugin(plugin.name)
                          }}
                          className="h-7 px-2.5 !text-[11.5px] !font-semibold hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)]"
                          title="点击探测此源"
                        >
                          探测
                        </KzButton>
                      ) : (
                        <KzButton
                          size="xs"
                          variant="outline"
                          pill
                          loading
                          disabled
                          className="h-7 px-2.5 !text-[11.5px] !font-semibold"
                        >
                          探测中
                        </KzButton>
                      )}
                    </div>
                  </div>

                  {/* GPU-Accelerated Hardware CSS Grid Accordion: 60fps zero-jank expand/collapse */}
                  <div
                    className={clsx(
                      'grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden',
                      isExpanded
                        ? 'grid-rows-[1fr] opacity-100 border-t border-[var(--kz-border-subtle)]'
                        : 'grid-rows-[0fr] opacity-0 border-t-0',
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="relative z-10 bg-[var(--kz-bg-soft)]/50 p-2.5 space-y-2.5">
                        {/* Probing State Banner */}
                        {state.status === 'probing' ? (
                          <div className="flex items-center gap-2 rounded-lg bg-[var(--kz-bg-elevated)] border border-[var(--kz-accent)]/30 px-3 py-2 text-[11.5px] text-[var(--kz-accent)]">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--kz-accent)] border-t-transparent shrink-0" />
                            <span className="font-medium truncate">
                              正在使用「{state.keyword || '关键词'}」检索 {plugin.name}…
                            </span>
                          </div>
                        ) : state.items.length > 0 ? (
                          /* Candidate Items List */
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between px-0.5 text-[10.5px] font-medium">
                              <span
                                className={clsx(
                                  state.status === 'needs_pick'
                                    ? 'text-amber-600 dark:text-amber-300 font-semibold'
                                    : 'text-[var(--kz-fg-muted)]',
                                )}
                              >
                                {state.status === 'needs_pick'
                                  ? '请点选匹配的番剧条目以绑定：'
                                  : `搜到 ${state.items.length} 条候选条目：`}
                              </span>
                              {state.keyword && (
                                <span className="text-[9.5px] text-[var(--kz-fg-dim)] truncate max-w-[130px]">
                                  词: {state.keyword}
                                </span>
                              )}
                            </div>
                            <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                              {state.items.map((it, idx) => {
                                const isItemSelected =
                                  isActive && selection?.source.src === it.src
                                return (
                                  <button
                                    key={`${it.src}:${idx}`}
                                    type="button"
                                    onClick={() => {
                                      onUserAction()
                                      onSwitchSource(plugin, it)
                                    }}
                                    className={clsx(
                                      'group/item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-all cursor-pointer gap-2',
                                      isItemSelected
                                        ? 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] border border-[var(--kz-accent)] font-medium shadow-2xs'
                                        : 'bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)]/50 border border-[var(--kz-border-subtle)]',
                                    )}
                                  >
                                    <span className="flex-1 min-w-0 text-[11.5px] leading-snug break-words">
                                      {it.name}
                                    </span>
                                    <span
                                      className={clsx(
                                        'text-[9.5px] font-medium px-1.5 py-0.5 rounded-md shrink-0 select-none transition-colors leading-tight',
                                        isItemSelected
                                          ? 'bg-[var(--kz-accent)] text-white shadow-2xs'
                                          : 'text-[var(--kz-fg-muted)] group-hover/item:text-[var(--kz-accent)] bg-[var(--kz-bg-soft)] border border-[var(--kz-border-subtle)]',
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
                            {state.status === 'empty' ? (
                              <span className="text-[var(--kz-fg-dim)]">
                                未搜到结果，尝试换词：
                              </span>
                            ) : state.status === 'error' ? (
                              <span className="text-rose-500 dark:text-rose-400">
                                {state.errorMsg ? `${state.errorMsg}，尝试换词：` : '请求失败，尝试换词：'}
                              </span>
                            ) : state.status === 'idle' ? (
                              <span className="text-[var(--kz-fg-dim)]">
                                尚未探活，点击上方「探测」或下方关键词发起检索：
                              </span>
                            ) : null}
                          </div>
                        )}

                        {/* Candidate keyword chips (Flowing Tag Chips) */}
                        {keywordOptions.length > 0 && (
                          <div className="space-y-1.5 pt-1.5 border-t border-[var(--kz-border-subtle)]">
                            <div className="flex items-center justify-between text-[10.5px] font-medium text-[var(--kz-fg-muted)] px-0.5">
                              <span>快捷换词推荐：</span>
                              <span className="text-[9.5px] text-[var(--kz-fg-dim)]">
                                共 {Math.min(keywordOptions.length, 8)} 个
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                              {keywordOptions.slice(0, 8).map((kw, idx) => {
                                const isCurrentKw = state.keyword === kw
                                const isProbingThis =
                                  state.status === 'probing' && state.keyword === kw
                                return (
                                  <KzButton
                                    key={`${kw}:${idx}`}
                                    type="button"
                                    size="xs"
                                    variant={isCurrentKw ? 'primary' : 'secondary'}
                                    pill
                                    loading={isProbingThis}
                                    onClick={() => {
                                      setCardKwInputs((prev) => ({
                                        ...prev,
                                        [plugin.name]: kw,
                                      }))
                                      reProbePlugin(plugin.name, kw)
                                    }}
                                    className={clsx(
                                      'h-7 px-2.5 !text-[11.5px] !font-normal',
                                      !isCurrentKw && 'hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)]',
                                    )}
                                  >
                                    <span className="truncate max-w-[180px]">{kw}</span>
                                  </KzButton>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Custom keyword search input */}
                        <form
                          onSubmit={(e) => handleCardKeywordSubmit(plugin.name, e)}
                          className="flex items-center gap-1.5 pt-1.5 border-t border-[var(--kz-border-subtle)]"
                        >
                          <KzInput
                            value={cardKwInputs[plugin.name] || ''}
                            onChange={(e) =>
                              setCardKwInputs((prev) => ({
                                ...prev,
                                [plugin.name]: e.target.value,
                              }))
                            }
                            placeholder={`输入针对 ${plugin.name} 的关键词…`}
                            size="sm"
                            containerClassName="flex-1 min-w-0"
                            className="!text-[11px]"
                          />
                          <KzButton
                            type="submit"
                            variant="primary"
                            size="sm"
                            loading={state.status === 'probing'}
                            disabled={!(cardKwInputs[plugin.name] || '').trim()}
                            className="!text-[11px] px-3"
                          >
                            重搜
                          </KzButton>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
