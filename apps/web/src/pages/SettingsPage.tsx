import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PluginMeta } from '@animaku/shared'
import {
  comparePluginOrder,
  PLAYER_SPEEDS,
  bangumiOAuthUrl,
  isAnxRule,
} from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import {
  fetchServerHealth,
  type ServerHealth,
} from '../lib/server-capabilities'
import {
  BANGUMI_IMAGE_HOST_OPTIONS,
  DEFAULT_BANGUMI_IMAGE_HOST,
} from '../lib/bangumi-image-host'
import { useSettingsStore } from '../stores/settings'
import { isBuiltinPlugin, usePluginStore } from '../stores/plugins'
import { PageHeader } from '../components/ui'
import { getSiteBranding } from '../lib/site-branding'
import { EMPTY_ARRAY, FALLBACK_DANMAKU, FALLBACK_NAV, FALLBACK_PLAYER } from '../lib/stable'
import {
  buildBangumiOpedContent,
  buildBatchOpedGithubUploadUrl,
  createOpedZipBlob,
  diffSubjectOped,
  submitSingleSubjectToGithub,
  useCustomOpedStore,
} from '../lib/custom-oped-store'
import { fetchBangumiOpedDetail } from '../lib/bangumi-oped'

/** Sort plugins by user-defined order, falling back to weight > alphabetical. */
function sortPluginsByOrder(
  plugins: PluginMeta[],
  order: string[],
): PluginMeta[] {
  if (!order.length) {
    return [...plugins].sort(comparePluginOrder)
  }
  const rank = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    rank.set(order[i].toLowerCase(), i)
  }
  return [...plugins].sort((a, b) => {
    const ra = rank.get(a.name.toLowerCase()) ?? order.length
    const rb = rank.get(b.name.toLowerCase()) ?? order.length
    if (ra !== rb) return ra - rb
    return comparePluginOrder(a, b)
  })
}

function renderPluginBadge(p: PluginMeta) {
  if (isBuiltinPlugin(p)) {
    const isDedicated = ['cycani', 'tvtfun', 'xifan-next', 'moonci', 'anime1', 'omofun'].includes(
      p.name.toLowerCase(),
    )
    if (isDedicated) {
      return (
        <span
          className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400"
          title="Animaku 内置 · TypeScript 专有直连驱动"
        >
          内置直连
        </span>
      )
    }
    return (
      <span
        className="inline-flex items-center rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400"
        title="Animaku 内置 · 通用规则驱动"
      >
        内置规则
      </span>
    )
  }
  if (isAnxRule(p)) {
    return (
      <span
        className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
        title="由 AniBaka 流水线解释器驱动"
      >
        AniBaka
      </span>
    )
  }
  if (p.source === 'import') {
    return (
      <span
        className="inline-flex items-center rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--kz-fg-muted)]"
        title="用户本地导入规则"
      >
        自定义
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
      title="传统 Kazumi 规则驱动"
    >
      Kazumi
    </span>
  )
}

export function SettingsPage() {
  const b = getSiteBranding()
  const bangumiToken = useSettingsStore((s) => s.bangumiToken)
  const setBangumiToken = useSettingsStore((s) => s.setBangumiToken)
  const bangumiImageHost = useSettingsStore(
    (s) => s.bangumiImageHost || DEFAULT_BANGUMI_IMAGE_HOST,
  )
  const setBangumiImageHost = useSettingsStore((s) => s.setBangumiImageHost)
  const danmaku = useSettingsStore((s) => s.danmaku ?? FALLBACK_DANMAKU)
  const setDanmaku = useSettingsStore((s) => s.setDanmaku)
  const resetDanmaku = useSettingsStore((s) => s.resetDanmaku)
  const player = useSettingsStore((s) => s.player ?? FALLBACK_PLAYER)
  const setPlayer = useSettingsStore((s) => s.setPlayer)
  const resetPlayer = useSettingsStore((s) => s.resetPlayer)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const nav = useSettingsStore((s) => s.nav ?? FALLBACK_NAV)
  const setNav = useSettingsStore((s) => s.setNav)
  const resetNav = useSettingsStore((s) => s.resetNav)

  const plugins = usePluginStore((s) =>
    Array.isArray(s.plugins) ? s.plugins : EMPTY_ARRAY,
  )
  const removePlugin = usePluginStore((s) => s.removePlugin)
  const togglePlugin = usePluginStore((s) => s.togglePlugin)
  const ensureDefaults = usePluginStore((s) => s.ensureDefaults)
  const resetToDefaults = usePluginStore((s) => s.resetToDefaults)
  const pluginOrder = usePluginStore((s) =>
    Array.isArray(s.pluginOrder) ? s.pluginOrder : [],
  )
  const setPluginOrder = usePluginStore((s) => s.setPluginOrder)

  const [tokenInput, setTokenInput] = useState(bangumiToken)
  const [tokenMsg, setTokenMsg] = useState('')
  const [pluginMsg, setPluginMsg] = useState('')

  useEffect(() => {
    setTokenInput(bangumiToken)
  }, [bangumiToken])

  useEffect(() => {
    ensureDefaults()
  }, [ensureDefaults])

  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchServerHealth(signal),
    staleTime: 60_000,
  })

  // OP/ED 标记助手本地数据
  const opedStore = useCustomOpedStore()
  const opedSubjects = opedStore.subjects
  const [opedToast, setOpedToast] = useState('')
  const [showCommitPreview, setShowCommitPreview] = useState(false)

  const opedSummary = useMemo(() => {
    const subs = Object.values(opedSubjects)
    let totalEps = 0
    for (const s of subs) {
      totalEps += Object.keys(s.episodes).length
    }
    return {
      subjectCount: subs.length,
      episodeCount: totalEps,
    }
  }, [opedSubjects])

  const batchUploadInfo = useMemo(
    () => buildBatchOpedGithubUploadUrl(opedSubjects),
    [opedSubjects],
  )

  const navSummary = useMemo(() => {
    const items = [
      theme === 'light' ? '浅色' : '深色',
      nav.showUserMenu ? '用户中心' : null,
      nav.showHistory ? '历史' : null,
      nav.showThemeToggle ? '黑白模式' : null,
      nav.showGitHub ? 'GitHub' : null,
    ].filter(Boolean)
    return items.join(' · ')
  }, [theme, nav])

  /** User order within plugins list. */
  const sortedPlugins = useMemo(
    () => sortPluginsByOrder(plugins, pluginOrder),
    [plugins, pluginOrder],
  )

  const [draggedName, setDraggedName] = useState<string | null>(null)
  const [dragOverName, setDragOverName] = useState<string | null>(null)

  const touchSourceRef = useRef<string | null>(null)
  const touchTargetRef = useRef<string | null>(null)

  /**
   * Move a plugin up/down in the user sort order.
   * Reads current live `sortedPlugins` names to build the new order list.
   */
  const movePlugin = useCallback(
    (name: string, dir: -1 | 1) => {
      const names = sortedPlugins.map((p) => p.name)
      const idx = names.findIndex(
        (n) => n.toLowerCase() === name.toLowerCase(),
      )
      if (idx < 0) return
      const target = idx + dir
      if (target < 0 || target >= names.length) return
      ;[names[idx], names[target]] = [names[target], names[idx]]
      setPluginOrder(names)
    },
    [sortedPlugins, setPluginOrder],
  )

  const handleDragDrop = useCallback(
    (targetName: string) => {
      if (!draggedName || draggedName.toLowerCase() === targetName.toLowerCase()) {
        setDraggedName(null)
        setDragOverName(null)
        return
      }
      const names = sortedPlugins.map((p) => p.name)
      const fromIdx = names.findIndex(
        (n) => n.toLowerCase() === draggedName.toLowerCase(),
      )
      const toIdx = names.findIndex(
        (n) => n.toLowerCase() === targetName.toLowerCase(),
      )
      if (fromIdx < 0 || toIdx < 0) {
        setDraggedName(null)
        setDragOverName(null)
        return
      }
      const newNames = [...names]
      const [moved] = newNames.splice(fromIdx, 1)
      newNames.splice(toIdx, 0, moved)
      setPluginOrder(newNames)
      setDraggedName(null)
      setDragOverName(null)
    },
    [draggedName, sortedPlugins, setPluginOrder],
  )

  const handleTouchStart = useCallback((name: string) => {
    touchSourceRef.current = name
    touchTargetRef.current = name
    setDraggedName(name)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10)
      } catch {}
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchSourceRef.current) return
    const touch = e.touches[0]
    if (!touch) return
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const card = el?.closest<HTMLElement>('[data-plugin-card-name]')
    const targetName = card?.dataset.pluginCardName
    if (targetName) {
      touchTargetRef.current = targetName
      if (dragOverName !== targetName) {
        setDragOverName(targetName)
      }
    }
  }, [dragOverName])

  const handleTouchEnd = useCallback(() => {
    const fromName = touchSourceRef.current
    const toName = touchTargetRef.current
    if (fromName && toName && fromName.toLowerCase() !== toName.toLowerCase()) {
      const names = sortedPlugins.map((p) => p.name)
      const fromIdx = names.findIndex(
        (n) => n.toLowerCase() === fromName.toLowerCase(),
      )
      const toIdx = names.findIndex(
        (n) => n.toLowerCase() === toName.toLowerCase(),
      )
      if (fromIdx >= 0 && toIdx >= 0) {
        const newNames = [...names]
        const [moved] = newNames.splice(fromIdx, 1)
        newNames.splice(toIdx, 0, moved)
        setPluginOrder(newNames)
      }
    }
    touchSourceRef.current = null
    touchTargetRef.current = null
    setDraggedName(null)
    setDragOverName(null)
  }, [sortedPlugins, setPluginOrder])

  const handleTouchCancel = useCallback(() => {
    touchSourceRef.current = null
    touchTargetRef.current = null
    setDraggedName(null)
    setDragOverName(null)
  }, [])

  // 折叠卡片状态管理（支持本地持久化记忆）
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('kz-settings-open-sections')
      if (saved) return JSON.parse(saved)
    } catch {}
    // 默认展开高频核心项
    return {
      'server-status': false,
      'image-host': false,
      'bangumi-token': true,
      'oped-center': false,
      'installed-plugins': true,
      'player-settings': true,
      'danmaku-settings': false,
      'nav-settings': false,
    }
  })

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem('kz-settings-open-sections', JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const allOpen = useMemo(() => {
    return Object.values(openSections).some(Boolean)
  }, [openSections])

  const toggleAllSections = useCallback(() => {
    setOpenSections((prev) => {
      const targetState = !allOpen
      const next: Record<string, boolean> = {}
      for (const k of [
        'server-status',
        'image-host',
        'bangumi-token',
        'oped-center',
        'installed-plugins',
        'player-settings',
        'danmaku-settings',
        'nav-settings',
      ]) {
        next[k] = targetState
      }
      try {
        localStorage.setItem('kz-settings-open-sections', JSON.stringify(next))
      } catch {}
      return next
    })
  }, [allOpen])

  const me = useQuery({
    queryKey: ['me-settings', bangumiToken],
    queryFn: ({ signal }) => bangumiApi.me({ signal }),
    enabled: Boolean(bangumiToken),
    retry: false,
  })

  async function saveToken() {
    setBangumiToken(tokenInput.trim())
    setTokenMsg('已保存')
    setTimeout(() => setTokenMsg(''), 2000)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="设置" description="Token、规则插件与播放偏好" />
        <button
          type="button"
          onClick={toggleAllSections}
          className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] transition-colors shrink-0 cursor-pointer select-none"
          title={allOpen ? '收起全部卡片' : '展开全部卡片'}
        >
          {allOpen ? '📁 全部收起' : '📂 全部展开'}
        </button>
      </div>

      {/* 1. 服务状态 */}
      <CollapsibleSection
        id="server-status"
        icon="🖥️"
        title="服务状态"
        badge={
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              health.data?.ok
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                : health.isLoading
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
            }`}
            title={health.data?.ok ? '服务正常' : health.isLoading ? '检测中' : '未连接'}
          />
        }
        summary={`${b.version} · ${health.data?.ok ? 'API 正常' : health.isLoading ? '检测中' : '未连接'}`}
        isOpen={Boolean(openSections['server-status'])}
        onToggle={() => toggleSection('server-status')}
      >
        <div className="text-xs sm:text-sm text-[var(--kz-fg-muted)] space-y-1.5 divide-y divide-[var(--kz-border)]/40">
          <div className="flex items-center justify-between pt-1">
            <span>版本</span>
            <span className="font-semibold text-[var(--kz-fg)]">
              {b.version}
              {health.data?.version && health.data.version !== b.version
                ? `（服务端 ${health.data.version}）`
                : ''}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1.5">
            <span>API</span>
            <span className="font-semibold text-[var(--kz-fg)]">{health.data?.ok ? '正常' : health.isLoading ? '检测中…' : '不可用（请启动 server）'}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5">
            <span>弹幕</span>
            <span className="font-semibold text-[var(--kz-fg)]">
              {health.data?.danmakuConfigured
                ? (health.data as ServerHealth).danmakuUsingFallback
                  ? '内置密钥'
                  : '已配置'
                : '不可用'}
            </span>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. 封面图片源 */}
      <CollapsibleSection
        id="image-host"
        icon="🖼️"
        title="封面图片源"
        summary={BANGUMI_IMAGE_HOST_OPTIONS.find((o) => o.host === bangumiImageHost)?.label || bangumiImageHost}
        isOpen={Boolean(openSections['image-host'])}
        onToggle={() => toggleSection('image-host')}
      >
        <label className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
          <span className="font-medium">图片源</span>
          <select
            value={bangumiImageHost}
            onChange={(e) => setBangumiImageHost(e.target.value)}
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1.5 text-xs sm:text-sm outline-none focus:border-[var(--kz-accent)] cursor-pointer"
          >
            {BANGUMI_IMAGE_HOST_OPTIONS.map((o) => (
              <option key={o.host} value={o.host}>
                {o.label}
                {o.host === DEFAULT_BANGUMI_IMAGE_HOST ? ' · 默认' : ''}
              </option>
            ))}
          </select>
        </label>
      </CollapsibleSection>

      {/* 3. Bangumi Access Token */}
      <CollapsibleSection
        id="bangumi-token"
        icon="👤"
        title="Bangumi 账号"
        summary={bangumiToken ? (me.data?.data?.nickname || me.data?.data?.username ? `已登录: ${me.data?.data?.nickname || me.data?.data?.username}` : '已绑定 Token') : '未登录'}
        isOpen={Boolean(openSections['bangumi-token'])}
        onToggle={() => toggleSection('bangumi-token')}
      >
        <p className="text-xs sm:text-sm text-[var(--kz-fg-muted)]">
          用于同步追番收藏。在{' '}
          <a
            href={bangumiOAuthUrl()}
            target="_blank"
            rel="noreferrer"
            className="kz-link"
          >
            Bangumi 令牌页
          </a>{' '}
          创建后粘贴到下方。Token 仅保存在本机浏览器。
        </p>
        <textarea
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          rows={3}
          placeholder="粘贴 Access Token…"
          className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm outline-none ring-[var(--kz-accent)] focus:ring-2"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveToken}
            className="rounded-xl bg-[var(--kz-accent)] px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[var(--kz-accent-hover)] cursor-pointer shadow-sm"
          >
            保存
          </button>
          {tokenMsg && <span className="text-sm text-emerald-400">{tokenMsg}</span>}
          {bangumiToken && me.isSuccess && (
            <span className="text-sm text-[var(--kz-fg-muted)]">
              已登录：{me.data.data.nickname || me.data.data.username}
            </span>
          )}
          {bangumiToken && me.isError && (
            <span className="text-sm text-red-400">
              校验失败：{(me.error as Error).message}
            </span>
          )}
        </div>
      </CollapsibleSection>

      {/* 4. OP/ED 标记中心 */}
      <CollapsibleSection
        id="oped-center"
        icon="⏱️"
        title="OP/ED 标记中心"
        badge={
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
            {opedSummary.subjectCount} 部
          </span>
        }
        summary={`${opedSummary.subjectCount} 部 · ${opedSummary.episodeCount} 集已标记`}
        isOpen={Boolean(openSections['oped-center'])}
        onToggle={() => toggleSection('oped-center')}
      >
        <p className="text-xs sm:text-sm text-[var(--kz-fg-muted)] leading-relaxed">
          播放视频时通过「OP/ED 标记助手」打点，本地优先跳过并可贡献至{' '}
          <a
            href="https://github.com/uerax/bangumi-oped"
            target="_blank"
            rel="noreferrer"
            className="kz-link"
          >
            uerax/bangumi-oped
          </a>{' '}
          开源仓库。
        </p>

        {opedSummary.subjectCount === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--kz-border)] p-5 text-center text-xs sm:text-sm text-[var(--kz-fg-muted)]">
            本地暂无打标记录。在播放任意番剧时，打开右下角控制条的「⏱️ OP/ED 标记助手」即可开始打点。
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-60 overflow-y-auto space-y-2 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-2.5 sm:p-3">
              {Object.entries(opedSubjects).map(([idStr, sub]) => {
                const subId = Number(idStr)
                const epsCount = Object.keys(sub.episodes).length

                return (
                  <div
                    key={subId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-2.5 sm:p-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[var(--kz-fg)] truncate">
                        {sub.subjectName || `Bangumi Subject ${subId}`}
                        <span className="ml-2 font-mono text-[10px] text-[var(--kz-fg-dim)]">
                          ID: {subId}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--kz-fg-muted)]">
                        已标记 {epsCount} 集 · 默认推算 {sub.defaultDuration || 90}s
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          setOpedToast(`正在拉取 Subject ${subId} 官方数据并合并…`)
                          const remote = await fetchBangumiOpedDetail(subId)
                          const txt = buildBangumiOpedContent(remote.data, sub.episodes)
                          await navigator.clipboard.writeText(txt)
                          setOpedToast(`已复制 Subject ${subId} 的合并全量 txt 格式`)
                          setTimeout(() => setOpedToast(''), 3000)
                        }}
                        className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 py-1 text-[11px] font-medium text-[var(--kz-fg)] hover:bg-[var(--kz-bg-elevated)] cursor-pointer"
                        title="复制包含官方已有集数与本地标记的完整数据"
                      >
                        复制 txt
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setOpedToast(`正在拉取 Subject ${subId} 官方数据并准备 PR…`)
                          const remote = await fetchBangumiOpedDetail(subId)
                          const txt = buildBangumiOpedContent(remote.data, sub.episodes)
                          const diff = diffSubjectOped(subId, remote.data, sub.episodes, sub.totalEpisodes)
                          const res = await submitSingleSubjectToGithub(subId, txt, remote.exists, diff.commitMessage)
                          if (res.method === 'edit_file_clipboard') {
                            setOpedToast('最新全量合并数据已复制！请在 GitHub 编辑页按 Ctrl+A 全选并 Ctrl+V 粘贴覆盖')
                          } else {
                            setOpedToast('已打开 GitHub 新建文件 PR 页面')
                          }
                          setTimeout(() => setOpedToast(''), 5000)
                        }}
                        className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white shadow hover:bg-emerald-500 cursor-pointer"
                        title="提交包含官方原本内容与本地新增修改的完整 PR"
                      >
                        提交 PR
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`确定删除《${sub.subjectName || subId}》的本地打标数据吗？`)) {
                            opedStore.clearSubjectMarks(subId)
                          }
                        }}
                        className="rounded-lg px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="删除该番打标记录"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Commit 详细说明预览与复制面板 (默认折叠) */}
            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/60 overflow-hidden transition-all duration-200">
              <div
                onClick={() => setShowCommitPreview((v) => !v)}
                className="flex items-center justify-between p-2.5 sm:p-3 cursor-pointer select-none text-xs font-semibold text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] transition-colors"
                role="button"
                tabIndex={0}
                aria-expanded={showCommitPreview}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setShowCommitPreview((v) => !v)
                  }
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">📝 PR Commit 信息</span>
                  <span
                    className={`inline-block text-[10px] text-[var(--kz-fg-dim)] transition-transform duration-200 ${
                      showCommitPreview ? 'rotate-180' : ''
                    }`}
                  >
                    ▼
                  </span>
                </div>
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(batchUploadInfo.commitTitle)
                        setOpedToast('已复制 Commit 标题！')
                        setTimeout(() => setOpedToast(''), 3000)
                      } catch {}
                    }}
                    className="rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--kz-fg)] hover:bg-[var(--kz-bg-elevated)] cursor-pointer"
                    title="复制 Commit 标题（主标题输入框）"
                  >
                    📋 复制标题
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(batchUploadInfo.commitDescription)
                        setOpedToast('已复制 Commit 详细描述！')
                        setTimeout(() => setOpedToast(''), 3000)
                      } catch {}
                    }}
                    className="rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--kz-fg)] hover:bg-[var(--kz-bg-elevated)] cursor-pointer"
                    title="复制 Commit 详细描述（多行描述输入框）"
                  >
                    📋 复制描述
                  </button>
                </div>
              </div>

              {showCommitPreview && (
                <div className="px-3 pb-3 pt-1 border-t border-[var(--kz-border)]/40 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--kz-fg-dim)] shrink-0">标题:</span>
                    <code className="flex-1 rounded bg-[var(--kz-bg)] px-2 py-1 font-mono text-[11px] text-[var(--kz-fg)] truncate border border-[var(--kz-border)]/60">
                      {batchUploadInfo.commitTitle}
                    </code>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(batchUploadInfo.commitTitle)
                          setOpedToast('已复制 Commit 标题！')
                          setTimeout(() => setOpedToast(''), 3000)
                        } catch {}
                      }}
                      className="rounded border border-[var(--kz-border)] bg-[var(--kz-bg)] px-1.5 py-0.5 text-[10px] text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] cursor-pointer shrink-0"
                    >
                      复制
                    </button>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] text-[var(--kz-fg-dim)] shrink-0 pt-1">描述:</span>
                    <pre className="flex-1 rounded bg-[var(--kz-bg)] p-2 font-mono text-[11px] text-[var(--kz-fg-muted)] whitespace-pre-wrap max-h-28 overflow-y-auto border border-[var(--kz-border)]/60 leading-relaxed">
                      {batchUploadInfo.commitDescription}
                    </pre>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(batchUploadInfo.commitDescription)
                          setOpedToast('已复制 Commit 详细描述！')
                          setTimeout(() => setOpedToast(''), 3000)
                        } catch {}
                      }}
                      className="rounded border border-[var(--kz-border)] bg-[var(--kz-bg)] px-1.5 py-0.5 text-[10px] text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] cursor-pointer shrink-0 mt-1"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setOpedToast('正在拉取各番官方数据并打包 ZIP…')
                    const files: { path: string; content: string }[] = []
                    for (const [idStr, sub] of Object.entries(opedSubjects)) {
                      const subId = Number(idStr)
                      const remote = await fetchBangumiOpedDetail(subId)
                      const txt = buildBangumiOpedContent(remote.data, sub.episodes)
                      files.push({
                        path: `${subId}/${subId}.txt`,
                        content: txt,
                      })
                    }
                    const blob = createOpedZipBlob(files)
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `bangumi-oped-custom-${new Date().toISOString().slice(0, 10)}.zip`
                    a.click()
                    URL.revokeObjectURL(url)
                    setOpedToast('已生成并下载合并全量 ZIP 包！解压后进入目录全选里面的文件夹拖入 GitHub 即可')
                    setTimeout(() => setOpedToast(''), 6000)
                  }}
                  className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1 text-xs font-medium text-[var(--kz-fg)] hover:bg-[var(--kz-bg-elevated)] cursor-pointer"
                  title="打包下载包含官方已有集数与本地标记的全量 txt 数据包"
                >
                  📦 打包全量 ZIP
                </button>
                <a
                  href={batchUploadInfo.url}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(batchUploadInfo.commitTitle)
                    } catch {}
                    setOpedToast('已自动复制 Commit 标题！如需详细说明可在上方点击「复制描述」')
                    setTimeout(() => setOpedToast(''), 5000)
                  }}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors"
                  title="解压 ZIP 后，进入解压目录全选里面的数字文件夹（如 352410）直接拖入该页面即可一键提交 Pull Request"
                >
                  <span>📂 前往 GitHub 批量上传</span>
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M6 3.5H3.5C2.67 3.5 2 4.17 2 5V12.5C2 13.33 2.67 14 3.5 14H11C11.83 14 12.5 13.33 12.5 12.5V10M9.5 2H14M14 2V6.5M14 2L6.5 9.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                {opedToast && <span className="text-xs text-emerald-400 font-medium">{opedToast}</span>}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('警告：将清空本机所有番剧的本地打标数据，此操作不可恢复，确定？')) {
                    opedStore.clearAllMarks()
                  }
                }}
                className="text-xs text-rose-400 hover:underline bg-transparent border-0 cursor-pointer self-start sm:self-center"
              >
                清空本地标记
              </button>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 5. 已安装规则 */}
      <CollapsibleSection
        id="installed-plugins"
        icon="🧩"
        title="已安装规则"
        badge={
          <span className="rounded-full bg-[var(--kz-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--kz-accent)]">
            {sortedPlugins.length}
          </span>
        }
        summary={`${sortedPlugins.length} 个源 · 默认: ${sortedPlugins[0]?.name || '无'}`}
        isOpen={Boolean(openSections['installed-plugins'])}
        onToggle={() => toggleSection('installed-plugins')}
      >
        {/* 顶部操作与说明栏 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-[var(--kz-fg-muted)] leading-relaxed">
            列表首位为播放时的默认源。可拖拽或按 ▲▼ 调整优先级顺序。
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    '将清空当前规则并恢复为内置默认，确定？',
                  )
                ) {
                  resetToDefaults()
                  setPluginMsg('已恢复默认规则')
                }
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] active:scale-95 transition-all cursor-pointer"
            >
              <span>↺ 恢复默认</span>
            </button>
          </div>
        </div>

        {pluginMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs sm:text-sm font-medium text-emerald-400">
            {pluginMsg}
          </div>
        )}

        {/* 状态统计与拖拽提示胶囊 */}
        {sortedPlugins.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--kz-bg-soft)]/60 border border-[var(--kz-border)]/40 px-3 py-2 text-xs text-[var(--kz-fg-muted)]">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                共 <strong className="text-[var(--kz-fg)] font-semibold">{sortedPlugins.length}</strong> 个源
              </span>
              <span>·</span>
              <span className="text-emerald-500 font-medium">
                {sortedPlugins.filter((p) => p.enabled !== false).length}{' '}
                个已启用
              </span>
              {sortedPlugins[0] && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline text-amber-500 dark:text-amber-400 font-medium">
                    首选: {sortedPlugins[0].name}
                  </span>
                </>
              )}
            </div>
            {sortedPlugins.length > 1 && (
              <div className="text-[11px] text-[var(--kz-fg-dim)] select-none">
                💡 拖拽手柄或按 ▲▼ 调整顺序
              </div>
            )}
          </div>
        )}

        {!plugins.length && (
          <div className="rounded-2xl border border-dashed border-[var(--kz-border)] p-6 text-center text-xs sm:text-sm text-[var(--kz-fg-muted)]">
            暂无视频源，可点击上方「恢复默认」。
          </div>
        )}

        {/* 规则卡片流式列表 */}
        <ul className="space-y-2">
          {sortedPlugins.map((p, idx) => {
            const effectivelyOn = p.enabled !== false
            const isFirst = idx === 0
            const isLast = idx === sortedPlugins.length - 1
            const isDragging = draggedName?.toLowerCase() === p.name.toLowerCase()
            const isDragOver = dragOverName?.toLowerCase() === p.name.toLowerCase()

            return (
              <li
                key={p.id}
                data-plugin-card-name={p.name}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', p.name)
                  e.dataTransfer.effectAllowed = 'move'
                  requestAnimationFrame(() => {
                    setDraggedName(p.name)
                  })
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverName !== p.name) {
                    setDragOverName(p.name)
                  }
                }}
                onDragLeave={(e) => {
                  const related = e.relatedTarget as Node | null
                  if (related && e.currentTarget.contains(related)) {
                    return
                  }
                  if (dragOverName === p.name) {
                    setDragOverName(null)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDragDrop(p.name)
                }}
                onDragEnd={() => {
                  setDraggedName(null)
                  setDragOverName(null)
                }}
                className={`group relative flex flex-col rounded-xl border transition-all duration-200 select-none overflow-hidden ${
                  isDragging
                    ? 'opacity-40 border-dashed border-[var(--kz-accent)] bg-[var(--kz-bg-soft)] scale-[0.99]'
                    : isDragOver
                      ? 'border-[var(--kz-accent)] ring-2 ring-[var(--kz-accent)]/40 bg-[var(--kz-accent)]/5 shadow-md'
                      : isFirst && effectivelyOn
                        ? 'border-[var(--kz-accent)]/40 bg-[var(--kz-bg-elevated)] shadow-xs hover:border-[var(--kz-accent)]/70'
                        : 'border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] hover:border-[var(--kz-border-hover)] hover:shadow-xs'
                } ${!effectivelyOn ? 'opacity-60 saturate-75 bg-[var(--kz-bg-soft)]/50' : ''}`}
              >
                {/* 规则卡片行：拖拽手柄 + 序号 + 规则名称 + 驱动徽章 + 默认源徽章 + (删除) + 主启用 Switch */}
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
                    {/* 拖拽手柄与微调 */}
                    <div
                      className="flex items-center gap-1 shrink-0 rounded-lg bg-[var(--kz-bg-soft)] p-0.5 sm:p-1 text-[var(--kz-fg-dim)] select-none touch-none"
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onTouchStart={() => handleTouchStart(p.name)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchCancel}
                      title="按住手柄拖拽排序"
                    >
                      <span className="cursor-grab active:cursor-grabbing px-0.5 hover:text-[var(--kz-fg)] transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="4.5" cy="3.5" r="1.2" />
                          <circle cx="4.5" cy="8" r="1.2" />
                          <circle cx="4.5" cy="12.5" r="1.2" />
                          <circle cx="11.5" cy="3.5" r="1.2" />
                          <circle cx="11.5" cy="8" r="1.2" />
                          <circle cx="11.5" cy="12.5" r="1.2" />
                        </svg>
                      </span>
                      <span
                        className={`font-mono text-[10.5px] font-bold px-1 rounded ${
                          isFirst
                            ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400'
                            : 'text-[var(--kz-fg-muted)]'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="flex flex-col gap-0.5 ml-0.5">
                        <button
                          type="button"
                          disabled={isFirst}
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            movePlugin(p.name, -1)
                          }}
                          title="上移"
                          className="text-[8.5px] leading-none disabled:opacity-20 hover:text-[var(--kz-accent)] cursor-pointer transition-colors p-0.5"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={isLast}
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            movePlugin(p.name, 1)
                          }}
                          title="下移"
                          className="text-[8.5px] leading-none disabled:opacity-20 hover:text-[var(--kz-accent)] cursor-pointer transition-colors p-0.5"
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    {/* 规则名称与标签 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-xs sm:text-sm text-[var(--kz-fg)] truncate">
                          {p.name}
                        </span>
                        <span className="rounded border border-[var(--kz-border)] bg-[var(--kz-bg)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--kz-fg-muted)]">
                          v{p.version || '?'}
                        </span>
                        {renderPluginBadge(p)}
                        {isFirst && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 text-[9.5px] sm:text-[10px] font-semibold text-amber-500 dark:text-amber-400 shadow-xs">
                            <span>⭐</span>
                            <span>默认主源</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 右侧：删除按钮（自定义规则） + iOS 风格 Switch 主开关 */}
                  <div
                    className="flex items-center gap-2 shrink-0"
                    draggable={false}
                    onDragStart={(e) => e.stopPropagation()}
                  >
                    {!isBuiltinPlugin(p) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`确定删除规则「${p.name}」吗？`)) {
                            removePlugin(p.id)
                          }
                        }}
                        className="inline-flex items-center gap-0.5 rounded-md border border-rose-500/20 bg-rose-500/5 px-1.5 py-0.5 text-[10.5px] font-medium text-rose-400 hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-500 transition-all cursor-pointer"
                        title="删除此规则"
                      >
                        <span>🗑️</span>
                        <span className="hidden sm:inline">删除</span>
                      </button>
                    )}

                    <label
                      className="relative inline-flex items-center cursor-pointer select-none"
                      title={
                        effectivelyOn
                          ? '点击停用规则'
                          : '点击启用规则'
                      }
                    >
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={effectivelyOn}
                        onChange={() => togglePlugin(p.id)}
                      />
                      <div className="w-9 h-5 sm:w-10 sm:h-5.5 bg-[var(--kz-bg-soft)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 sm:after:h-4.5 sm:after:w-4.5 after:transition-all after:shadow-sm peer-checked:bg-[var(--kz-accent)] border border-[var(--kz-border)] peer-checked:border-[var(--kz-accent)]" />
                      <span className="ml-1.5 text-xs font-medium text-[var(--kz-fg)] hidden sm:inline">
                        {effectivelyOn ? '已启用' : '已停用'}
                      </span>
                    </label>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </CollapsibleSection>

      {/* 6. 播放器偏好 */}
      <CollapsibleSection
        id="player-settings"
        icon="🎬"
        title="播放器偏好"
        summary={`${player.speed}x · ${player.autoNext ? '连播' : '单集'} · ${player.superResolution && player.superResolution !== 'off' ? 'Anime4K' : '无超分'}`}
        isOpen={Boolean(openSections['player-settings'])}
        onToggle={() => toggleSection('player-settings')}
        headerActions={
          <button
            type="button"
            onClick={resetPlayer}
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1 text-xs text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] cursor-pointer"
          >
            恢复默认
          </button>
        }
      >
        <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
          播放器偏好：倍速、自动下一集、记忆进度与智能跳过。
        </p>
        <Toggle
          label="自动播放"
          checked={player.autoplay}
          onChange={(autoplay) => setPlayer({ autoplay })}
        />
        <Toggle
          label="自动下一集"
          checked={player.autoNext}
          onChange={(autoNext) => setPlayer({ autoNext })}
        />
        <Toggle
          label="记忆播放位置"
          checked={player.continuePlay}
          onChange={(continuePlay) => setPlayer({ continuePlay })}
        />
        <label className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
          <span className="font-medium">默认倍速</span>
          <select
            value={player.speed}
            onChange={(e) => setPlayer({ speed: Number(e.target.value) || 1 })}
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 py-1.5 text-xs sm:text-sm cursor-pointer"
          >
            {PLAYER_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
          <span className="font-medium">超分（Anime4K）</span>
          <select
            value={player.superResolution || 'off'}
            onChange={(e) =>
              setPlayer({
                superResolution: (e.target.value === 'efficiency' ||
                e.target.value === 'quality'
                  ? e.target.value
                  : 'off') as 'off' | 'efficiency' | 'quality',
              })
            }
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 py-1.5 text-xs sm:text-sm cursor-pointer"
          >
            <option value="off">关闭（默认）</option>
            <option value="efficiency">效率档</option>
            <option value="quality">质量档</option>
          </select>
        </label>
        <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
          需要 Chrome / Edge 等支持 WebGPU 的浏览器。iPhone 系统全屏看不到 canvas 超分，请用「网页全屏」。
        </p>
        <label className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
          <span className="font-medium">记忆跳转时长（J 键，秒）</span>
          <input
            type="number"
            min={1}
            max={600}
            value={player.customSeekTime}
            onChange={(e) =>
              setPlayer({ customSeekTime: Number(e.target.value) || 85 })
            }
            className="w-20 sm:w-24 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 py-1.5 text-xs sm:text-sm text-center"
          />
        </label>
        <Toggle
          label="使用 bangumi-oped 片头片尾跳过"
          checked={Boolean(player.preferBangumiOped)}
          onChange={(preferBangumiOped) => setPlayer({ preferBangumiOped })}
        />
        <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
          从{' '}
          <a
            href="https://github.com/uerax/bangumi-oped"
            className="kz-link"
            target="_blank"
            rel="noreferrer"
          >
            bangumi-oped
          </a>{' '}
          获取番剧每集实际 OP/ED 时间并自动跳过。
        </p>
        <Toggle
          label="首集保护（播放第一集时不自动跳过，右下角 5s 提示）"
          checked={Boolean(player.preferBangumiOped) && player.firstEpisodeProtect !== false}
          disabled={!player.preferBangumiOped}
          onChange={(firstEpisodeProtect) => setPlayer({ firstEpisodeProtect })}
        />
        <p className={`text-[11px] sm:text-xs text-[var(--kz-fg-dim)] ${!player.preferBangumiOped ? 'opacity-50' : ''}`}>
          {!player.preferBangumiOped ? '（需先开启上方的 OP/ED 跳过功能）' : ''}开启后播放番剧第一集 (index 0) 时不自动跳过片头片尾，并在右下角弹出 5 秒跳过提示；第 2 集起恢复全自动跳过。
        </p>
      </CollapsibleSection>

      {/* 8. 弹幕偏好 */}
      <CollapsibleSection
        id="danmaku-settings"
        icon="💬"
        title="弹幕偏好"
        summary={danmaku.enabled ? `开启 · 透明度 ${Math.round(danmaku.opacity * 100)}%` : '已关闭'}
        isOpen={Boolean(openSections['danmaku-settings'])}
        onToggle={() => toggleSection('danmaku-settings')}
        headerActions={
          <button
            type="button"
            onClick={resetDanmaku}
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1 text-xs text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] cursor-pointer"
          >
            恢复默认
          </button>
        }
      >
        <Toggle
          label="默认开启弹幕"
          checked={danmaku.enabled}
          onChange={(enabled) => setDanmaku({ enabled })}
        />
        <Toggle
          label="弹幕精简模式（合并相邻重复刷屏与类似弹幕）"
          checked={Boolean(danmaku.simplify)}
          onChange={(simplify) => setDanmaku({ simplify })}
        />
        <Slider
          label={`不透明度 ${danmaku.opacity.toFixed(2)}`}
          min={0.1}
          max={1}
          step={0.05}
          value={danmaku.opacity}
          onChange={(opacity) => setDanmaku({ opacity })}
        />
        <Slider
          label={`字号倍率 ${danmaku.fontSize.toFixed(2)}`}
          min={0.5}
          max={2}
          step={0.05}
          value={danmaku.fontSize}
          onChange={(fontSize) => setDanmaku({ fontSize })}
        />
        <Slider
          label={`速度 ${danmaku.speed.toFixed(2)}`}
          min={0.5}
          max={2}
          step={0.05}
          value={danmaku.speed}
          onChange={(speed) => setDanmaku({ speed })}
        />
        <Slider
          label={`显示区域 ${Math.round(danmaku.area * 100)}%`}
          min={0.2}
          max={1}
          step={0.05}
          value={danmaku.area}
          onChange={(area) => setDanmaku({ area })}
        />
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm pt-1">
          {(
            [
              ['showScroll', '滚动弹幕'],
              ['showTop', '顶部弹幕'],
              ['showBottom', '底部弹幕'],
              ['showColor', '彩色弹幕'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 text-[var(--kz-fg)] cursor-pointer rounded-lg border border-[var(--kz-border)]/50 sm:border-transparent bg-[var(--kz-bg)] sm:bg-transparent p-2 sm:p-0">
              <input
                type="checkbox"
                checked={danmaku[key]}
                onChange={(e) => setDanmaku({ [key]: e.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-xs sm:text-sm text-[var(--kz-fg-muted)]">
            关键词屏蔽（每行一条，支持 /正则/）
          </label>
          <textarea
            value={danmaku.filters.join('\n')}
            onChange={(e) =>
              setDanmaku({
                filters: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            rows={3}
            className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm outline-none ring-[var(--kz-accent)] focus:ring-2"
          />
        </div>
      </CollapsibleSection>

      {/* 9. 导航栏与外观 */}
      <CollapsibleSection
        id="nav-settings"
        icon="🧭"
        title="导航栏与外观"
        summary={navSummary}
        isOpen={Boolean(openSections['nav-settings'])}
        onToggle={() => toggleSection('nav-settings')}
        headerActions={
          <button
            type="button"
            onClick={resetNav}
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1 text-xs text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] cursor-pointer"
            title="恢复导航栏快捷按钮默认展示"
          >
            恢复默认
          </button>
        }
      >
        <p className="text-xs sm:text-sm text-[var(--kz-fg-muted)]">
          自定义界面主题与顶部导航栏右侧快捷功能按钮的展示。
        </p>
        <label className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
          <span className="font-medium">界面主题</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
            className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1.5 text-xs sm:text-sm cursor-pointer"
          >
            <option value="light">☀️ 浅色主题 (Light)</option>
            <option value="dark">🌙 深色主题 (Dark)</option>
          </select>
        </label>
        <div className="pt-2 border-t border-[var(--kz-border)]/40 space-y-2">
          <div className="text-xs font-semibold text-[var(--kz-fg-muted)] pt-0.5">
            导航栏右侧快捷按钮展示
          </div>
          <Toggle
            label="展示「用户中心」按钮"
            checked={nav.showUserMenu}
            onChange={(showUserMenu) => setNav({ showUserMenu })}
          />
          <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
            在顶部导航栏右侧展示用户头像与下拉菜单（包含我的追番、观看历史、设置等）。
          </p>

          <Toggle
            label="展示「观看历史」按钮"
            checked={nav.showHistory}
            onChange={(showHistory) => setNav({ showHistory })}
          />
          <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
            在顶部导航栏右侧展示时钟历史图标，点击快速打开播放历史。
          </p>

          <Toggle
            label="展示「黑白模式切换」按钮"
            checked={nav.showThemeToggle}
            onChange={(showThemeToggle) => setNav({ showThemeToggle })}
          />
          <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
            在顶部导航栏右侧展示深浅色一键切换按钮。
          </p>

          <Toggle
            label="展示「GitHub」链接"
            checked={nav.showGitHub}
            onChange={(showGitHub) => setNav({ showGitHub })}
          />
          <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
            在顶部导航栏右侧展示 GitHub 项目开源仓库链接。
          </p>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function CollapsibleSection({
  id,
  icon,
  title,
  badge,
  summary,
  isOpen,
  onToggle,
  headerActions,
  children,
  className = '',
}: {
  id: string
  icon?: React.ReactNode
  title: string
  badge?: React.ReactNode
  summary?: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  headerActions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-sm transition-all duration-200 hover:border-[var(--kz-accent-ring)] ${className}`}
    >
      <div
        onClick={onToggle}
        className="flex items-center justify-between gap-3 p-4 sm:p-5 cursor-pointer select-none"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          {icon && <span className="text-base sm:text-lg shrink-0">{icon}</span>}
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--kz-fg)] truncate">
            {title}
          </h2>
          {badge}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {summary && !isOpen && (
            <span className="hidden xs:inline-flex sm:inline-flex items-center rounded-full bg-[var(--kz-bg-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--kz-fg-muted)] border border-[var(--kz-border)]/60 max-w-[14rem] truncate">
              {summary}
            </span>
          )}
          {headerActions && (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
              {headerActions}
            </div>
          )}
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[var(--kz-fg-muted)] transition-transform duration-200 hover:bg-[var(--kz-bg-soft)] ${
              isOpen ? 'rotate-180 text-[var(--kz-accent)]' : ''
            }`}
            aria-hidden
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0 space-y-4 border-t border-[var(--kz-border)]/40 mt-1">
          <div className="pt-3 space-y-3">{children}</div>
        </div>
      )}
    </section>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center justify-between text-sm ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      }`}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-[var(--kz-fg)]">{label}</div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
