import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CollectType } from '@animaku/shared'
import { useWatchSession } from '../lib/use-watch-session'
import { bangumiApi } from '../lib/bangumi'
import { useSettingsStore } from '../stores/settings'
import { usePluginStore } from '../stores/plugins'
import { ApiError } from '../lib/api'
import { NotFoundPage } from './NotFoundPage'
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
import { WatchRecommendations } from './watch/WatchRecommendations'
import { WatchComments } from './watch/comments'
import { ErrorBoundary } from '../components/ErrorBoundary'

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
  const pluginOrder = usePluginStore((s) =>
    Array.isArray(s.pluginOrder) ? s.pluginOrder : [],
  )
  const qc = useQueryClient()
  const [summaryOpen, setSummaryOpen] = useState(false)
  /** Mobile: whole meta card collapsed to 2 lines until expanded */
  const [metaOpen, setMetaOpen] = useState(false)
  /** Sources collapsed by default; on-demand stream probe when expanded by user */
  const [sourcesOpen, setSourcesOpen] = useState(false)
  /** Bilibili strip: false = horizontal cards, true = full grid (desktop + mobile) */
  const [epsListExpanded, setEpsListExpanded] = useState(false)
  /** Wide-screen theater mode — active only for current watch session (not persisted). */
  const [widescreen, setWidescreen] = useState(false)

  // Reset widescreen mode to standard when navigating to a different subject
  useEffect(() => {
    setWidescreen(false)
  }, [bangumiId])

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
  const mutationSeqRef = useRef(0)
  const setCollect = useMutation({
    mutationFn: (type: CollectType) =>
      bangumiApi.setCollection(bangumiId, type),
    onMutate: async (newType: CollectType) => {
      const seq = ++mutationSeqRef.current

      // 1. 取消正在进行的 refetch，避免覆盖乐观更新
      await qc.cancelQueries({ queryKey: ['collection', bangumiId, token] })

      // 2. 快照之前的值以备回滚
      const previous = qc.getQueryData<{ data: { subjectId: number; type: CollectType } | null }>([
        'collection',
        bangumiId,
        token,
      ])

      // 3. 立即 0ms 同步更新本地缓存
      qc.setQueryData(
        ['collection', bangumiId, token],
        (old: { data: Record<string, unknown> } | undefined) => ({
          data: {
            subjectId: bangumiId,
            updatedAt: new Date().toISOString(),
            ...(old?.data || {}),
            type: newType,
          },
        }),
      )

      return { previous, seq }
    },
    onError: (_err, _newType, context) => {
      // 仅当发生错误的请求是最后一次发出的最新请求时才允许回滚，避免旧请求失败将后续成功状态打回
      if (context?.previous !== undefined && context.seq === mutationSeqRef.current) {
        qc.setQueryData(['collection', bangumiId, token], context.previous)
      }
    },
    onSettled: (_data, _err, _newType, context) => {
      // 仅在最后一次发出的请求完成时才静默同步服务端权威数据，避免中间过时请求提前 refetch 冲刷乐观 UI
      if (context?.seq === mutationSeqRef.current) {
        qc.invalidateQueries({ queryKey: ['collection', bangumiId] })
        qc.invalidateQueries({ queryKey: ['collections'] })
      }
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
    return (
      <div className="px-4 py-6 sm:px-0">
        <NotFoundPage
          type="not_found"
          statusCode={404}
          title="番剧不存在或链接无效"
          description={`未找到有效的番剧编号${id ? `（"${id}"）` : ''}，请检查访问链接是否正确。`}
        />
      </div>
    )
  }

  if (w.subjectLoading && !w.title) {
    // Keep cinema shell height & multi-column grid stable while subject meta loads (CLS).
    const skeletonPlayer = (
      <div className="relative w-full space-y-2 lg:static sticky top-0 z-40 bg-[var(--kz-bg)] shadow-md lg:shadow-none">
        <div className="kz-player-placeholder text-sm text-[var(--kz-fg-muted)]">
          <div className="flex flex-col items-center gap-2">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--kz-border)] border-t-[var(--kz-accent)]" />
            加载条目…
          </div>
        </div>
      </div>
    )

    const skeletonMeta = (
      <div className="kz-watch-panel space-y-2.5 px-3 py-3">
        <div className="kz-skeleton h-4 w-2/3 rounded-md" />
        <div className="kz-skeleton h-3 w-1/2 rounded-md" />
        <div className="kz-skeleton h-3 w-full rounded-md" />
      </div>
    )

    const skeletonSources = (
      <div className="kz-watch-panel p-3 space-y-2">
        <div className="kz-skeleton h-4 w-20 rounded" />
        <div className="kz-skeleton h-8 w-full rounded-lg" />
      </div>
    )

    const skeletonEps = (
      <div className="kz-watch-panel p-3 space-y-2">
        <div className="kz-skeleton h-4 w-16 rounded" />
        <div className="grid grid-cols-5 gap-1.5 pt-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="kz-skeleton h-8 rounded" />
          ))}
        </div>
      </div>
    )

    const skeletonRail = (
      <>
        {skeletonSources}
        {skeletonEps}
      </>
    )

    return (
      <div className="kz-watch -mx-4 -mt-2 sm:mx-0 sm:mt-0">
        {layoutMode === 'desktop' ? (
          <DesktopWatchLayout
            player={skeletonPlayer}
            meta={skeletonMeta}
            rail={skeletonRail}
          />
        ) : (
          <MobileWatchLayout
            player={skeletonPlayer}
            meta={skeletonMeta}
            sources={skeletonSources}
            episodes={skeletonEps}
          />
        )}
      </div>
    )
  }

  if (!w.subjectLoading && w.subjectError && !w.title) {
    const is404 =
      w.subjectError instanceof ApiError
        ? w.subjectError.status === 404
        : /404|not\s*found|不存在/i.test(
            w.subjectError instanceof Error
              ? w.subjectError.message
              : String(w.subjectError),
          )

    return (
      <div className="px-4 py-6 sm:px-0">
        {is404 ? (
          <NotFoundPage
            type="not_found"
            statusCode={404}
            subjectId={bangumiId}
            title="番剧条目不存在或已下架"
            description={`未找到条目 ID 为 ${bangumiId} 的番剧信息。该条目可能已被 Bangumi 下架、尚未收录或链接有误。`}
            onRetry={w.refetchSubject}
          />
        ) : (
          <NotFoundPage
            type="error"
            statusCode={
              w.subjectError instanceof ApiError ? w.subjectError.status : 500
            }
            subjectId={bangumiId}
            title="番剧信息加载失败"
            description="获取 Bangumi 番剧数据时发生网络异常或服务暂不可用，请检查网络后重试。"
            error={w.subjectError}
            onRetry={w.refetchSubject}
          />
        )}
      </div>
    )
  }

  const hasKeywordTarget = Boolean(
    w.keywordTargetPlugin || w.selection?.plugin,
  )
  const item = w.bangumiItem

  const playerBlock = (
    <div className="relative w-full space-y-2 lg:static sticky top-0 z-40 bg-[var(--kz-bg)] shadow-md lg:shadow-none">
      {!w.mediaSrc && <WatchHudToast message={w.hudMessage} />}
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
          hudMessage={w.hudMessage}
          bangumiId={w.bangumiId}
          episodeNumber={w.episode?.episode ?? 1}
          episodeIndex={w.episode?.sourceIndex ?? (w.episode?.episode === 1 ? 0 : undefined)}
          totalEpisodes={item?.totalEpisodes || item?.eps || 12}
          officialOpedData={w.bgmOpedData}
          widescreen={widescreen}
          onToggleWidescreen={() => setWidescreen((v) => !v)}
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
              ? `正在加载 ${w.pendingSource?.pluginName || w.defaultSourceName} 分集…`
              : w.selection
                ? '请在选集区点击集数开始播放'
                : `已默认搜索 ${w.defaultSourceName}，请稍候或点下方结果`}
          </span>
          <span className="text-xs text-[var(--kz-fg-dim)]">
            {w.selection
              ? `${w.selection.plugin.name} 分集已就绪 · 点击集数即时起播`
              : '默认会选中第一条搜索结果并加载分集；其它源需手动点搜'}
          </span>
        </div>
      )}
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
      searchResults={w.searchResults}
    />
  )

  /* Bilibili-style 选集 — shared desktop rail + mobile */
  const epsPanel = (
    <MobileEpsSection
      bangumiId={bangumiId}
      roads={w.selection?.roads ?? []}
      slots={w.slots}
      activeRoadIndex={activeRoadIndex}
      playingRoad={w.episode?.road}
      playingEpisode={w.episode?.episode}
      playingPageUrl={w.episode?.pageUrl}
      epCount={epCount}
      listExpanded={epsListExpanded}
      roadLoading={w.roadLoading}
      roadError={w.roadError || null}
      pendingPluginName={w.pendingSource?.pluginName}
      hasSelection={Boolean(w.selection)}
      onToggleList={() => startTransition(() => setEpsListExpanded((v) => !v))}
      onSelectRoad={(ri) => startTransition(() => w.setVisibleRoad(ri))}
      onPickSlot={(slot, rd) => startTransition(() => w.pickSlot(slot, rd))}
      onPickEpisode={(ep, rd) => startTransition(() => w.pickEpisode(ep, rd))}
      onRefreshChapters={() => startTransition(() => void w.refreshChapters())}
    />
  )

  /* 番剧推荐模块（选集下方 B 站小横卡流） */
  const currentPluginName =
    w.selection?.plugin.name || w.pluginName || w.defaultSourceName

  const recommendationsPanel = (
    <WatchRecommendations
      bangumiId={bangumiId}
      bangumiItem={w.bangumiItem}
      currentPlugin={currentPluginName}
    />
  )

  /* 番剧吐槽评论区（左侧 Meta 下方，带独立 ErrorBoundary 物理隔离） */
  const commentsPanel = Number.isFinite(bangumiId) && bangumiId > 0 ? (
    <ErrorBoundary
      fallback={
        <div className="rounded-2xl border border-[var(--kz-border)]/40 p-4 text-center text-xs text-[var(--kz-fg-muted)]">
          吐槽评论区加载暂不可用，不影响视频播放
        </div>
      }
    >
      <WatchComments bangumiId={bangumiId} />
    </ErrorBoundary>
  ) : null

  /* Desktop rail: sources, episodes, then recommendations (right column). */
  const rail = (
    <>
      {sourcesPanel}
      {epsPanel}
      {recommendationsPanel}
    </>
  )

  return (
    <div className="kz-watch -mx-4 -mt-2 sm:mx-0 sm:mt-0">
      {layoutMode === 'desktop' ? (
        <DesktopWatchLayout
          player={playerBlock}
          meta={metaBlock}
          rail={rail}
          comments={commentsPanel}
          widescreen={widescreen}
        />
      ) : (
        // Mobile: player → meta → 视频源 → 选集 → 推荐 → 吐槽评论 (Bilibili-style)
        <MobileWatchLayout
          player={playerBlock}
          meta={metaBlock}
          sources={sourcesPanel}
          episodes={epsPanel}
          recommendations={recommendationsPanel}
          comments={commentsPanel}
        />
      )}
    </div>
  )
}
