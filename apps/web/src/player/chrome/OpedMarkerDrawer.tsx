/**
 * OP/ED 标记助手面板 (OpedMarkerDrawer / OpedMarkerPanel)
 *
 * 核心架构（与 DanmakuPanel 完全对齐）：
 * 1. 桌面端 (Desktop)：作为控制栏 popover 悬浮在按钮上方，**0 背景蒙版**，不遮挡画面与视频播放；
 * 2. 移动端 (Mobile)：采用 createPortal 挂载至全屏 DOM / body，提供居中沉浸式毛玻璃卡片与轻量遮罩；
 * 3. 极简打点 + 90s 智能推算 + 二次终点校准 + 误差微调；
 * 4. 采用项目统一的 CSS 变量 tokens（支持明暗双色主题）；
 * 5. 全剧进度矩阵 + Diff 语义分析 + 0 Token 直达 GitHub PR 与复制 txt。
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BgmOpedEntry } from '../../lib/bangumi-oped'
import {
  buildBangumiOpedContent,
  diffSubjectOped,
  submitSingleSubjectToGithub,
  useCustomOpedStore,
} from '../../lib/custom-oped-store'
import { formatTime } from '../media/format'
import { IconCheck, IconCopy, IconLink, IconOpedMarker } from './icons'
import type { PointerMode } from './usePointerMode'

export interface OpedMarkerDrawerProps {
  open: boolean
  onClose: () => void
  currentTime: number
  duration: number
  bangumiId: number
  bangumiTitle?: string
  episodeNumber: number
  totalEpisodes?: number
  officialOpedData?: Map<number, BgmOpedEntry> | null
  onSeek?: (time: number) => void
  onToast?: (message: string) => void
  layout?: PointerMode
}

const DURATION_PRESETS = [
  { label: '30s (泡面番)', value: 30 },
  { label: '60s (短曲)', value: 60 },
  { label: '90s (标准)', value: 90 },
  { label: '120s (特别篇)', value: 120 },
]

export function OpedMarkerDrawer(props: OpedMarkerDrawerProps) {
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

/* ─── 桌面端无蒙版悬浮卡片 (Desktop Card) ─── */

function DesktopCard(props: OpedMarkerDrawerProps) {
  return (
    <div
      className="kz-oped-panel kz-oped-panel--desktop flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/98 text-[var(--kz-fg)] shadow-2xl backdrop-blur-2xl pointer-events-auto"
      style={{ maxHeight: 'min(34rem, calc(100dvh - 6rem))' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="OP/ED 标记助手"
      data-player-chrome
    >
      <OpedPanelContent {...props} isMobile={false} />
    </div>
  )
}

/* ─── 移动端居中模态卡片 (Mobile Sheet with Backdrop) ─── */

function MobileSheet(props: OpedMarkerDrawerProps) {
  const { onClose } = props
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[99998] bg-black/65 backdrop-blur-sm cursor-pointer border-0 p-0 m-0"
        aria-label="关闭 OP/ED 标记助手"
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div
        className="fixed inset-0 z-[99999] m-auto flex flex-col w-[90%] max-w-[24rem] h-[82dvh] max-h-[38rem] bg-[var(--kz-bg-elevated)]/98 text-[var(--kz-fg)] backdrop-blur-2xl border border-[var(--kz-border)] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="OP/ED 标记助手"
        data-player-chrome
      >
        <OpedPanelContent {...props} isMobile={true} />
      </div>
    </>
  )
}

/* ─── 共享面板内容组件 (Panel Content) ─── */

function OpedPanelContent({
  onClose,
  currentTime,
  duration,
  bangumiId,
  bangumiTitle = '',
  episodeNumber,
  totalEpisodes = 12,
  officialOpedData,
  onSeek,
  onToast,
}: OpedMarkerDrawerProps & { isMobile: boolean }) {
  const [activeEp, setActiveEp] = useState<number>(episodeNumber)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showPreviewTxt, setShowPreviewTxt] = useState(false)
  const [prSubmittedGuide, setPrSubmittedGuide] = useState(false)

  useEffect(() => {
    if (episodeNumber > 0) {
      setActiveEp(episodeNumber)
    }
  }, [episodeNumber])

  const store = useCustomOpedStore()
  const subjectRecord = store.subjects[bangumiId]
  const defaultDuration = subjectRecord?.defaultDuration ?? 90
  const activeEpMark = subjectRecord?.episodes[activeEp]
  const officialActiveEp = officialOpedData?.get(activeEp)

  // 计算有效 OP/ED 范围（本地优先覆盖）
  const currentOp = useMemo(() => {
    if (activeEpMark?.noOp) return { no: true, range: null, isLocal: true }
    if (activeEpMark?.op) return { no: false, range: activeEpMark.op, isLocal: true }
    if (officialActiveEp?.op) return { no: false, range: officialActiveEp.op, isLocal: false }
    return { no: false, range: null, isLocal: false }
  }, [activeEpMark, officialActiveEp])

  const currentEd = useMemo(() => {
    if (activeEpMark?.noEd) return { no: true, range: null, isLocal: true }
    if (activeEpMark?.ed) return { no: false, range: activeEpMark.ed, isLocal: true }
    if (officialActiveEp?.ed) return { no: false, range: officialActiveEp.ed, isLocal: false }
    return { no: false, range: null, isLocal: false }
  }, [activeEpMark, officialActiveEp])

  // 本剧集数列表
  const displayTotalEpisodes = useMemo(() => {
    let max = Math.max(totalEpisodes || 12, episodeNumber || 1)
    if (subjectRecord) {
      for (const ep of Object.keys(subjectRecord.episodes)) {
        max = Math.max(max, Number(ep))
      }
    }
    if (officialOpedData) {
      for (const ep of officialOpedData.keys()) {
        max = Math.max(max, ep)
      }
    }
    return max
  }, [totalEpisodes, episodeNumber, subjectRecord, officialOpedData])

  const episodesList = useMemo(() => {
    return Array.from({ length: displayTotalEpisodes }, (_, i) => i + 1)
  }, [displayTotalEpisodes])

  // 计算精细化变更 Diff
  const diffResult = useMemo(() => {
    return diffSubjectOped(
      bangumiId,
      officialOpedData,
      subjectRecord?.episodes,
      displayTotalEpisodes,
    )
  }, [bangumiId, officialOpedData, subjectRecord?.episodes, displayTotalEpisodes])

  // 打标动作
  const handleMarkOpStart = () => {
    if (!bangumiId || activeEp <= 0) return
    const cur = Math.max(0, Math.round(currentTime))
    store.markOpStart(
      bangumiId,
      activeEp,
      cur,
      defaultDuration,
      bangumiTitle,
      displayTotalEpisodes,
    )
    onToast?.(`已标记第 ${activeEp} 集 OP: ${formatTime(cur)} ~ ${formatTime(cur + defaultDuration)}`)
  }

  const handleMarkOpEnd = () => {
    if (!bangumiId || activeEp <= 0) return
    const cur = Math.max(0, Math.round(currentTime))
    store.markOpEnd(bangumiId, activeEp, cur)
    onToast?.(`已校准第 ${activeEp} 集 OP 终点: ${formatTime(cur)}`)
  }

  const handleMarkEdStart = () => {
    if (!bangumiId || activeEp <= 0) return
    const cur = Math.max(0, Math.round(currentTime))
    store.markEdStart(
      bangumiId,
      activeEp,
      cur,
      defaultDuration,
      bangumiTitle,
      displayTotalEpisodes,
    )
    onToast?.(`已标记第 ${activeEp} 集 ED: ${formatTime(cur)} ~ ${formatTime(cur + defaultDuration)}`)
  }

  const handleMarkEdEnd = () => {
    if (!bangumiId || activeEp <= 0) return
    const cur = Math.max(0, Math.round(currentTime))
    store.markEdEnd(bangumiId, activeEp, cur)
    onToast?.(`已校准第 ${activeEp} 集 ED 终点: ${formatTime(cur)}`)
  }

  // 复制完整 bangumi-oped txt
  const handleCopyTxt = async () => {
    const id = Number(bangumiId)
    if (!id) return
    const liveEpisodes = useCustomOpedStore.getState().subjects[id]?.episodes
    const txt = buildBangumiOpedContent(officialOpedData, liveEpisodes)
    try {
      await navigator.clipboard.writeText(txt)
      setCopied(true)
      onToast?.('已复制本番 bangumi-oped 标准格式')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onToast?.('复制失败，请检查剪贴板权限')
    }
  }

  // 提交到 GitHub PR
  const handleSubmitPr = async () => {
    const id = Number(bangumiId)
    if (!id) return
    setSubmitting(true)
    const liveEpisodes = useCustomOpedStore.getState().subjects[id]?.episodes
    const txt = buildBangumiOpedContent(officialOpedData, liveEpisodes)
    const existsOnRemote = Boolean(officialOpedData && officialOpedData.size > 0)
    const liveDiff = diffSubjectOped(id, officialOpedData, liveEpisodes, displayTotalEpisodes)
    try {
      const res = await submitSingleSubjectToGithub(
        id,
        txt,
        existsOnRemote,
        liveDiff.commitMessage,
      )
      if (res.method === 'edit_file_clipboard') {
        setPrSubmittedGuide(true)
        onToast?.('最新全量合并数据已写入剪贴板！')
      } else {
        onToast?.('已打开 GitHub 新建文件 PR 页面')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* 顶部 Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--kz-border)] px-4 py-3 bg-[var(--kz-bg-soft)]/60">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <IconOpedMarker className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[var(--kz-fg)]">OP/ED 标记助手</h3>
            <p className="text-[11px] text-[var(--kz-fg-muted)] truncate max-w-[200px]">
              {bangumiTitle ? `${bangumiTitle} · ` : ''}ID: {bangumiId || '未知'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-soft)] hover:text-[var(--kz-fg)] transition-colors border-0 bg-transparent cursor-pointer text-sm"
          onClick={onClose}
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* 主体滚动区域 */}
      <div className="flex-1 space-y-3.5 overflow-y-auto overscroll-contain p-4 text-xs">
        {/* 当前集数选择与当前播放时间 */}
        <div className="flex items-center justify-between rounded-xl bg-[var(--kz-bg-soft)]/50 p-3 border border-[var(--kz-border)]">
          <div>
            <div className="flex items-center gap-1.5 font-medium text-[var(--kz-fg)]">
              <span>正在标记：</span>
              <select
                value={activeEp}
                onChange={(e) => setActiveEp(Number(e.target.value))}
                className="rounded-md bg-[var(--kz-bg)] px-2 py-0.5 font-semibold text-sky-600 dark:text-sky-400 outline-none border border-[var(--kz-border)]"
              >
                {episodesList.map((ep) => (
                  <option key={ep} value={ep}>
                    第 {ep} 集 {ep === episodeNumber ? '(当前播放)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[11px] text-[var(--kz-fg-muted)]">
              当前播放进度: <span className="font-mono text-[var(--kz-fg)] font-semibold">{formatTime(currentTime)}</span> /{' '}
              {formatTime(duration)}
            </p>
          </div>
          {activeEp !== episodeNumber && (
            <button
              type="button"
              className="rounded-lg bg-sky-500/15 px-2 py-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-500/25 border-0 cursor-pointer transition-colors"
              onClick={() => setActiveEp(episodeNumber)}
            >
              回到在播集
            </button>
          )}
        </div>

        {/* 默认推算时长预设胶囊 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--kz-fg-muted)]">
            <span>默认推算时长预设</span>
            <span className="text-[var(--kz-fg-dim)]">点击自动推算</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => store.setSubjectDefaultDuration(bangumiId, preset.value)}
                className={`rounded-lg py-1 text-center font-mono text-[11px] transition-colors border cursor-pointer ${
                  defaultDuration === preset.value
                    ? 'border-sky-500 bg-sky-500/20 font-bold text-sky-600 dark:text-sky-400'
                    : 'border-[var(--kz-border)] bg-[var(--kz-bg)] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-soft)] hover:text-[var(--kz-fg)]'
                }`}
              >
                {preset.value}s
              </button>
            ))}
          </div>
        </div>

        {/* OP 片头曲卡片 */}
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.04] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-sky-600 dark:text-sky-400">
              <span className="h-2 w-2 rounded-full bg-sky-500 dark:bg-sky-400" />
              片头曲 (OP)
            </span>
            <span className="text-[11px]">
              {currentOp.no ? (
                <span className="rounded bg-[var(--kz-bg)] px-1.5 py-0.5 text-[var(--kz-fg-muted)] border border-[var(--kz-border)]">
                  无 OP (-1)
                </span>
              ) : currentOp.range ? (
                <span className={`rounded px-1.5 py-0.5 font-mono ${currentOp.isLocal ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400 font-medium' : 'bg-[var(--kz-bg)] text-[var(--kz-fg-muted)] border border-[var(--kz-border)]'}`}>
                  {formatTime(currentOp.range[0])} ~ {formatTime(currentOp.range[1])} ({currentOp.range[1] - currentOp.range[0]}s)
                  {currentOp.isLocal ? ' [本地]' : ' [官方]'}
                </span>
              ) : (
                <span className="text-[var(--kz-fg-dim)]">未标记</span>
              )}
            </span>
          </div>

          {/* OP 操作按钮组 */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleMarkOpStart}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 font-semibold text-white shadow-sm hover:bg-sky-400 active:scale-[0.98] border-0 cursor-pointer transition-all"
            >
              <span>⏺ 设当前时间为 OP 起点</span>
              <span className="text-xs font-normal opacity-90">(自动 +{defaultDuration}s)</span>
            </button>

            {/* 二次精准校准终点 */}
            {currentOp.range && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleMarkOpEnd}
                  className="flex-1 rounded-lg border border-sky-500/30 bg-sky-500/10 py-1.5 font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 cursor-pointer transition-colors"
                  title="精准校准：将当前视频时间设为 OP 结束"
                >
                  🎯 设当前时间为终点
                </button>
                <button
                  type="button"
                  onClick={() => onSeek?.(currentOp.range![0])}
                  className="rounded-lg bg-[var(--kz-bg)] border border-[var(--kz-border)] px-2.5 py-1.5 text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] cursor-pointer transition-colors"
                  title="跳转到 OP 起点预览"
                >
                  ▷ 起点
                </button>
                <button
                  type="button"
                  onClick={() => onSeek?.(currentOp.range![1])}
                  className="rounded-lg bg-[var(--kz-bg)] border border-[var(--kz-border)] px-2.5 py-1.5 text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] cursor-pointer transition-colors"
                  title="跳转到 OP 终点预览"
                >
                  ▷ 终点
                </button>
              </div>
            )}

            {/* 微调与清除 */}
            {currentOp.range && (
              <div className="flex items-center justify-between pt-1 border-t border-[var(--kz-border)] text-[11px] text-[var(--kz-fg-muted)]">
                <div className="flex items-center gap-1">
                  <span>起点微调:</span>
                  <button
                    type="button"
                    onClick={() => store.nudgeOp(bangumiId, activeEp, 'start', -1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    onClick={() => store.nudgeOp(bangumiId, activeEp, 'start', 1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    +1s
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span>终点微调:</span>
                  <button
                    type="button"
                    onClick={() => store.nudgeOp(bangumiId, activeEp, 'end', -1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    onClick={() => store.nudgeOp(bangumiId, activeEp, 'end', 1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    +1s
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] pt-0.5">
              <button
                type="button"
                onClick={() => store.setNoOp(bangumiId, activeEp, !currentOp.no)}
                className="text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] underline decoration-dotted bg-transparent border-0 cursor-pointer"
              >
                {currentOp.no ? '取消无 OP 标记' : '标记本集无 OP (-1)'}
              </button>
              {activeEpMark?.op && (
                <button
                  type="button"
                  onClick={() => store.setOpRange(bangumiId, activeEp, null)}
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300 bg-transparent border-0 cursor-pointer"
                >
                  清除 OP 本地标记
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ED 片尾曲卡片 */}
        <div className="rounded-xl border border-purple-500/25 bg-purple-500/[0.04] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-purple-600 dark:text-purple-400">
              <span className="h-2 w-2 rounded-full bg-purple-500 dark:bg-purple-400" />
              片尾曲 (ED)
            </span>
            <span className="text-[11px]">
              {currentEd.no ? (
                <span className="rounded bg-[var(--kz-bg)] px-1.5 py-0.5 text-[var(--kz-fg-muted)] border border-[var(--kz-border)]">
                  无 ED (-1)
                </span>
              ) : currentEd.range ? (
                <span className={`rounded px-1.5 py-0.5 font-mono ${currentEd.isLocal ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 font-medium' : 'bg-[var(--kz-bg)] text-[var(--kz-fg-muted)] border border-[var(--kz-border)]'}`}>
                  {formatTime(currentEd.range[0])} ~ {formatTime(currentEd.range[1])} ({currentEd.range[1] - currentEd.range[0]}s)
                  {currentEd.isLocal ? ' [本地]' : ' [官方]'}
                </span>
              ) : (
                <span className="text-[var(--kz-fg-dim)]">未标记</span>
              )}
            </span>
          </div>

          {/* ED 操作按钮组 */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleMarkEdStart}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-purple-500 active:scale-[0.98] border-0 cursor-pointer transition-all"
            >
              <span>⏺ 设当前时间为 ED 起点</span>
              <span className="text-xs font-normal opacity-90">(自动 +{defaultDuration}s)</span>
            </button>

            {/* 二次精准校准终点 */}
            {currentEd.range && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleMarkEdEnd}
                  className="flex-1 rounded-lg border border-purple-500/30 bg-purple-500/10 py-1.5 font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 cursor-pointer transition-colors"
                  title="精准校准：将当前视频时间设为 ED 结束"
                >
                  🎯 设当前时间为终点
                </button>
                <button
                  type="button"
                  onClick={() => onSeek?.(currentEd.range![0])}
                  className="rounded-lg bg-[var(--kz-bg)] border border-[var(--kz-border)] px-2.5 py-1.5 text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] cursor-pointer transition-colors"
                  title="跳转到 ED 起点预览"
                >
                  ▷ 起点
                </button>
                <button
                  type="button"
                  onClick={() => onSeek?.(currentEd.range![1])}
                  className="rounded-lg bg-[var(--kz-bg)] border border-[var(--kz-border)] px-2.5 py-1.5 text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] cursor-pointer transition-colors"
                  title="跳转到 ED 终点预览"
                >
                  ▷ 终点
                </button>
              </div>
            )}

            {/* 微调与清除 */}
            {currentEd.range && (
              <div className="flex items-center justify-between pt-1 border-t border-[var(--kz-border)] text-[11px] text-[var(--kz-fg-muted)]">
                <div className="flex items-center gap-1">
                  <span>起点微调:</span>
                  <button
                    type="button"
                    onClick={() => store.nudgeEd(bangumiId, activeEp, 'start', -1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    onClick={() => store.nudgeEd(bangumiId, activeEp, 'start', 1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    +1s
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span>终点微调:</span>
                  <button
                    type="button"
                    onClick={() => store.nudgeEd(bangumiId, activeEp, 'end', -1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    onClick={() => store.nudgeEd(bangumiId, activeEp, 'end', 1)}
                    className="rounded bg-[var(--kz-bg)] border border-[var(--kz-border)] px-1.5 py-0.5 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                  >
                    +1s
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] pt-0.5">
              <button
                type="button"
                onClick={() => store.setNoEd(bangumiId, activeEp, !currentEd.no)}
                className="text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] underline decoration-dotted bg-transparent border-0 cursor-pointer"
              >
                {currentEd.no ? '取消无 ED 标记' : '标记本集无 ED (-1)'}
              </button>
              {activeEpMark?.ed && (
                <button
                  type="button"
                  onClick={() => store.setEdRange(bangumiId, activeEp, null)}
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300 bg-transparent border-0 cursor-pointer"
                >
                  清除 ED 本地标记
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 本番全剧进度矩阵 */}
        <div className="space-y-2 pt-2 border-t border-[var(--kz-border)]">
          <div className="flex items-center justify-between text-[var(--kz-fg)] font-medium">
            <span>全剧标记总览</span>
            <span className="text-[11px] text-[var(--kz-fg-dim)]">点击切换集数</span>
          </div>
          <div className="max-h-44 overflow-y-auto overscroll-contain rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-1.5 space-y-1">
            {episodesList.map((ep) => {
              const diff = diffResult.diffMap[ep]

              return (
                <button
                  key={ep}
                  type="button"
                  onClick={() => setActiveEp(ep)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] transition-colors border cursor-pointer ${
                    activeEp === ep
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/35 font-semibold'
                      : 'text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-soft)] hover:text-[var(--kz-fg)] border-transparent bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>第 {ep} 集</span>
                    {diff?.source === 'user-new' && (
                      <span className="rounded bg-emerald-500/15 px-1 py-0.2 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        新增
                      </span>
                    )}
                    {diff?.source === 'user-override' && (
                      <span className="rounded bg-amber-500/15 px-1 py-0.2 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                        修正
                      </span>
                    )}
                    {diff?.source === 'official' && (
                      <span className="rounded bg-[var(--kz-bg-soft)] px-1 py-0.2 text-[9px] text-[var(--kz-fg-dim)] border border-[var(--kz-border)]">
                        官方
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px]">
                      OP: {diff?.opFormatted ?? '--'} | ED: {diff?.edFormatted ?? '--'}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        diff?.source === 'user-new' || diff?.source === 'user-override'
                          ? 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                          : diff?.source === 'official'
                            ? 'bg-sky-500 dark:bg-sky-400'
                            : 'bg-zinc-400 dark:bg-zinc-600'
                      }`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 变更摘要与底部操作栏 */}
      <div className="border-t border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60 p-3 space-y-2 shrink-0">
        {diffResult.totalChangedCount > 0 && (
          <div className="text-[11px] text-[var(--kz-fg-muted)] flex items-center justify-between">
            <span className="text-[var(--kz-fg)] font-medium">本次变更:</span>
            <span
              className="text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[220px] text-right font-mono"
              title={diffResult.prSummaryText}
            >
              {diffResult.prSummaryText}
            </span>
          </div>
        )}

        {/* 编辑已有文件粘贴向导横幅 */}
        {prSubmittedGuide && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200/90 space-y-1.5 animate-in fade-in duration-150 shadow-sm">
            <div className="flex items-center justify-between font-bold text-amber-950 dark:text-amber-300">
              <span>📋 全量合并数据已写入剪贴板</span>
              <button
                type="button"
                onClick={() => setPrSubmittedGuide(false)}
                className="text-amber-700 hover:text-amber-950 dark:text-amber-400 dark:hover:text-amber-200 border-0 bg-transparent cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] leading-relaxed font-medium">
              GitHub 编辑页已在后台打开。因 GitHub 限制，请在编辑框中按 <kbd className="rounded bg-amber-200/80 dark:bg-black/40 text-amber-950 dark:text-amber-300 border border-amber-300/80 dark:border-transparent px-1 py-0.5 font-mono font-bold shadow-xs">Ctrl+A</kbd> 全选，再按 <kbd className="rounded bg-amber-200/80 dark:bg-black/40 text-amber-950 dark:text-amber-300 border border-amber-300/80 dark:border-transparent px-1 py-0.5 font-mono font-bold shadow-xs">Ctrl+V</kbd> 粘贴覆盖，即可提交包含官方原集数与本地打标的完整 PR！
            </p>
            <div className="flex gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleCopyTxt}
                className="rounded bg-amber-100 hover:bg-amber-200/90 dark:bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-950 dark:text-amber-300 border border-amber-300/60 dark:border-transparent cursor-pointer transition-colors"
              >
                再次复制全量数据
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = Number(bangumiId)
                  if (!id) return
                  const filename = `${id}/${id}.txt`
                  const liveEpisodes = useCustomOpedStore.getState().subjects[id]?.episodes
                  const liveDiff = diffSubjectOped(id, officialOpedData, liveEpisodes, displayTotalEpisodes)
                  const commitMsg = encodeURIComponent(liveDiff.commitMessage)
                  window.open(`https://github.com/uerax/bangumi-oped/edit/data/${filename}?message=${commitMsg}`, '_blank')
                }}
                className="rounded bg-amber-100 hover:bg-amber-200/90 dark:bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-950 dark:text-amber-300 border border-amber-300/60 dark:border-transparent cursor-pointer transition-colors"
              >
                重新打开 GitHub 编辑页
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopyTxt}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] py-2 text-xs font-medium text-[var(--kz-fg)] hover:bg-[var(--kz-bg-elevated)] active:scale-[0.98] cursor-pointer transition-all"
          >
            {copied ? <IconCheck className="h-4 w-4 text-emerald-400" /> : <IconCopy className="h-4 w-4" />}
            <span>{copied ? '已复制全量 txt' : '复制全量 txt'}</span>
          </button>
          <button
            type="button"
            onClick={handleSubmitPr}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 border-0 cursor-pointer transition-all"
          >
            <IconLink className="h-4 w-4" />
            <span>{submitting ? '跳转中...' : '提交本番 PR'}</span>
          </button>
        </div>

        {/* 展开预览合并后 txt */}
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => setShowPreviewTxt((v) => !v)}
            className="w-full text-[10.5px] text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] text-center bg-transparent border-0 cursor-pointer"
          >
            {showPreviewTxt ? '▲ 折叠合并后 txt 预览' : '▼ 查看合并后完整 txt (含官方原有与本地标记)'}
          </button>
          {showPreviewTxt && (
            <textarea
              readOnly
              rows={4}
              value={buildBangumiOpedContent(officialOpedData, subjectRecord?.episodes)}
              className="mt-1.5 w-full rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] p-2 font-mono text-[10.5px] text-[var(--kz-fg)] outline-none resize-y"
            />
          )}
        </div>
      </div>
    </>
  )
}
