import { useMemo, useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  groupWatchHistory,
  computeHistoryStats,
  type HistoryTimeGroupKey,
} from '@animaku/shared'
import { useHistoryStore } from '../stores/history'
import { PageHeader } from '../components/ui'
import { EMPTY_ARRAY } from '../lib/stable'
import { HistoryStatsBar } from './history/HistoryStatsBar'
import { HistoryToolbar } from './history/HistoryToolbar'
import { HistoryTimelineSection } from './history/HistoryTimelineSection'
import { HistoryConfirmModal } from './history/HistoryConfirmModal'

interface ModalState {
  isOpen: boolean
  title: string
  description: string
  confirmText?: string
  isDanger?: boolean
  onConfirm: () => void
}

const INITIAL_MODAL_STATE: ModalState = {
  isOpen: false,
  title: '',
  description: '',
  onConfirm: () => {},
}

export function HistoryPage() {
  const items = useHistoryStore((s) =>
    Array.isArray(s.items) ? s.items : EMPTY_ARRAY,
  )
  const remove = useHistoryStore((s) => s.remove)
  const removeMany = useHistoryStore((s) => s.removeMany)
  const clear = useHistoryStore((s) => s.clear)

  // 搜索关键字
  const [searchQuery, setSearchQuery] = useState('')
  // 批量管理模式
  const [isBatchMode, setIsBatchMode] = useState(false)
  // 已选中的记录 ID
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 确认弹窗状态
  const [modalState, setModalState] = useState<ModalState>(INITIAL_MODAL_STATE)

  // 统计指标汇总
  const stats = useMemo(() => computeHistoryStats(items), [items])

  // 搜索过滤后的条目列表
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.pluginName.toLowerCase().includes(q),
    )
  }, [items, searchQuery])

  // 当搜索关键词变化时，联动清空选择状态，避免跨检索条件误删不可见记录
  useEffect(() => {
    setSelectedIds(new Set())
  }, [searchQuery])

  // 业界四段式时间轴分组
  const groups = useMemo(
    () => groupWatchHistory(filteredItems),
    [filteredItems],
  )

  // 切换批量选择
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // 全选 / 取消全选当前过滤结果
  const isAllSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedIds.has(item.id))

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map((item) => item.id)))
    }
  }, [isAllSelected, filteredItems])

  // 切换批量模式
  const handleToggleBatchMode = useCallback(() => {
    setIsBatchMode((prev) => {
      if (prev) {
        setSelectedIds(new Set())
      }
      return !prev
    })
  }, [])

  // 关闭二次确认弹窗
  const handleCloseModal = useCallback(() => {
    setModalState(INITIAL_MODAL_STATE)
  }, [])

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    // 双重安全防护：严格仅对当前可见且被勾选的记录执行删除
    const targetIds = filteredItems
      .filter((item) => selectedIds.has(item.id))
      .map((item) => item.id)

    if (targetIds.length === 0) return

    setModalState({
      isOpen: true,
      title: '批量删除所选记录',
      description: `确定要永久删除所选的 ${targetIds.length} 条观看记录吗？此操作无法撤销。`,
      confirmText: '确认删除',
      isDanger: true,
      onConfirm: () => {
        removeMany(targetIds)
        setSelectedIds(new Set())
        setIsBatchMode(false)
      },
    })
  }, [filteredItems, selectedIds, removeMany])

  // 清空整组记录（如“清空今天”）
  const handleClearGroup = useCallback(
    (key: HistoryTimeGroupKey, label: string) => {
      const targetGroup = groups.find((g) => g.key === key)
      if (!targetGroup || targetGroup.items.length === 0) return
      setModalState({
        isOpen: true,
        title: `清空「${label}」观看记录`,
        description: `确定要删除「${label}」时间段内的全部 ${targetGroup.items.length} 条播放历史吗？`,
        confirmText: '确认清空',
        isDanger: true,
        onConfirm: () => {
          removeMany(targetGroup.items.map((i) => i.id))
        },
      })
    },
    [groups, removeMany],
  )

  // 清空全部历史记录
  const handleClearAll = useCallback(() => {
    if (items.length === 0) return
    setModalState({
      isOpen: true,
      title: '清空全部观看历史',
      description: `确定要清空全部 ${items.length} 条观看历史记录吗？本地保存的播放进度将完全重置。`,
      confirmText: '清空全部',
      isDanger: true,
      onConfirm: () => {
        clear()
        setSelectedIds(new Set())
        setIsBatchMode(false)
      },
    })
  }, [items.length, clear])

  // 单条记录快速删除
  const handleDeleteEntry = useCallback(
    (id: string) => {
      remove(id)
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [remove],
  )

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <PageHeader
        title="观看历史"
        description="本地保存的播放进度（基于浏览器持久化存储，支持断点续播）"
      />

      {/* 顶部轻量数据概览 */}
      <HistoryStatsBar stats={stats} />

      {/* 顶部搜索与管理操作栏 */}
      <HistoryToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isBatchMode={isBatchMode}
        onToggleBatchMode={handleToggleBatchMode}
        onClearAll={handleClearAll}
        hasItems={items.length > 0}
        isAllSelected={isAllSelected}
        selectedCount={selectedIds.size}
        totalCount={filteredItems.length}
        onToggleSelectAll={handleToggleSelectAll}
        onBatchDelete={handleBatchDelete}
      />

      {/* 全局空状态 */}
      {items.length === 0 && (
        <div className="kz-surface rounded-2xl border border-[var(--kz-border)] p-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--kz-bg-soft)] text-[var(--kz-fg-dim)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <div className="text-base font-semibold text-[var(--kz-fg)]">
            暂无观看历史
          </div>
          <p className="mt-1 text-sm text-[var(--kz-fg-muted)]">
            你播放过的番剧和进度会自动保存在这里
          </p>
          <div className="mt-6">
            <Link
              to="/anime"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--kz-accent)] px-4 py-2 text-sm font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
            >
              <span>去热门番剧逛逛</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      )}

      {/* 搜索无匹配结果状态 */}
      {items.length > 0 && filteredItems.length === 0 && (
        <div className="kz-surface rounded-2xl border border-[var(--kz-border)] p-8 text-center">
          <div className="text-sm text-[var(--kz-fg-muted)]">
            未找到包含「{searchQuery}」的观看记录
          </div>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="mt-3 text-xs font-semibold text-[var(--kz-accent)] hover:underline"
          >
            清空搜索条件
          </button>
        </div>
      )}

      {/* 核心时间轴列表 */}
      {groups.length > 0 && (
        <div className="mt-2">
          {groups.map((group) => (
            <HistoryTimelineSection
              key={group.key}
              group={group}
              isBatchMode={isBatchMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onDeleteEntry={handleDeleteEntry}
              onClearGroup={handleClearGroup}
            />
          ))}
        </div>
      )}

      {/* 自定义轻量确认弹窗 */}
      <HistoryConfirmModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        confirmText={modalState.confirmText}
        isDanger={modalState.isDanger}
        onConfirm={modalState.onConfirm}
        onClose={handleCloseModal}
      />
    </div>
  )
}
