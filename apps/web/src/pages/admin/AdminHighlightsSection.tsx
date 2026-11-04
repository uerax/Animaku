import { memo, useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  HighlightConfig,
  HighlightItem,
  HighlightPlacement,
} from '@animaku/shared'
import { HIGHLIGHT_SLOTS } from '@animaku/shared'
import {
  adminHighlightsApi,
  HIGHLIGHTS_QUERY_KEY,
} from '../../lib/highlights'
import { useSiteConfigStore } from '../../stores/site-config'
import { AdminSelect } from '../AdminPage'

function createEmptyItem(idSuffix = '0'): HighlightItem {
  return {
    id: `hl_${Date.now()}_${idSuffix}`,
    title: '',
    subtitle: '',
    imageUrl: '',
    linkUrl: '',
    target: '_blank',
    badge: '推广',
  }
}

interface ItemFormProps {
  label: string
  item: HighlightItem
  onChange: (updated: HighlightItem) => void
  onUploadImage: (file: File) => Promise<string | null>
  isUploading: boolean
}

const HighlightItemForm = memo(function HighlightItemForm({
  label,
  item,
  onChange,
  onUploadImage,
  isUploading,
}: ItemFormProps) {
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await onUploadImage(file)
    if (url) {
      onChange({ ...item, imageUrl: url })
    }
    e.target.value = ''
  }

  return (
    <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3.5 space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--kz-border)]/60 pb-1.5 text-xs font-bold text-[var(--kz-fg)]">
        <span>{label}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* 标题 */}
        <div className="space-y-1">
          <label className="font-semibold text-[var(--kz-fg)]">
            标题 <span className="text-[10px] font-normal text-[var(--kz-fg-dim)]">(选填，图片若已有字可留空)</span>
          </label>
          <input
            type="text"
            placeholder="选填，例如：官方交流群、周边特惠、赞助支持"
            value={item.title}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
            className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] transition-all"
          />
        </div>

        {/* 角标文案 */}
        <div className="space-y-1">
          <label className="font-semibold text-[var(--kz-fg)]">角标徽章文案</label>
          <input
            type="text"
            placeholder="例如：公告 / 推广 / 赞助 / 活动"
            value={item.badge || ''}
            onChange={(e) => onChange({ ...item, badge: e.target.value })}
            className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] transition-all"
          />
        </div>

        {/* 宣传图片链接 */}
        <div className="space-y-1 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-[var(--kz-fg)]">
              宣传图片地址 <span className="text-rose-400">*</span>
            </label>
            <label className="cursor-pointer text-[11px] font-semibold text-[var(--kz-accent)] hover:underline inline-flex items-center gap-1">
              <span>{isUploading ? '上传中…' : '📁 上传本地图片'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={isUploading}
                onChange={handleFile}
                className="hidden"
              />
            </label>
          </div>
          <input
            type="text"
            placeholder="https://... 或本地上传生成的地址"
            value={item.imageUrl}
            onChange={(e) => onChange({ ...item, imageUrl: e.target.value })}
            className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs font-mono text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] transition-all"
          />
          <p className="text-[11px] text-[var(--kz-fg-dim)]">
            图片将 100% 满幅充满卡片容器。建议上传清晰横版海报（通栏横幅推荐宽高比约 10:1 至 14:1，双半屏推荐 6:1 至 8:1）。
          </p>
        </div>

        {/* 跳转链接 */}
        <div className="space-y-1">
          <label className="font-semibold text-[var(--kz-fg)]">
            点击跳转链接 <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            placeholder="https://... 或 /about"
            value={item.linkUrl}
            onChange={(e) => onChange({ ...item, linkUrl: e.target.value })}
            className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs font-mono text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] transition-all"
          />
        </div>

        {/* 打开方式 (使用矫正对齐的 AdminSelect) */}
        <div className="space-y-1">
          <label className="font-semibold text-[var(--kz-fg)]">打开方式</label>
          <AdminSelect
            value={item.target || '_blank'}
            onChange={(val) => onChange({ ...item, target: val as '_blank' | '_self' })}
            options={[
              { value: '_blank', label: '新标签页打开 (_blank，推荐)' },
              { value: '_self', label: '当前页直接跳转 (_self)' },
            ]}
            className="w-full"
            dropdownWidth="w-full"
            align="left"
          />
        </div>
      </div>
    </div>
  )
})

export const AdminHighlightsSection = memo(function AdminHighlightsSection() {
  const queryClient = useQueryClient()
  const adminSecret = useSiteConfigStore((s) => s.adminSecret)
  const uploadAnnouncementImage = useSiteConfigStore((s) => s.uploadAnnouncementImage)

  // 全量配置字典
  const [allConfigs, setAllConfigs] = useState<Record<string, HighlightConfig>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState('')

  // 当前选中的点位
  const [selectedPlacement, setSelectedPlacement] = useState<HighlightPlacement>(
    HIGHLIGHT_SLOTS[0].key,
  )

  // 当前点位的表单状态
  const [enabled, setEnabled] = useState(false)
  const [layout, setLayout] = useState<'single' | 'double'>('single')
  const [item1, setItem1] = useState<HighlightItem>(() => createEmptyItem('0'))
  const [item2, setItem2] = useState<HighlightItem>(() => createEmptyItem('1'))

  const currentMeta =
    HIGHLIGHT_SLOTS.find((s) => s.key === selectedPlacement) || HIGHLIGHT_SLOTS[0]

  // 初始化拉取全量展位配置
  const loadAll = useCallback(async () => {
    if (!adminSecret) return
    try {
      const data = await adminHighlightsApi.fetchAll(adminSecret)
      setAllConfigs(data)
    } catch (err) {
      console.warn('[admin-highlights] 拉取失败:', err)
    }
  }, [adminSecret])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // 当选择不同点位或拉取到数据时，将对应点位的配置回填到表单中
  useEffect(() => {
    const cfg = allConfigs[selectedPlacement]
    if (cfg) {
      setEnabled(Boolean(cfg.enabled))
      setLayout(cfg.layout === 'double' ? 'double' : 'single')
      setItem1(cfg.items?.[0] ? { ...cfg.items[0] } : createEmptyItem('0'))
      setItem2(cfg.items?.[1] ? { ...cfg.items[1] } : createEmptyItem('1'))
    } else {
      setEnabled(false)
      setLayout('single')
      setItem1(createEmptyItem('0'))
      setItem2(createEmptyItem('1'))
    }
  }, [selectedPlacement, allConfigs])

  // 上传图片处理函数
  const handleUploadImage = async (file: File): Promise<string | null> => {
    setIsUploading(true)
    try {
      const res = await uploadAnnouncementImage(file)
      if (res.ok && res.imageUrl) {
        return res.imageUrl
      }
      setFeedbackMsg(`❌ 上传失败: ${res.message || '未知错误'}`)
      setTimeout(() => setFeedbackMsg(''), 3000)
      return null
    } finally {
      setIsUploading(false)
    }
  }

  // 核心功能：启用开关点击即保存 (Instant Save on Toggle)
  const handleToggleEnabled = async (nextEnabled: boolean) => {
    if (!adminSecret) return
    setEnabled(nextEnabled)
    setIsToggling(true)

    const itemsToSave: HighlightItem[] = [item1]
    if (currentMeta.maxItems === 2 && layout === 'double') {
      itemsToSave.push(item2)
    }

    try {
      const res = await adminHighlightsApi.save(adminSecret, selectedPlacement, {
        enabled: nextEnabled,
        layout: currentMeta.maxItems === 2 ? layout : 'single',
        items: itemsToSave,
      })

      if (res.ok && res.data) {
        setAllConfigs((prev) => ({
          ...prev,
          [selectedPlacement]: res.data!,
        }))
        // 刷新前台客户端缓存
        void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY })
      } else {
        setFeedbackMsg(`❌ 切换状态失败: ${res.message || '未知错误'}`)
        setTimeout(() => setFeedbackMsg(''), 3000)
      }
    } finally {
      setIsToggling(false)
    }
  }

  // 保存当前点位内容设置（标题、图片、链接等变更）
  const handleSave = async () => {
    if (!adminSecret) return
    setIsSaving(true)
    setFeedbackMsg('')

    const itemsToSave: HighlightItem[] = [item1]
    if (currentMeta.maxItems === 2 && layout === 'double') {
      itemsToSave.push(item2)
    }

    try {
      const res = await adminHighlightsApi.save(adminSecret, selectedPlacement, {
        enabled,
        layout: currentMeta.maxItems === 2 ? layout : 'single',
        items: itemsToSave,
      })

      if (res.ok && res.data) {
        setAllConfigs((prev) => ({
          ...prev,
          [selectedPlacement]: res.data!,
        }))
        setFeedbackMsg(`✅ ${currentMeta.label} 内容设置已保存并即时生效`)
        void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY })
      } else {
        setFeedbackMsg(`❌ 保存失败: ${res.message || '未知错误'}`)
      }
    } finally {
      setIsSaving(false)
      setTimeout(() => setFeedbackMsg(''), 3500)
    }
  }

  // 清空当前点位设置
  const handleDelete = async () => {
    if (!adminSecret) return
    if (!confirm(`确定要清空「${currentMeta.label}」的全部配置吗？`)) return

    setIsSaving(true)
    try {
      const res = await adminHighlightsApi.delete(adminSecret, selectedPlacement)
      if (res.ok) {
        setAllConfigs((prev) => {
          const next = { ...prev }
          delete next[selectedPlacement]
          return next
        })
        setEnabled(false)
        setLayout('single')
        setItem1(createEmptyItem('0'))
        setItem2(createEmptyItem('1'))
        setFeedbackMsg(`✅ 已清空「${currentMeta.label}」`)
        void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY })
      } else {
        setFeedbackMsg(`❌ 清空失败: ${res.message || '未知错误'}`)
      }
    } finally {
      setIsSaving(false)
      setTimeout(() => setFeedbackMsg(''), 3500)
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. 区域切换与点击即保存开关栏 (使用 AdminSelect 彻底矫正错位) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3">
        {/* 左侧：展位区域下拉列表（包裹矫正，严格水平对齐） */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <label className="text-xs font-bold text-[var(--kz-fg)] shrink-0">
            📍 展位区域:
          </label>
          <AdminSelect
            value={selectedPlacement}
            onChange={(val) => setSelectedPlacement(val as HighlightPlacement)}
            options={HIGHLIGHT_SLOTS.map((s) => ({ value: s.key, label: s.label }))}
            className="w-full sm:w-80 shrink-0"
            dropdownWidth="w-full sm:w-80"
            align="left"
          />
        </div>

        {/* 右侧：点击即保存的状态开关 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isToggling}
            onClick={() => handleToggleEnabled(!enabled)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 ${
              enabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                : 'border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)]'
            }`}
            title="点击开关即刻保存并同步刷新前台"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                enabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
              }`}
            />
            <span>{enabled ? '✓ 已启用 (即改即存)' : '⚪ 已停用 (即改即存)'}</span>
          </button>
        </div>
      </div>

      {/* 区域说明标签 */}
      <div className="text-xs text-[var(--kz-fg-muted)] leading-relaxed px-1">
        ℹ️ <strong>当前区域说明</strong>: {currentMeta.description}
      </div>

      {/* 2. 形态选择（仅当 maxItems === 2 时支持单长条与双半屏切换） */}
      {currentMeta.maxItems === 2 && (
        <div className="flex items-center gap-4 text-xs font-semibold text-[var(--kz-fg)] px-1">
          <span>展现形态:</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="highlight_layout"
              checked={layout === 'single'}
              onChange={() => setLayout('single')}
              className="accent-[var(--kz-accent)] cursor-pointer"
            />
            <span>单张通栏长条</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="highlight_layout"
              checked={layout === 'double'}
              onChange={() => setLayout('double')}
              className="accent-[var(--kz-accent)] cursor-pointer"
            />
            <span>双张半屏小长条 (PC并排 / 手机堆叠)</span>
          </label>
        </div>
      )}

      {/* 3. 广告项编辑表单 */}
      <div className="space-y-3">
        <HighlightItemForm
          label={currentMeta.maxItems === 2 && layout === 'double' ? '1️⃣ 第一张卡片' : '宣传卡片内容'}
          item={item1}
          onChange={setItem1}
          onUploadImage={handleUploadImage}
          isUploading={isUploading}
        />

        {currentMeta.maxItems === 2 && layout === 'double' && (
          <HighlightItemForm
            label="2️⃣ 第二张卡片 (并排)"
            item={item2}
            onChange={setItem2}
            onUploadImage={handleUploadImage}
            isUploading={isUploading}
          />
        )}
      </div>

      {/* 4. 实时模拟预览 (Live Preview) */}
      {(item1.imageUrl || (layout === 'double' && item2.imageUrl)) && (
        <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 space-y-2">
          <div className="text-xs font-semibold text-[var(--kz-fg-muted)]">
            👁️ 当前配置实时效果预览
          </div>
          <div className={layout === 'double' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : 'block'}>
            {item1.imageUrl && (
              <div className="relative h-16 sm:h-20 overflow-hidden rounded-xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-soft)]">
                <img src={item1.imageUrl} alt="" className="h-full w-full object-cover" />
                {item1.badge && (
                  <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                    {item1.badge}
                  </span>
                )}
                {item1.title && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-xs font-semibold text-white truncate">
                    {item1.title}
                  </div>
                )}
              </div>
            )}
            {layout === 'double' && item2.imageUrl && (
              <div className="relative h-16 sm:h-20 overflow-hidden rounded-xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-soft)]">
                <img src={item2.imageUrl} alt="" className="h-full w-full object-cover" />
                {item2.badge && (
                  <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                    {item2.badge}
                  </span>
                )}
                {item2.title && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-xs font-semibold text-white truncate">
                    {item2.title}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. 底部操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--kz-border)]/40">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isSaving || isToggling}
          className="text-xs text-rose-400 hover:underline cursor-pointer"
        >
          清空此区域配置
        </button>

        <div className="flex items-center gap-3">
          {feedbackMsg && (
            <span className="text-xs font-semibold text-[var(--kz-fg)] animate-in fade-in duration-200">
              {feedbackMsg}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploading || isToggling}
            className="rounded-xl bg-[var(--kz-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSaving ? '正在保存…' : '💾 保存当前卡片内容'}
          </button>
        </div>
      </div>
    </div>
  )
})
