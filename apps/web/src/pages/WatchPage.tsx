import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CollectType } from '@animaku/shared'
import { useWatchSession } from '../lib/use-watch-session'
import { bangumiApi } from '../lib/bangumi'
import { useSettingsStore } from '../stores/settings'
import { usePluginStore } from '../stores/plugins'
import { ErrorState } from '../components/ui'
import {
  EmbedPlayerSuspense,
  VideoPlayerSuspense,
  preloadVideoPlayer,
} from '../player/lazy'
import { useWatchLayoutMode } from './watch/useWatchLayoutMode'
import { DesktopWatchLayout } from './watch/DesktopWatchLayout'
import { MobileWatchLayout } from './watch/MobileWatchLayout'
import { WatchMeta } from './watch/WatchMeta'
import { MobileEpsSection } from './watch/MobileEpsSection'
import { SourceBoard } from './watch/SourceBoard'
import { WatchHudToast } from './watch/WatchHudToast'

/**
 * Unified subject + cinema page (Bilibili-style).
 * Used for both /subject/:id and /play/:id — no separate pages.
 * Desktop vs mobile page chrome is split (DesktopWatchLayout / MobileWatchLayout).
 */
export function WatchPage() {
  const { id } = useParams()
  const bangumiId = Number(id)
  const w = useWatchSession(Number.isFinite(bangumiId) ? bangumiId : 0)
  const layoutMode = useWatchLayoutMode()

  const token = useSettingsStore((s) => s.bangumiToken)
  const qc = useQueryClient()
  const [summaryOpen, setSummaryOpen] = useState(false)
  /** Mobile: whole meta card collapsed to 2 lines until expanded */
  const [metaOpen, setMetaOpen] = useState(false)
  /** Sources collapsed by default; on-demand stream probe when expanded by user */
  const [sourcesOpen, setSourcesOpen] = useState(false)
  /** Bilibili strip: false = horizontal cards, true = full grid (desktop + mobile) */
  const [epsListExpanded, setEpsListExpanded] = useState(false)
  /** Last selection key we auto-focused (collapse sources / mobile scroll) */
  const focusedSelectionKey = useRef<string | null>(null)
  /**
   * Selection key we already auto-expanded.
   * Avoids re-forcing grid after the user collapses「全 N 话」.
   */
  const autoExpandedEpsKey = useRef<string | null>(null)

  /** Collapse 视频源; default 选集 to full grid; on mobile scroll cinema into view. */
  const focusAfterSelection = useCallback(
    (key: string, opts?: { forceScroll?: boolean }) => {
      if (!key) return
      const already = focusedSelectionKey.current === key
      focusedSelectionKey.current = key
      setSourcesOpen(false)
      // 选源后默认「全 N 话」网格（每源只自动展开一次，用户可再收起）
      if (autoExpandedEpsKey.current !== key) {
        autoExpandedEpsKey.current = key
        setEpsListExpanded(true)
      }
      if (layoutMode !== 'mobile') return
      if (already && !opts?.forceScroll) return
      // Wait layout paint after collapse before scrolling.
      // nearest: sticky portrait player already fills the top — avoid big jumps.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .getElementById('kz-watch-focus')
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
      })
    },
    [layoutMode],
  )

  const collection = useQuery({
    queryKey: ['collection', bangumiId, token],
    queryFn: ({ signal }) => bangumiApi.getCollection(bangumiId, { signal }),
    enabled: Number.isFinite(bangumiId) && Boolean(token),
  })
  const setCollect = useMutation({
    mutationFn: (type: CollectType) =>
      bangumiApi.setCollection(bangumiId, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection', bangumiId] })
      qc.invalidateQueries({ queryKey: ['collections'] })
    },
  })
  const collectType = collection.data?.data?.type ?? CollectType.none
  const collectOptions = useMemo(
    () =>
      [
        CollectType.watching,
        CollectType.planToWatch,
        CollectType.watched,
        CollectType.onHold,
        CollectType.abandoned,
      ] as CollectType[],
    [],
  )

  const keywordOptions = useMemo(() => {
    const pluginName =
      w.keywordTargetPlugin?.name || w.selection?.plugin.name || ''
    const manual = pluginName ? w.sessionKeywords[pluginName] || [] : []
    const seen = new Set<string>()
    const out: string[] = []
    for (const k of [...w.keywordCandidates, ...manual]) {
      const t = k.trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
    return out
  }, [
    w.keywordCandidates,
    w.sessionKeywords,
    w.keywordTargetPlugin,
    w.selection,
  ])

  const activeRoadIndex = Math.min(
    w.visibleRoad,
    Math.max(0, (w.selection?.roads.length || 1) - 1),
  )
  const activeRoad = w.selection?.roads[activeRoadIndex]
  const epCount = activeRoad?.identifier?.length ?? 0

  // Chapters ready (auto-pick or resume): fold 视频源; 选集默认网格; mobile scroll
  useEffect(() => {
    const sel = w.selection
    if (!sel?.roads?.length) return
    const key = `${sel.plugin.name}::${sel.source.src}`
    focusAfterSelection(key)
  }, [w.selection, focusAfterSelection])

  // Warm player JS as soon as watch route is active (import only).
  // Must run before any conditional return — Rules of Hooks.
  useEffect(() => {
    preloadVideoPlayer()
  }, [])

  if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
    return <ErrorState error={new Error('无效的番剧 ID')} />
  }

  if (w.subjectLoading && !w.title) {
    // Keep cinema shell height stable while subject meta loads (CLS).
    return (
      <div className="kz-watch px-4 sm:px-0">
        <div className="kz-player-stack mx-auto space-y-3">
          <div className="kz-player-placeholder text-sm text-[var(--kz-fg-muted)]">
            <div className="flex flex-col items-center gap-2">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--kz-border)] border-t-[var(--kz-accent)]" />
              加载条目…
            </div>
          </div>
          <div className="kz-watch-panel space-y-2 px-3 py-3">
            <div className="kz-skeleton h-4 w-2/3 rounded-md" />
            <div className="kz-skeleton h-3 w-1/2 rounded-md" />
            <div className="kz-skeleton h-3 w-full rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  const hasKeywordTarget = Boolean(
    w.keywordTargetPlugin || w.selection?.plugin,
  )
  const item = w.bangumiItem

  const playerBlock = (
    <div className="space-y-2 lg:static sticky top-0 z-40 bg-[var(--kz-bg)] shadow-md lg:shadow-none">
      {w.resolveLoading && !w.mediaSrc && (
        <div className="kz-player-placeholder text-sm text-[var(--kz-fg-muted)]">
          <div className="flex flex-col items-center gap-2">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--kz-border)] border-t-[var(--kz-accent)]" />
            解析播放地址…
          </div>
        </div>
      )}

      {w.mediaSrc && (
        <VideoPlayerSuspense
          key={w.playerKey}
          title={
            w.title
              ? `${w.title}${w.episode ? ` 第 ${w.episode.episode} 集` : ''}`
              : undefined
          }
          src={w.mediaSrc}
          initialTime={w.resumeTime}
          comments={w.dm.visibleComments}
          danmaku={w.danmakuSettings}
          player={w.playerSettings}
          onPlayerChange={w.setPlayer}
          onProgress={w.onProgress}
          onToggleDanmaku={() => {
            const cur = w.danmakuSettings
            const isEnabled = cur.enabled !== false
            const isSimplify = Boolean(cur.simplify)
            if (isEnabled && !isSimplify) {
              w.setDanmaku({ enabled: true, simplify: true })
            } else if (isEnabled && isSimplify) {
              w.setDanmaku({ enabled: false, simplify: false })
            } else {
              w.setDanmaku({ enabled: true, simplify: false })
            }
          }}
          onDanmakuChange={w.setDanmaku}
          onPrev={() => startTransition(() => w.goAdjacentEpisode(-1))}
          onNext={() => startTransition(() => w.goAdjacentEpisode(1))}
          onMediaAuthExpired={w.onMediaAuthExpired}
          onMediaLoadFailed={w.onMediaLoadFailed}
          danmakuPanel={w.dm.panel}
        />
      )}

      {w.selection &&
        w.episode &&
        Boolean(w.resolveError) &&
        !w.mediaSrc &&
        !w.resolveLoading && (
          <EmbedPlayerSuspense
            pageUrl={w.pageUrl}
            title={w.title}
            reason={
              w.resolveError instanceof Error
                ? w.resolveError.message
                : '静态解析失败'
            }
            onRetryResolve={w.refetchResolve}
          />
        )}

      {!w.mediaSrc && !w.resolveLoading && !w.resolveError && (
        <div className="kz-player-placeholder flex-col gap-1.5 text-sm text-[var(--kz-fg-muted)]">
          <span>
            {w.roadLoading
              ? `正在加载 ${w.defaultSourceName} 分集…`
              : w.selection
                ? '在选集区点集数即可播放'
                : `已默认搜索 ${w.defaultSourceName}，请稍候或点下方结果`}
          </span>
          <span className="text-xs text-[var(--kz-fg-dim)]">
            默认会选中第一条搜索结果并加载分集；其它源需手动点搜
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs text-[var(--kz-fg-muted)]">
        <span className="text-[var(--kz-fg-muted)]">弹幕</span>
        <span className="min-w-0 flex-1 truncate text-[var(--kz-fg)]">
          {w.dm.statusLine || '未加载'}
        </span>
        {w.dm.chips.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!c.loaded}
            onClick={() => w.dm.toggleSource(c.id)}
            className={clsx(
              'rounded-full px-2 py-0.5 text-[11px]',
              !c.loaded && 'opacity-40',
              c.loaded && c.enabled
                ? 'bg-[var(--kz-accent)] text-white'
                : 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)]',
            )}
          >
            {c.label}
            {c.loaded ? ` ${c.count}` : ''}
          </button>
        ))}
      </div>
    </div>
  )

  const metaBlock = (
    <WatchMeta
      item={item}
      title={w.title}
      pluginName={w.pluginName}
      episodeLabel={w.episode ? `第 ${w.episode.episode} 集` : null}
      mediaHint={
        w.mediaSrc
          ? w.playbackTransit === 'playlist-proxy'
            ? '列表代理·分片直连'
            : w.playbackTransit === 'direct' || w.playbackMode === 'direct'
              ? '直连源站'
              : '经服务器代理'
          : null
      }
      summaryOpen={summaryOpen}
      onToggleSummary={() => startTransition(() => setSummaryOpen((v) => !v))}
      token={token}
      collectType={collectType}
      collectOptions={collectOptions}
      onCollectChange={(t) => setCollect.mutate(t)}
      collectPending={setCollect.isPending}
      compact={layoutMode === 'mobile'}
      metaOpen={layoutMode === 'mobile' ? metaOpen : true}
      onToggleMeta={
        layoutMode === 'mobile'
          ? () => startTransition(() => setMetaOpen((v) => !v))
          : undefined
      }
    />
  )

  const pluginOrder = usePluginStore((s) =>
    Array.isArray(s.pluginOrder) ? s.pluginOrder : [],
  )

  const sourcesPanel = (
    <SourceBoard
      bangumiId={bangumiId}
      sourcesOpen={sourcesOpen}
      onToggleSourcesOpen={() => setSourcesOpen((v) => !v)}
      activePluginName={w.pluginName}
      activeEpisodeNumber={w.episode?.episode}
      plugins={w.enabledPlugins}
      pluginOrder={pluginOrder}
      titleRefs={w.titleRefs}
      bangumiItem={w.bangumiItem}
      defaultKeyword={w.defaultKeyword}
      keywordOptions={keywordOptions}
      onSwitchSource={(plugin, targetItem) => {
        startTransition(() => {
          void w.switchToPlugin(plugin, targetItem)
        })
      }}
      selection={w.selection}
      pendingSource={w.pendingSource}
      roadLoading={w.roadLoading}
      defaultSourceName={w.defaultSourceName}
    />
  )

  /* Bilibili-style 选集 — shared desktop rail + mobile */
  const epsPanel = (
    <MobileEpsSection
      roads={w.selection?.roads ?? []}
      activeRoadIndex={activeRoadIndex}
      playingRoad={w.episode?.road}
      playingEpisode={w.episode?.episode}
      epCount={epCount}
      listExpanded={epsListExpanded}
      roadLoading={w.roadLoading}
      roadError={w.roadError || null}
      pendingPluginName={w.pendingSource?.pluginName}
      hasSelection={Boolean(w.selection)}
      onToggleList={() => startTransition(() => setEpsListExpanded((v) => !v))}
      onSelectRoad={(ri) => startTransition(() => w.setVisibleRoad(ri))}
      onPickEpisode={(ep, rd) => startTransition(() => w.pickEpisode(ep, rd))}
    />
  )

  /* Desktop rail: sources then episodes (right column). */
  const rail = (
    <>
      {sourcesPanel}
      {epsPanel}
    </>
  )

  return (
    <div className="kz-watch -mx-4 -mt-2 sm:mx-0 sm:mt-0">
      <WatchHudToast message={w.hudMessage} />
      {layoutMode === 'desktop' ? (
        <DesktopWatchLayout
          player={playerBlock}
          meta={metaBlock}
          rail={rail}
        />
      ) : (
        // Mobile: player → meta → 视频源 → 选集 (Bilibili-style)
        <MobileWatchLayout
          player={playerBlock}
          meta={metaBlock}
          sources={sourcesPanel}
          episodes={epsPanel}
        />
      )}
    </div>
  )
}
