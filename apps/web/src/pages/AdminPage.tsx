import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type {
  AdBlockerMode,
  PluginMeta,
  SiteDanmakuDefaults,
  SiteDefaultSettings,
  SiteNavDefaults,
  SitePlayerDefaults,
  SuperResolutionMode,
  CustomNavLink,
  AdminDailyStatsResponse,
} from '@animaku/shared'
import {
  BANGUMI_IMAGE_HOST_BANGUMI,
  BANGUMI_IMAGE_HOST_MIRROR,
  comparePluginOrder,
  defaultDanmakuSettings,
  defaultPlayerSettings,
  isAnxRule,
  PLAYER_SPEEDS,
  SUPER_RESOLUTION_MODES,
} from '@animaku/shared'
import {
  BANGUMI_IMAGE_HOST_OPTIONS,
  DEFAULT_BANGUMI_IMAGE_HOST,
  resolveBangumiImageHost,
} from '../lib/bangumi-image-host'
import {
  DEFAULT_APP_THEME,
  defaultNavSettings,
  type AppTheme,
} from '../stores/settings'
import { isBuiltinPlugin, usePluginStore } from '../stores/plugins'
import { useSiteConfigStore, type AnnouncementItem } from '../stores/site-config'
import { fetchServerHealth } from '../lib/server-capabilities'
import { SiteAnnouncementModal } from '../components/SiteAnnouncementModal'
import { IconCropModal } from '../components/IconCropModal'
import { PageHeader } from '../components/ui'
import { getSiteBranding } from '../lib/site-branding'

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
  return (
    <span
      className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
      title="通用规则驱动"
    >
      通用规则
    </span>
  )
}

export function AdminPage() {
  const isAdminUnlocked = useSiteConfigStore((s) => s.isAdminUnlocked)
  const unlockAdmin = useSiteConfigStore((s) => s.unlockAdmin)
  const lockAdmin = useSiteConfigStore((s) => s.lockAdmin)

  // Gatekeeper state
  const [secretInput, setSecretInput] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setAuthError('')
    const trimmed = secretInput.trim()
    if (!trimmed) {
      setAuthError('请输入管理员密钥 (ADMIN_SECRET)')
      return
    }
    setIsVerifying(true)
    const success = await unlockAdmin(trimmed)
    setIsVerifying(false)
    if (!success) {
      setAuthError('密钥错误或鉴权失败（请确认服务端 .env 已设置 ADMIN_SECRET）')
    } else {
      setSecretInput('')
    }
  }

  // 1. Entry Gatekeeper (未通过 ADMIN_SECRET 验证前，全屏门禁守护)
  if (!isAdminUnlocked) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-12">
        <div className="w-full rounded-3xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--kz-accent)]/10 text-3xl text-[var(--kz-accent)] ring-1 ring-[var(--kz-accent)]/20 shadow-inner">
              🛡️
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--kz-fg)]">
              站点运维与全局配置
            </h1>
            <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
              进入后台管理前需先验证 <code className="text-[var(--kz-accent)] font-semibold font-mono">ADMIN_SECRET</code> 口令。
            </p>
          </div>

          <form onSubmit={handleUnlock} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin_secret_entry"
                className="block text-xs font-semibold text-[var(--kz-fg-muted)]"
              >
                管理员密钥
              </label>
              <div className="relative">
                <input
                  id="admin_secret_entry"
                  type={showSecret ? 'text' : 'password'}
                  autoFocus
                  autoComplete="current-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="请输入 ADMIN_SECRET…"
                  value={secretInput}
                  onChange={(e) => {
                    setSecretInput(e.target.value)
                    if (authError) setAuthError('')
                  }}
                  className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] pl-3 pr-10 py-2.5 text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)] focus:ring-1 focus:ring-[var(--kz-accent)] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] select-none cursor-pointer"
                  title={showSecret ? '隐藏口令' : '显示口令'}
                  tabIndex={-1}
                >
                  {showSecret ? '🙈' : '👁️'}
                </button>
              </div>
              {authError && (
                <p className="text-xs font-medium text-rose-500 pt-0.5">
                  {authError}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="submit"
                disabled={isVerifying || !secretInput.trim()}
                className="w-full inline-flex items-center justify-center rounded-xl bg-[var(--kz-accent)] py-2.5 px-4 text-sm font-semibold text-white shadow-md transition-all hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isVerifying ? '验证中…' : '验证并进入后台'}
              </button>
              <Link
                to="/"
                className="w-full inline-flex items-center justify-center rounded-xl border border-[var(--kz-border)] py-2 px-4 text-xs font-medium text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] transition-colors text-center"
              >
                返回首页
              </Link>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // 2. Authenticated Admin Dashboard
  return <AdminDashboard />
}

function AdminDashboard() {
  const b = getSiteBranding()
  const siteName = useSiteConfigStore((s) => s.siteName)
  const siteTagline = useSiteConfigStore((s) => s.siteTagline)
  const githubUrl = useSiteConfigStore((s) => s.githubUrl)
  const feedbackUrl = useSiteConfigStore((s) => s.feedbackUrl)
  const contactUrl = useSiteConfigStore((s) => s.contactUrl)
  const iconMode = useSiteConfigStore((s) => s.iconMode)
  const iconUrl = useSiteConfigStore((s) => s.iconUrl)
  const iconUpdatedAt = useSiteConfigStore((s) => s.iconUpdatedAt)
  const defaultSettings = useSiteConfigStore((s) => s.defaultSettings)
  const saveConfig = useSiteConfigStore((s) => s.saveConfig)
  const saveDefaultSettings = useSiteConfigStore((s) => s.saveDefaultSettings)
  const uploadIcon = useSiteConfigStore((s) => s.uploadIcon)
  const resetIcon = useSiteConfigStore((s) => s.resetIcon)
  const resetAllConfig = useSiteConfigStore((s) => s.resetAllConfig)
  const triggerIndexNow = useSiteConfigStore((s) => s.triggerIndexNow)

  // 站点公告
  const announcementEnabled = useSiteConfigStore((s) => s.announcementEnabled)
  const announcement = useSiteConfigStore((s) => s.announcement)
  const announcementHistory = useSiteConfigStore((s) => s.announcementHistory)
  const saveAnnouncement = useSiteConfigStore((s) => s.saveAnnouncement)
  const uploadAnnouncementImage = useSiteConfigStore((s) => s.uploadAnnouncementImage)
  const fetchAnnouncementHistory = useSiteConfigStore((s) => s.fetchAnnouncementHistory)
  const deleteAnnouncementHistory = useSiteConfigStore((s) => s.deleteAnnouncementHistory)
  const fetchDailyStats = useSiteConfigStore((s) => s.fetchDailyStats)
  const fetchAdminNavLinks = useSiteConfigStore((s) => s.fetchAdminNavLinks)
  const saveAdminNavLinks = useSiteConfigStore((s) => s.saveAdminNavLinks)

  // 服务健康
  const health = useQuery({
    queryKey: ['server-health-admin'],
    queryFn: ({ signal }) => fetchServerHealth(signal),
    staleTime: 30_000,
  })

  // 折叠卡片状态管理
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'stats-daily': true,
    'custom-nav-links': true,
    'server-health': false,
    'site-branding': true,
    'site-announcement': false,
    'default-image': false,
    'default-plugins': false,
    'default-player': false,
    'default-danmaku': false,
    'default-nav': false,
    'indexnow-ops': false,
    'danger-zone': false,
  })

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // ── 日活统计与按日期查询 ──────────────────────────────
  const [statsDate, setStatsDate] = useState(() => {
    try {
      return new Date().toLocaleDateString('sv-SE')
    } catch {
      return new Date().toISOString().slice(0, 10)
    }
  })
  const [dailyStats, setDailyStats] = useState<AdminDailyStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')

  const loadDailyStats = useCallback(
    async (targetDate?: string) => {
      setStatsLoading(true)
      setStatsError('')
      const d = targetDate || statsDate
      const res = await fetchDailyStats(d)
      setStatsLoading(false)
      if (res && res.ok) {
        setDailyStats(res)
      } else {
        setStatsError('获取日活数据失败，请确认服务端状态')
      }
    },
    [fetchDailyStats, statsDate],
  )

  // ── 自定义导航栏外链配置 ──────────────────────────────
  const storeCustomNavLinks = useSiteConfigStore((s) => s.customNavLinks)
  const [adminNavLinks, setAdminNavLinks] = useState<CustomNavLink[]>(() => storeCustomNavLinks || [])
  const [navLinksLoading, setNavLinksLoading] = useState(false)
  const [navLinksSaving, setNavLinksSaving] = useState(false)
  const [isAddingNavLink, setIsAddingNavLink] = useState(false)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [linkForm, setLinkForm] = useState<{
    title: string
    url: string
    badge: string
    target: '_blank' | '_self'
    highlight: boolean
    enabled: boolean
  }>({
    title: '',
    url: '',
    badge: '',
    target: '_blank',
    highlight: false,
    enabled: true,
  })

  const loadAdminNavLinks = useCallback(async () => {
    setNavLinksLoading(true)
    const links = await fetchAdminNavLinks()
    setNavLinksLoading(false)
    if (links && links.length > 0) {
      setAdminNavLinks(links)
    } else {
      const currentStore = useSiteConfigStore.getState().customNavLinks
      if (currentStore && currentStore.length > 0) {
        setAdminNavLinks(currentStore)
        void saveAdminNavLinks(currentStore)
      } else {
        setAdminNavLinks([])
      }
    }
  }, [fetchAdminNavLinks, saveAdminNavLinks])

  useEffect(() => {
    void loadDailyStats()
    void loadAdminNavLinks()
  }, [loadDailyStats, loadAdminNavLinks])

  // 全局默认配置表单状态（与本地客户端 useSettingsStore/usePluginStore 彻底解耦！）
  const [defImageHost, setDefImageHost] = useState(
    defaultSettings?.bangumiImageHost || DEFAULT_BANGUMI_IMAGE_HOST,
  )
  const [defTheme, setDefTheme] = useState<AppTheme>(
    defaultSettings?.theme || DEFAULT_APP_THEME,
  )
  const [defNav, setDefNav] = useState<SiteNavDefaults>({
    ...defaultNavSettings,
    ...(defaultSettings?.nav || {}),
  })
  const [defPlayer, setDefPlayer] = useState<SitePlayerDefaults>({
    ...defaultPlayerSettings,
    ...(defaultSettings?.player || {}),
  })
  const [defDanmaku, setDefDanmaku] = useState<SiteDanmakuDefaults>({
    ...defaultDanmakuSettings,
    ...(defaultSettings?.danmaku || {}),
  })

  // 视频源规则全局默认排序与启用状态
  const allPlugins = usePluginStore((s) => s.plugins)
  const [defPluginOrder, setDefPluginOrder] = useState<string[]>(() => {
    if (defaultSettings?.pluginOrder && Array.isArray(defaultSettings.pluginOrder)) {
      return defaultSettings.pluginOrder
    }
    return allPlugins.map((p) => p.name)
  })
  const [defDisabledPlugins, setDefDisabledPlugins] = useState<string[]>(() => {
    if (defaultSettings?.disabledPlugins && Array.isArray(defaultSettings.disabledPlugins)) {
      return defaultSettings.disabledPlugins
    }
    return []
  })
  const [defSourceBangumiIds, setDefSourceBangumiIds] = useState<Record<string, number[]>>(() => {
    if (defaultSettings?.sourceBangumiIds && typeof defaultSettings.sourceBangumiIds === 'object') {
      return defaultSettings.sourceBangumiIds
    }
    return {}
  })

  // 快捷日期切换
  const selectQuickDate = (daysAgo: number) => {
    const now = Date.now()
    const targetTime = now - daysAgo * 24 * 60 * 60 * 1000
    try {
      const dStr = new Date(targetTime).toLocaleDateString('sv-SE')
      setStatsDate(dStr)
      void loadDailyStats(dStr)
    } catch {
      const dStr = new Date(targetTime).toISOString().slice(0, 10)
      setStatsDate(dStr)
      void loadDailyStats(dStr)
    }
  }

  // 导航外链交互处理
  const handleOpenAddLink = () => {
    setEditingLinkId(null)
    setLinkForm({
      title: '',
      url: 'https://',
      badge: '',
      target: '_blank',
      highlight: false,
      enabled: true,
    })
    setIsAddingNavLink(true)
  }

  const handleEditLink = (link: CustomNavLink) => {
    setEditingLinkId(link.id)
    setLinkForm({
      title: link.title,
      url: link.url,
      badge: link.badge || '',
      target: link.target || '_blank',
      highlight: Boolean(link.highlight),
      enabled: link.enabled,
    })
    setIsAddingNavLink(true)
  }

  const handleCancelLinkForm = () => {
    setIsAddingNavLink(false)
    setEditingLinkId(null)
  }

  const persistNavLinks = async (links: CustomNavLink[]) => {
    setNavLinksSaving(true)
    try {
      await saveAdminNavLinks(links)
    } catch (err) {
      console.error('[AdminPage] 保存外链配置失败:', err)
    } finally {
      setNavLinksSaving(false)
    }
  }

  const handleSaveLinkForm = async () => {
    const title = linkForm.title.trim()
    const url = linkForm.url.trim()
    if (!title) {
      alert('请输入链接名称')
      return
    }
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      alert('请输入以 http:// 或 https:// 开头的合法跳转链接')
      return
    }

    let nextLinks: CustomNavLink[] = []
    if (editingLinkId) {
      nextLinks = adminNavLinks.map((l) =>
        l.id === editingLinkId
          ? {
              ...l,
              title,
              url,
              badge: linkForm.badge.trim() || undefined,
              target: linkForm.target,
              highlight: linkForm.highlight,
              enabled: linkForm.enabled,
            }
          : l,
      )
    } else {
      const newLink: CustomNavLink = {
        id: `nav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        url,
        badge: linkForm.badge.trim() || undefined,
        target: linkForm.target,
        highlight: linkForm.highlight,
        enabled: linkForm.enabled,
        order: adminNavLinks.length,
      }
      nextLinks = [...adminNavLinks, newLink]
    }
    setAdminNavLinks(nextLinks)
    setIsAddingNavLink(false)
    setEditingLinkId(null)
    await persistNavLinks(nextLinks)
  }

  const handleMoveNavLink = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= adminNavLinks.length) return
    const next = [...adminNavLinks]
    const temp = next[index]
    next[index] = next[targetIdx]
    next[targetIdx] = temp
    const reordered = next.map((l, i) => ({ ...l, order: i }))
    setAdminNavLinks(reordered)
    await persistNavLinks(reordered)
  }

  const handleToggleNavLink = async (id: string) => {
    const next = adminNavLinks.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    setAdminNavLinks(next)
    await persistNavLinks(next)
  }

  const handleDeleteNavLink = async (id: string) => {
    if (!confirm('确定删除该导航链接吗？')) return
    const next = adminNavLinks.filter((l) => l.id !== id)
    setAdminNavLinks(next)
    if (editingLinkId === id) {
      setIsAddingNavLink(false)
      setEditingLinkId(null)
    }
    await persistNavLinks(next)
  }

  // 视频源加权番剧展开状态与输入框状态
  const [expandedPluginWeights, setExpandedPluginWeights] = useState<Record<string, boolean>>({})
  const [pluginIdInputs, setPluginIdInputs] = useState<Record<string, string>>({})

  // 当服务端 defaultSettings 更新时同步表单本地副本
  useEffect(() => {
    if (defaultSettings) {
      if (defaultSettings.bangumiImageHost) {
        setDefImageHost(defaultSettings.bangumiImageHost)
      }
      if (defaultSettings.theme) {
        setDefTheme(defaultSettings.theme)
      }
      if (defaultSettings.nav) {
        setDefNav((prev) => ({ ...prev, ...defaultSettings.nav }))
      }
      if (defaultSettings.player) {
        setDefPlayer((prev) => ({ ...prev, ...defaultSettings.player }))
      }
      if (defaultSettings.danmaku) {
        setDefDanmaku((prev) => ({ ...prev, ...defaultSettings.danmaku }))
      }
      if (Array.isArray(defaultSettings.pluginOrder)) {
        setDefPluginOrder(defaultSettings.pluginOrder)
      }
      if (Array.isArray(defaultSettings.disabledPlugins)) {
        setDefDisabledPlugins(defaultSettings.disabledPlugins)
      }
      if (defaultSettings.sourceBangumiIds && typeof defaultSettings.sourceBangumiIds === 'object') {
        setDefSourceBangumiIds(defaultSettings.sourceBangumiIds)
      }
    }
  }, [defaultSettings])

  // 封面图片源保存与恢复（修改即自动保存）
  const [imgSaving, setImgSaving] = useState(false)
  const [imgMsg, setImgMsg] = useState('')

  const handleUpdateImageHost = async (host: string) => {
    setDefImageHost(host)
    setImgSaving(true)
    setImgMsg('')
    try {
      const res = await saveDefaultSettings({ bangumiImageHost: host })
      if (res.ok) {
        setImgMsg('✅ 已自动保存')
      } else {
        setImgMsg(`❌ 保存失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setImgMsg(`❌ 保存异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImgSaving(false)
      setTimeout(() => setImgMsg(''), 2500)
    }
  }

  const handleResetImageHost = async () => {
    setDefImageHost(DEFAULT_BANGUMI_IMAGE_HOST)
    setImgSaving(true)
    setImgMsg('')
    try {
      await saveDefaultSettings({ bangumiImageHost: DEFAULT_BANGUMI_IMAGE_HOST })
      setImgMsg('✅ 已恢复官方默认并自动保存')
    } finally {
      setImgSaving(false)
      setTimeout(() => setImgMsg(''), 2500)
    }
  }

  // 视频源规则排序保存与恢复（修改即自动保存）
  const [pluginsSaving, setPluginsSaving] = useState(false)
  const [pluginsMsg, setPluginsMsg] = useState('')

  const persistPluginsConfig = async (
    order: string[],
    disabled: string[],
    boosted: Record<string, number[]>,
  ) => {
    setPluginsSaving(true)
    setPluginsMsg('')
    try {
      const res = await saveDefaultSettings({
        pluginOrder: order,
        disabledPlugins: disabled,
        sourceBangumiIds: boosted,
      })
      if (res.ok) {
        usePluginStore.getState().setPluginOrder(order)
        setPluginsMsg('✅ 已自动保存')
      } else {
        setPluginsMsg(`❌ 保存失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setPluginsMsg(`❌ 保存异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPluginsSaving(false)
      setTimeout(() => setPluginsMsg(''), 2500)
    }
  }

  const handleAddBangumiIds = (pluginName: string) => {
    const key = pluginName.toLowerCase()
    const input = (pluginIdInputs[pluginName] || '').trim()
    if (!input) return
    const ids = input
      .split(/[\s,，;；\n]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (ids.length === 0) return

    const existing = defSourceBangumiIds[key] || []
    const merged = Array.from(new Set([...existing, ...ids]))
    const nextBoosted = { ...defSourceBangumiIds, [key]: merged }
    setDefSourceBangumiIds(nextBoosted)
    setPluginIdInputs((prev) => ({ ...prev, [pluginName]: '' }))
    void persistPluginsConfig(defPluginOrder, defDisabledPlugins, nextBoosted)
  }

  const handleRemoveBangumiId = (pluginName: string, idToRemove: number) => {
    const key = pluginName.toLowerCase()
    const existing = defSourceBangumiIds[key] || []
    const next = existing.filter((id) => id !== idToRemove)
    const nextBoosted = { ...defSourceBangumiIds }
    if (next.length === 0) {
      delete nextBoosted[key]
    } else {
      nextBoosted[key] = next
    }
    setDefSourceBangumiIds(nextBoosted)
    void persistPluginsConfig(defPluginOrder, defDisabledPlugins, nextBoosted)
  }

  const handleResetPlugins = async () => {
    const defaultNames = allPlugins.map((p) => p.name)
    setDefPluginOrder(defaultNames)
    setDefDisabledPlugins([])
    setDefSourceBangumiIds({})
    setPluginsSaving(true)
    setPluginsMsg('')
    try {
      await saveDefaultSettings({
        pluginOrder: defaultNames,
        disabledPlugins: [],
        sourceBangumiIds: {},
      })
      usePluginStore.getState().setPluginOrder(defaultNames)
      setPluginsMsg('✅ 已恢复官方默认并自动保存')
    } finally {
      setPluginsSaving(false)
      setTimeout(() => setPluginsMsg(''), 2500)
    }
  }

  // 播放器偏好保存与恢复（修改即自动保存）
  const [playerSaving, setPlayerSaving] = useState(false)
  const [playerMsg, setPlayerMsg] = useState('')

  const updatePlayerPref = async (updates: Partial<SitePlayerDefaults>) => {
    const next = { ...defPlayer, ...updates }
    setDefPlayer(next)
    setPlayerSaving(true)
    setPlayerMsg('')
    try {
      const res = await saveDefaultSettings({ player: next })
      if (res.ok) {
        setPlayerMsg('✅ 已自动保存')
      } else {
        setPlayerMsg(`❌ 保存失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setPlayerMsg(`❌ 保存异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPlayerSaving(false)
      setTimeout(() => setPlayerMsg(''), 2500)
    }
  }

  const handleResetPlayer = async () => {
    setDefPlayer({ ...defaultPlayerSettings })
    setPlayerSaving(true)
    setPlayerMsg('')
    try {
      await saveDefaultSettings({ player: { ...defaultPlayerSettings } })
      setPlayerMsg('✅ 已恢复官方默认播放器配置并自动保存')
    } finally {
      setPlayerSaving(false)
      setTimeout(() => setPlayerMsg(''), 2500)
    }
  }

  // 弹幕偏好保存与恢复
  const [danmakuSaving, setDanmakuSaving] = useState(false)
  const [danmakuMsg, setDanmakuMsg] = useState('')

  const handleSaveDanmaku = async () => {
    setDanmakuSaving(true)
    setDanmakuMsg('')
    try {
      const res = await saveDefaultSettings({ danmaku: defDanmaku })
      if (res.ok) {
        setDanmakuMsg('✅ 默认弹幕偏好已保存')
      } else {
        setDanmakuMsg(`❌ 保存失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setDanmakuMsg(`❌ 保存异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDanmakuSaving(false)
      setTimeout(() => setDanmakuMsg(''), 3000)
    }
  }

  const handleResetDanmaku = async () => {
    setDefDanmaku({ ...defaultDanmakuSettings })
    setDanmakuSaving(true)
    setDanmakuMsg('')
    try {
      await saveDefaultSettings({ danmaku: { ...defaultDanmakuSettings } })
      setDanmakuMsg('✅ 已恢复官方默认弹幕配置并保存')
    } finally {
      setDanmakuSaving(false)
      setTimeout(() => setDanmakuMsg(''), 3000)
    }
  }

  // 导航与外观保存与恢复（修改即自动保存）
  const [navSaving, setNavSaving] = useState(false)
  const [navMsg, setNavMsg] = useState('')

  const updateNavPref = async (newTheme = defTheme, newNav = defNav) => {
    setDefTheme(newTheme)
    setDefNav(newNav)
    setNavSaving(true)
    setNavMsg('')
    try {
      const res = await saveDefaultSettings({ nav: newNav, theme: newTheme })
      if (res.ok) {
        setNavMsg('✅ 已自动保存')
      } else {
        setNavMsg(`❌ 保存失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setNavMsg(`❌ 保存异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setNavSaving(false)
      setTimeout(() => setNavMsg(''), 2500)
    }
  }

  const handleResetNav = async () => {
    setDefTheme(DEFAULT_APP_THEME)
    setDefNav({ ...defaultNavSettings })
    setNavSaving(true)
    setNavMsg('')
    try {
      await saveDefaultSettings({ nav: { ...defaultNavSettings }, theme: DEFAULT_APP_THEME })
      setNavMsg('✅ 已恢复官方默认导航栏配置并自动保存')
    } finally {
      setNavSaving(false)
      setTimeout(() => setNavMsg(''), 2500)
    }
  }

  // 站点信息编辑状态
  const [nameInput, setNameInput] = useState(siteName)
  const [taglineInput, setTaglineInput] = useState(siteTagline)
  const [githubUrlInput, setGithubUrlInput] = useState(githubUrl)
  const [feedbackUrlInput, setFeedbackUrlInput] = useState(feedbackUrl)
  const [contactUrlInput, setContactUrlInput] = useState(contactUrl)
  const [modeInput, setModeInput] = useState<'upload' | 'url'>('upload')
  const [urlInput, setUrlInput] = useState(iconUrl)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [cropModalData, setCropModalData] = useState<{
    rawUrl: string
    fileName: string
  } | null>(null)
  const [siteInfoMsg, setSiteInfoMsg] = useState('')
  const [isSiteInfoSaving, setIsSiteInfoSaving] = useState(false)

  useEffect(() => {
    setNameInput(siteName)
    setTaglineInput(siteTagline)
    setGithubUrlInput(githubUrl)
    setFeedbackUrlInput(feedbackUrl)
    setContactUrlInput(contactUrl)
    setModeInput(iconMode === 'url' ? 'url' : 'upload')
    setUrlInput(iconUrl)
  }, [siteName, siteTagline, githubUrl, feedbackUrl, contactUrl, iconMode, iconUrl])

  useEffect(() => {
    return () => {
      if (filePreview && filePreview.startsWith('blob:')) {
        URL.revokeObjectURL(filePreview)
      }
      if (cropModalData?.rawUrl && cropModalData.rawUrl.startsWith('blob:')) {
        URL.revokeObjectURL(cropModalData.rawUrl)
      }
    }
  }, [filePreview, cropModalData])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setSiteInfoMsg('❌ 文件超过 2MB 大小限制，请重新选择')
      return
    }

    const lowerName = file.name.toLowerCase()
    const allowed = ['.ico', '.png', '.jpg', '.jpeg', '.webp']
    if (!allowed.some((ext) => lowerName.endsWith(ext))) {
      setSiteInfoMsg('❌ 不支持的文件格式，仅允许 ICO / PNG / JPG / WEBP')
      return
    }

    setModeInput('upload')
    setSiteInfoMsg('')

    if (lowerName.endsWith('.ico')) {
      setSelectedFile(file)
      if (filePreview && filePreview.startsWith('blob:')) {
        URL.revokeObjectURL(filePreview)
      }
      setFilePreview(URL.createObjectURL(file))
    } else {
      const blobUrl = URL.createObjectURL(file)
      setCropModalData({ rawUrl: blobUrl, fileName: file.name })
    }
    e.target.value = ''
  }

  const handleCropComplete = (croppedFile: File, previewUrl: string) => {
    setSelectedFile(croppedFile)
    setFilePreview(previewUrl)
    setCropModalData(null)
  }

  const handleSaveSiteInfo = async () => {
    setIsSiteInfoSaving(true)
    setSiteInfoMsg('')
    try {
      if (modeInput === 'upload' && selectedFile) {
        await uploadIcon(selectedFile)
      }
      await saveConfig({
        siteName: nameInput,
        siteTagline: taglineInput,
        githubUrl: githubUrlInput,
        feedbackUrl: feedbackUrlInput,
        contactUrl: contactUrlInput,
        iconMode: modeInput,
        iconUrl: urlInput,
      })
      setSelectedFile(null)
      setSiteInfoMsg('✅ 站点基础信息与图标已保存')
    } catch (err) {
      setSiteInfoMsg(`❌ 保存失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setIsSiteInfoSaving(false)
      setTimeout(() => setSiteInfoMsg(''), 3000)
    }
  }

  const handleResetIcon = async () => {
    if (!confirm('确定要恢复官方默认图标吗？')) return
    try {
      await resetIcon()
      setSelectedFile(null)
      if (filePreview && filePreview.startsWith('blob:')) {
        URL.revokeObjectURL(filePreview)
      }
      setFilePreview(null)
      setSiteInfoMsg('✅ 已恢复官方默认图标')
    } catch (err) {
      setSiteInfoMsg(`❌ 重置图标失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  // 公告管理状态
  const [annEnabledInput, setAnnEnabledInput] = useState(announcementEnabled)
  const [annTitleInput, setAnnTitleInput] = useState(announcement?.title || '')
  const [annContentInput, setAnnContentInput] = useState(announcement?.content || '')
  const [annImageUrlInput, setAnnImageUrlInput] = useState(announcement?.imageUrl || '')
  const [annImageLinkInput, setAnnImageLinkInput] = useState(announcement?.imageLink || '')
  const [annSizeInput, setAnnSizeInput] = useState<'compact' | 'standard' | 'large'>(
    announcement?.size || 'standard',
  )
  const [annHeightInput, setAnnHeightInput] = useState<number>(announcement?.imageHeight || 0)
  const [annWidthInput, setAnnWidthInput] = useState<number>(
    typeof announcement?.imageWidth === 'number' ? announcement.imageWidth : 100,
  )
  const [annOffsetXInput, setAnnOffsetXInput] = useState<number>(
    typeof announcement?.imageOffsetX === 'number' ? announcement.imageOffsetX : 50,
  )
  const [annOffsetYInput, setAnnOffsetYInput] = useState<number>(
    typeof announcement?.imageOffsetY === 'number' ? announcement.imageOffsetY : 50,
  )
  const [annZoomInput, setAnnZoomInput] = useState<number>(
    typeof announcement?.imageZoom === 'number' ? announcement.imageZoom : 1,
  )
  const [annSaving, setAnnSaving] = useState(false)
  const [annUploading, setAnnUploading] = useState(false)
  const [annMsg, setAnnMsg] = useState('')
  const [previewAnnouncement, setPreviewAnnouncement] = useState<AnnouncementItem | null>(null)

  useEffect(() => {
    void fetchAnnouncementHistory()
  }, [fetchAnnouncementHistory])

  useEffect(() => {
    setAnnEnabledInput(announcementEnabled)
    setAnnTitleInput(announcement?.title || '')
    setAnnContentInput(announcement?.content || '')
    setAnnImageUrlInput(announcement?.imageUrl || '')
    setAnnImageLinkInput(announcement?.imageLink || '')
    setAnnSizeInput(announcement?.size || 'standard')
    setAnnHeightInput(announcement?.imageHeight || 0)
    setAnnWidthInput(typeof announcement?.imageWidth === 'number' ? announcement.imageWidth : 100)
    setAnnOffsetXInput(typeof announcement?.imageOffsetX === 'number' ? announcement.imageOffsetX : 50)
    setAnnOffsetYInput(typeof announcement?.imageOffsetY === 'number' ? announcement.imageOffsetY : 50)
    setAnnZoomInput(typeof announcement?.imageZoom === 'number' ? announcement.imageZoom : 1)
  }, [announcementEnabled, announcement])

  const handleAnnouncementImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setAnnMsg('❌ 图片大小不能超过 5MB')
      return
    }
    setAnnUploading(true)
    setAnnMsg('正在上传图片…')
    try {
      const res = await uploadAnnouncementImage(file)
      if (res.ok && res.imageUrl) {
        setAnnImageUrlInput(res.imageUrl)
        setAnnMsg('✅ 配图上传成功，可直接在下方调整尺寸与视口')
      } else {
        setAnnMsg(`❌ 上传失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setAnnMsg(`❌ 上传异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAnnUploading(false)
      e.target.value = ''
    }
  }

  const handleSaveAnnouncement = async () => {
    const hasContent = Boolean(
      annTitleInput.trim() || annContentInput.trim() || annImageUrlInput.trim(),
    )
    if (annEnabledInput && !hasContent) {
      setAnnMsg('❌ 开启公告时，标题、正文或图片至少需要填写一项')
      return
    }
    setAnnSaving(true)
    setAnnMsg('')
    try {
      const res = await saveAnnouncement({
        enabled: annEnabledInput,
        title: annTitleInput,
        content: annContentInput,
        imageUrl: annImageUrlInput,
        imageLink: annImageLinkInput,
        size: annSizeInput,
        imageHeight: annHeightInput,
        imageWidth: annWidthInput,
        imageOffsetX: annOffsetXInput,
        imageOffsetY: annOffsetYInput,
        imageZoom: annZoomInput,
      })
      if (res.ok) {
        setAnnMsg(annEnabledInput ? '✅ 公告配置已保存并即时生效' : '✅ 公告配置已保存（当前为停用状态）')
      } else {
        setAnnMsg(`❌ 保存失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setAnnMsg(`❌ 保存异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAnnSaving(false)
      setTimeout(() => setAnnMsg(''), 3000)
    }
  }

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('确定要删除此条历史公告记录吗？')) return
    await deleteAnnouncementHistory(id)
  }

  // IndexNow 推送
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexMsg, setIndexMsg] = useState('')

  const handleTriggerIndexNow = async () => {
    if (isIndexing) return
    setIsIndexing(true)
    setIndexMsg('')
    try {
      const res = await triggerIndexNow()
      if (res.ok) {
        setIndexMsg(`✅ 成功向 Bing / Yandex 推送 ${res.submitted ?? 0} 条番剧链接`)
      } else {
        setIndexMsg(`❌ 推送失败: ${res.message || '未知错误'}`)
      }
    } catch (err) {
      setIndexMsg(`❌ 推送异常: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsIndexing(false)
    }
  }

  // 危险操作：出厂重置
  const [isResettingAll, setIsResettingAll] = useState(false)
  const handleResetAll = async () => {
    const confirmed = confirm(
      '⚠️ 警告：此操作将彻底清空服务器保存的站点名称、标语、自定义图标、全站公告及所有全局默认配置，恢复出厂默认值！\n\n确定要继续吗？',
    )
    if (!confirmed) return
    setIsResettingAll(true)
    try {
      await resetAllConfig()
      alert('已全局恢复官方出厂默认设置。')
      window.location.reload()
    } catch (err) {
      alert(`重置失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setIsResettingAll(false)
    }
  }

  // 视频源排序辅助
  const sortedDefaultPlugins = useMemo(() => {
    const list = [...allPlugins]
    const rank = new Map<string, number>()
    for (let i = 0; i < defPluginOrder.length; i++) {
      rank.set(defPluginOrder[i].toLowerCase(), i)
    }
    return list.sort((a, b) => {
      const inOrderA = rank.has(a.name.toLowerCase())
      const inOrderB = rank.has(b.name.toLowerCase())
      if (inOrderA && inOrderB) {
        return (rank.get(a.name.toLowerCase())!) - (rank.get(b.name.toLowerCase())!)
      }
      const weightDiff = comparePluginOrder(a, b)
      if (weightDiff !== 0) return weightDiff
      const ra = rank.get(a.name.toLowerCase()) ?? defPluginOrder.length
      const rb = rank.get(b.name.toLowerCase()) ?? defPluginOrder.length
      return ra - rb
    })
  }, [allPlugins, defPluginOrder])

  const movePluginOrder = (name: string, dir: -1 | 1) => {
    const names = sortedDefaultPlugins.map((p) => p.name)
    const idx = names.findIndex((n) => n.toLowerCase() === name.toLowerCase())
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= names.length) return
    ;[names[idx], names[target]] = [names[target], names[idx]]
    setDefPluginOrder(names)
    void persistPluginsConfig(names, defDisabledPlugins, defSourceBangumiIds)
  }

  const togglePluginDisabledState = (name: string) => {
    const key = name.toLowerCase()
    const nextDisabled = defDisabledPlugins.some((n) => n.toLowerCase() === key)
      ? defDisabledPlugins.filter((n) => n.toLowerCase() !== key)
      : [...defDisabledPlugins, name]
    setDefDisabledPlugins(nextDisabled)
    void persistPluginsConfig(defPluginOrder, nextDisabled, defSourceBangumiIds)
  }

  const previewCurrentIconUrl =
    filePreview ||
    (modeInput === 'upload'
      ? `/logo.png${iconUpdatedAt ? `?v=${iconUpdatedAt}` : ''}`
      : modeInput === 'url' && urlInput
        ? urlInput
        : '/logo.png')

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      {/* 顶部标题栏 */}
      <div className="flex flex-col gap-1 border-b border-[var(--kz-border)] pb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--kz-fg)]">
            站点运维与全局配置
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            已授权 (Admin)
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--kz-fg-muted)] leading-relaxed">
          在此配置站点基础品牌、全站公告，并设定全站新用户的全局默认偏好（各模块内部独立保存生效，与用户本地定制解耦）。
        </p>
      </div>

      {/* 0. 站点日活与流量监控 (DAU Analytics) */}
      <AdminCard
        id="stats-daily"
        icon="📊"
        title="站点日活与流量监控"
        summary={
          dailyStats
            ? `${dailyStats.isToday ? '今日实时' : dailyStats.date} · DAU: ${dailyStats.dau.toLocaleString()} · 播放: ${dailyStats.totalViews.toLocaleString()}`
            : '查看每日活跃与点播走势'
        }
        isOpen={openSections['stats-daily']}
        onToggle={() => toggleSection('stats-daily')}
      >
        <div className="space-y-4">
          {/* 日期选择与快捷按钮 */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="admin-stats-date" className="text-xs font-semibold text-[var(--kz-fg)]">
                查询日期:
              </label>
              <input
                id="admin-stats-date"
                type="date"
                value={statsDate}
                onChange={(e) => {
                  const val = e.target.value
                  setStatsDate(val)
                  if (val) void loadDailyStats(val)
                }}
                className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] transition-all cursor-pointer"
              />
              <div className="flex items-center gap-1 pl-1">
                <button
                  type="button"
                  onClick={() => selectQuickDate(0)}
                  className="rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2 py-1 text-[11px] font-medium text-[var(--kz-fg)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] transition-all cursor-pointer"
                >
                  今日(实时)
                </button>
                <button
                  type="button"
                  onClick={() => selectQuickDate(1)}
                  className="rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2 py-1 text-[11px] font-medium text-[var(--kz-fg-muted)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-fg)] transition-all cursor-pointer"
                >
                  昨日
                </button>
                <button
                  type="button"
                  onClick={() => selectQuickDate(2)}
                  className="rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2 py-1 text-[11px] font-medium text-[var(--kz-fg-muted)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-fg)] transition-all cursor-pointer"
                >
                  前日
                </button>
                <button
                  type="button"
                  onClick={() => selectQuickDate(7)}
                  className="rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2 py-1 text-[11px] font-medium text-[var(--kz-fg-muted)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-fg)] transition-all cursor-pointer"
                >
                  7天前
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {dailyStats?.isToday ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                  秒级实时聚合
                </span>
              ) : (
                <span className="rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--kz-fg-muted)]">
                  历史快照
                </span>
              )}
              <button
                type="button"
                onClick={() => loadDailyStats(statsDate)}
                disabled={statsLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--kz-fg)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <span className={statsLoading ? 'animate-spin' : ''}>🔄</span>
                {statsLoading ? '刷新中…' : '刷新数据'}
              </button>
            </div>
          </div>

          {statsError && (
            <p className="text-xs font-medium text-rose-500">{statsError}</p>
          )}

          {/* 4 个核心 KPI 卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-[var(--kz-fg-muted)]">
                <span>当日日活 (DAU)</span>
                <span>📱</span>
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[var(--kz-fg)] font-mono">
                {dailyStats ? dailyStats.dau.toLocaleString() : '-'}
              </div>
              <div className="mt-1 text-[10px] text-[var(--kz-fg-dim)]">独立活跃客户端设备</div>
            </div>

            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-[var(--kz-fg-muted)]">
                <span>当日新增设备</span>
                <span>🆕</span>
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-emerald-400 font-mono">
                {dailyStats ? dailyStats.newDevices.toLocaleString() : '-'}
              </div>
              <div className="mt-1 text-[10px] text-[var(--kz-fg-dim)]">首次访问站点设备</div>
            </div>

            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-[var(--kz-fg-muted)]">
                <span>当日番剧播放</span>
                <span>🎬</span>
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[var(--kz-accent)] font-mono">
                {dailyStats ? dailyStats.totalViews.toLocaleString() : '-'}
              </div>
              <div className="mt-1 text-[10px] text-[var(--kz-fg-dim)]">有效点播总次数</div>
            </div>

            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-[var(--kz-fg-muted)]">
                <span>当日访问 PV</span>
                <span>🌐</span>
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-amber-400 font-mono">
                {dailyStats ? dailyStats.todayHits.toLocaleString() : '-'}
              </div>
              <div className="mt-1 text-[10px] text-[var(--kz-fg-dim)]">IP 访问总请求数</div>
            </div>
          </div>

          {/* 14 天近况柱状走势图 */}
          {dailyStats && dailyStats.trend && dailyStats.trend.length > 0 && (
            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--kz-fg)]">
                  📈 近 14 天活跃设备 (DAU) 走势
                </span>
                <span className="text-[11px] text-[var(--kz-fg-dim)]">
                  点击柱子可直接切换查看该日数据 · 累计总设备数:{' '}
                  <span className="font-bold text-[var(--kz-fg)] font-mono">
                    {dailyStats.totalDevices.toLocaleString()}
                  </span>
                </span>
              </div>

              {/* 柱状图列表 */}
              <div className="flex items-end justify-between gap-1 pt-4 pb-1 h-32 overflow-x-auto">
                {(() => {
                  const maxVal = Math.max(
                    ...dailyStats.trend.map((t) => t.dau),
                    10,
                  )
                  return dailyStats.trend.map((item) => {
                    const isSelected = item.date === statsDate
                    const heightPercent = Math.max(
                      Math.round((item.dau / maxVal) * 100),
                      item.dau > 0 ? 8 : 4,
                    )
                    return (
                      <button
                        key={item.date}
                        type="button"
                        onClick={() => {
                          setStatsDate(item.date)
                          void loadDailyStats(item.date)
                        }}
                        className="group flex flex-1 flex-col items-center justify-end h-full min-w-[20px] cursor-pointer"
                        title={`${item.date}\nDAU: ${item.dau.toLocaleString()} 人\n播放: ${item.totalViews.toLocaleString()} 次`}
                      >
                        <div className="relative w-full flex justify-center items-end h-full">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={`w-full max-w-[26px] rounded-t transition-all ${
                              isSelected
                                ? 'bg-[var(--kz-accent)] shadow-[0_0_8px_var(--kz-accent)]'
                                : 'bg-[var(--kz-bg-soft)] group-hover:bg-[var(--kz-accent)]/60'
                            }`}
                          />
                        </div>
                        <span
                          className={`mt-1.5 text-[9px] font-mono leading-none transition-colors ${
                            isSelected
                              ? 'text-[var(--kz-accent)] font-bold'
                              : 'text-[var(--kz-fg-dim)] group-hover:text-[var(--kz-fg)]'
                          }`}
                        >
                          {item.date.slice(5)}
                        </span>
                      </button>
                    )
                  })
                })()}
              </div>
            </div>
          )}
        </div>
      </AdminCard>

      {/* 1. 服务健康与运行状态 */}
      <AdminCard
        id="server-health"
        icon="🖥️"
        title="服务状态与运行环境"
        summary={health.data?.ok ? '服务健康 · 正常' : '检查中…'}
        isOpen={openSections['server-health']}
        onToggle={() => toggleSection('server-health')}
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3">
              <div className="text-[var(--kz-fg-muted)] text-[11px]">后端服务状态</div>
              <div className="mt-1 flex items-center gap-1.5 font-semibold text-[var(--kz-fg)]">
                <span
                  className={`h-2 w-2 rounded-full ${
                    health.data?.ok ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                {health.data?.ok ? '正常在线 (HTTP 200)' : '连接异常'}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3">
              <div className="text-[var(--kz-fg-muted)] text-[11px]">客户端直连策略</div>
              <div className="mt-1 font-semibold text-emerald-400">
                100% 零服务器出站直连 (Zero-Egress)
              </div>
            </div>
            <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3">
              <div className="text-[var(--kz-fg-muted)] text-[11px]">全站公告广播</div>
              <div className="mt-1 font-semibold text-[var(--kz-fg)]">
                {announcementEnabled ? '📢 启用中' : '⚪ 已关闭'}
              </div>
            </div>
          </div>
        </div>
      </AdminCard>

      {/* 2. 站点品牌与基础信息 */}
      <AdminCard
        id="site-branding"
        icon="🏷️"
        title="站点品牌与图标"
        summary={siteName || '默认品牌'}
        isOpen={openSections['site-branding']}
        onToggle={() => toggleSection('site-branding')}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--kz-fg)]">
                站点名称 (siteName)
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="例如：Animaku 动漫"
                maxLength={50}
                className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)]"
              />
              <p className="text-[11px] text-[var(--kz-fg-dim)]">
                留空则回落为官方默认「Animaku 动漫」。
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--kz-fg)]">
                站点副标语 (siteTagline)
              </label>
              <input
                type="text"
                value={taglineInput}
                onChange={(e) => setTaglineInput(e.target.value)}
                placeholder="例如：纯净、直连、无广告"
                maxLength={100}
                className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)]"
              />
              <p className="text-[11px] text-[var(--kz-fg-dim)]">
                展示在桌面端导航栏标题下方及 SEO 元信息中。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--kz-border)]/40">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--kz-fg)]">
                源码链接 (githubUrl)
              </label>
              <input
                type="text"
                value={githubUrlInput}
                onChange={(e) => setGithubUrlInput(e.target.value)}
                placeholder="例如：https://github.com/uerax/Animaku"
                maxLength={500}
                className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)]"
              />
              <p className="text-[11px] text-[var(--kz-fg-dim)]">
                点击页脚站名「{nameInput || 'Animaku'}」时的跳转目标。留空则默认为官方仓库。
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--kz-fg)]">
                反馈链接 (feedbackUrl)
              </label>
              <input
                type="text"
                value={feedbackUrlInput}
                onChange={(e) => setFeedbackUrlInput(e.target.value)}
                placeholder="例如：https://github.com/uerax/Animaku/issues"
                maxLength={500}
                className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)]"
              />
              <p className="text-[11px] text-[var(--kz-fg-dim)]">
                展示在页脚的「反馈」外链。留空则默认为当前源码仓库的 Issues 页面。
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--kz-fg)]">
              联系链接 / 方式 (contactUrl)
            </label>
            <input
              type="text"
              value={contactUrlInput}
              onChange={(e) => setContactUrlInput(e.target.value)}
              placeholder="例如：https://github.com/uerax 或 mailto:contact@example.com"
              maxLength={500}
              className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)]"
            />
            <p className="text-[11px] text-[var(--kz-fg-dim)]">
              展示在页脚的「联系」外链。支持网页链接、mailto: 邮箱或 Telegram/QQ 等，留空则默认为官方开发者主页「https://github.com/uerax」。
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--kz-border)]/40">
            <label className="text-xs font-semibold text-[var(--kz-fg)]">
              站点图标 (Favicon & Logo)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <img
                src={previewCurrentIconUrl}
                alt="Favicon preview"
                className="h-14 w-14 rounded-2xl object-cover ring-1 ring-[var(--kz-border)] bg-[var(--kz-bg-soft)] p-0.5 shadow-sm"
              />
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] cursor-pointer">
                    📁 上传图片生成全套图标
                    <input
                      type="file"
                      accept=".ico,.png,.jpg,.jpeg,.webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleResetIcon}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1.5 text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] cursor-pointer"
                  >
                    恢复官方默认图标
                  </button>
                </div>
                <p className="text-[11px] text-[var(--kz-fg-dim)]">
                  支持 ICO / PNG / JPG / WEBP，上传后自动弹出正方形裁切器，并生成多尺寸标准 Web 图标套件。
                </p>
              </div>
            </div>
          </div>

          {siteInfoMsg && (
            <div className="text-xs text-[var(--kz-accent)] pt-1">{siteInfoMsg}</div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSaveSiteInfo}
              disabled={isSiteInfoSaving}
              className="rounded-xl bg-[var(--kz-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSiteInfoSaving ? '保存中…' : '保存站点信息'}
            </button>
          </div>
        </div>
      </AdminCard>

      {/* 3. 全站公告管理 */}
      <AdminCard
        id="site-announcement"
        icon="📢"
        title="全站公告管理"
        summary={announcementEnabled ? `已开启: ${annTitleInput || '无标题'}` : '已停用'}
        isOpen={openSections['site-announcement']}
        onToggle={() => toggleSection('site-announcement')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-[var(--kz-fg)]">
                公告编辑区
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  annEnabledInput
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-dim)] border border-[var(--kz-border)]'
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    annEnabledInput ? 'bg-emerald-400 animate-pulse' : 'bg-[var(--kz-fg-dim)]'
                  }`}
                />
                {annEnabledInput ? '弹窗已开启' : '弹窗已停用'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewAnnouncement({
                  id: 'preview',
                  title: annTitleInput,
                  content: annContentInput,
                  imageUrl: annImageUrlInput,
                  imageLink: annImageLinkInput,
                  size: annSizeInput,
                  imageHeight: annHeightInput,
                  imageWidth: annWidthInput,
                  imageOffsetX: annOffsetXInput,
                  imageOffsetY: annOffsetYInput,
                  imageZoom: annZoomInput,
                  updatedAt: Date.now(),
                })
              }}
              className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1 text-xs text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] cursor-pointer"
            >
              👁️ 预览弹窗效果
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--kz-fg)]">公告标题</label>
            <input
              type="text"
              value={annTitleInput}
              onChange={(e) => setAnnTitleInput(e.target.value)}
              placeholder="例如：系统维护通知或新功能上线"
              className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)]"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs sm:text-sm text-[var(--kz-fg)]">
            <span className="font-semibold text-xs text-[var(--kz-fg)]">弹窗规格尺寸</span>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { key: 'compact', label: '紧凑 (360px)' },
                  { key: 'standard', label: '标准 (460px)' },
                  { key: 'large', label: '宽屏海报 (560px)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAnnSizeInput(opt.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                    annSizeInput === opt.key
                      ? 'border-[var(--kz-accent)] bg-[var(--kz-accent)]/10 text-[var(--kz-accent)] font-semibold'
                      : 'border-[var(--kz-border)] bg-[var(--kz-bg)] text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--kz-fg)]">公告正文 (支持换行与链接)</label>
            <textarea
              rows={4}
              value={annContentInput}
              onChange={(e) => setAnnContentInput(e.target.value)}
              placeholder="请输入公告内容…"
              className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 text-xs sm:text-sm text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--kz-fg)]">
                公告配图 (可选)
              </label>
              <label className="text-xs text-[var(--kz-accent)] hover:underline cursor-pointer">
                {annUploading ? '上传中…' : '📁 上传本地配图'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAnnouncementImageUpload}
                  disabled={annUploading}
                  className="hidden"
                />
              </label>
            </div>
            <input
              type="text"
              value={annImageUrlInput}
              onChange={(e) => setAnnImageUrlInput(e.target.value)}
              placeholder="可填外部图片直链或上传生成的站内相对路径 /api/site/announcement-image/…"
              className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 text-xs sm:text-sm text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)]"
            />
          </div>

          {annMsg && <div className="text-xs text-[var(--kz-accent)]">{annMsg}</div>}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--kz-border)]/40">
            <div className="text-[11px] text-[var(--kz-fg-dim)]">
              {annEnabledInput
                ? '🟢 公告处于启用状态，保存后全站访客访问时将弹出此公告。'
                : '⚪ 公告处于停用状态，保存后全站不会弹出任何公告。'}
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
              {/* 方案 B：高质感滑动开关 + 醒目状态 Badge */}
              <label
                className="relative inline-flex items-center gap-2 cursor-pointer select-none group"
                title={annEnabledInput ? '点击切换为停用公告' : '点击切换为开启公告'}
              >
                <span className="text-xs font-semibold text-[var(--kz-fg)]">
                  全站弹窗
                </span>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={annEnabledInput}
                  onChange={(e) => setAnnEnabledInput(e.target.checked)}
                />
                <div className="relative w-11 h-6 rounded-full border transition-all duration-200 bg-[var(--kz-bg-soft)] border-[var(--kz-border)] peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/50 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all after:shadow-sm peer-checked:after:translate-x-5" />
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                    annEnabledInput
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-dim)] border border-[var(--kz-border)]'
                  }`}
                >
                  {annEnabledInput ? '已开启' : '已停用'}
                </span>
              </label>

              {/* 保存按钮 */}
              <button
                type="button"
                onClick={handleSaveAnnouncement}
                disabled={annSaving}
                className="rounded-xl bg-[var(--kz-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {annSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>

          {announcementHistory.length > 0 && (
            <div className="pt-3 border-t border-[var(--kz-border)]/40 space-y-2">
              <div className="text-xs font-semibold text-[var(--kz-fg-muted)]">历史公告归档</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {announcementHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[var(--kz-bg)] px-3 py-1.5 text-xs border border-[var(--kz-border)]/50"
                  >
                    <div className="truncate flex-1">
                      <span className="font-medium text-[var(--kz-fg)]">{item.title || '无标题'}</span>
                      <span className="text-[10px] text-[var(--kz-fg-dim)] ml-2">
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAnnTitleInput(item.title || '')
                          setAnnContentInput(item.content || '')
                          setAnnImageUrlInput(item.imageUrl || '')
                          setAnnImageLinkInput(item.imageLink || '')
                          setAnnSizeInput(item.size || 'standard')
                          setAnnHeightInput(item.imageHeight || 0)
                          setAnnWidthInput(item.imageWidth || 100)
                          setAnnOffsetXInput(item.imageOffsetX || 50)
                          setAnnOffsetYInput(item.imageOffsetY || 50)
                          setAnnZoomInput(item.imageZoom || 1)
                        }}
                        className="text-[11px] text-[var(--kz-accent)] hover:underline cursor-pointer"
                      >
                        还原载入
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistory(item.id)}
                        className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AdminCard>

      {/* 4. 全局默认封面图片源 */}
      <AdminCard
        id="default-image"
        icon="🖼️"
        title="全局默认封面图片源"
        summary={
          BANGUMI_IMAGE_HOST_OPTIONS.find((o) => o.host === defImageHost)?.label || defImageHost
        }
        isOpen={openSections['default-image']}
        onToggle={() => toggleSection('default-image')}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
            设定新访客首次进入站点时默认使用的 Bangumi 番剧封面图片源。用户端本地个人设置中仍可自主覆盖。
          </p>

          <div className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
            <div>
              <span className="font-medium text-[var(--kz-fg)]">封面图片源</span>
              <div className="text-[11px] text-[var(--kz-fg-dim)]">新访客首次进入站点默认使用的 Bangumi 封面图源</div>
            </div>
            <AdminSelect
              value={defImageHost}
              onChange={(v) => handleUpdateImageHost(v)}
              options={BANGUMI_IMAGE_HOST_OPTIONS.map((o) => ({
                value: o.host,
                label: `${o.label}${o.host === DEFAULT_BANGUMI_IMAGE_HOST ? ' · 默认' : ''}`,
              }))}
              className="w-56 sm:w-64 shrink-0"
              dropdownWidth="w-full"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--kz-border)]/40">
            <button
              type="button"
              onClick={handleResetImageHost}
              disabled={imgSaving}
              className="text-xs text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)] underline cursor-pointer"
            >
              恢复默认
            </button>
            <div className="text-xs">
              {imgSaving && <span className="text-[var(--kz-fg-muted)]">保存中…</span>}
              {imgMsg && <span className="text-[var(--kz-accent)]">{imgMsg}</span>}
            </div>
          </div>
        </div>
      </AdminCard>

      {/* 5. 全局默认规则与视频源优先级 */}
      <AdminCard
        id="default-plugins"
        icon="🧩"
        title="全局默认视频源与排序"
        summary={`共 ${sortedDefaultPlugins.length} 个源 · 默认选源: ${sortedDefaultPlugins[0]?.name || '无'}`}
        isOpen={openSections['default-plugins']}
        onToggle={() => toggleSection('default-plugins')}
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
            设定全站新访客加载的默认视频源排序与启用状态。排在第 1 位的源将作为新访客打开播放页时的
            <strong className="text-[var(--kz-accent)]"> 全局默认视频源</strong>。
            同时支持为每个视频源添加专属加权的番剧（Bangumi ID），播放对应番剧时权重自动 <strong className="text-amber-400">+20</strong>。
          </p>

          <div className="space-y-2">
            {sortedDefaultPlugins.map((plugin, index) => {
              const isDisabled = defDisabledPlugins.some(
                (n) => n.toLowerCase() === plugin.name.toLowerCase(),
              )
              const isDefaultTop = index === 0
              const pluginKey = plugin.name.toLowerCase()
              const boostedIds = defSourceBangumiIds[pluginKey] || []
              const isExpanded = Boolean(expandedPluginWeights[plugin.name])

              return (
                <div
                  key={plugin.name}
                  className={`flex flex-col gap-2 rounded-xl border p-2.5 sm:px-3.5 sm:py-2.5 transition-all ${
                    isDefaultTop
                      ? 'border-[var(--kz-accent)]/50 bg-[var(--kz-accent)]/5'
                      : 'border-[var(--kz-border)] bg-[var(--kz-bg)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          isDefaultTop
                            ? 'bg-[var(--kz-accent)] text-white shadow-sm'
                            : 'bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)]'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={`truncate text-xs sm:text-sm font-semibold ${
                          isDisabled ? 'line-through text-[var(--kz-fg-dim)]' : 'text-[var(--kz-fg)]'
                        }`}
                      >
                        {plugin.name}
                      </span>
                      {renderPluginBadge(plugin)}
                      {isDefaultTop && (
                        <span className="rounded bg-[var(--kz-accent)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--kz-accent)]">
                          默认首选源
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPluginWeights((prev) => ({
                            ...prev,
                            [plugin.name]: !prev[plugin.name],
                          }))
                        }
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium border transition-colors cursor-pointer ${
                          boostedIds.length > 0
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                            : 'border-[var(--kz-border)] bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]'
                        }`}
                        title="配置播放特定番剧时该源增加权重 20"
                      >
                        🎯 番剧加权{boostedIds.length > 0 ? ` (${boostedIds.length})` : ''}
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePluginDisabledState(plugin.name)}
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                          isDisabled
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                        title={isDisabled ? '已全局禁用，点击启用' : '正常启用，点击禁用'}
                      >
                        {isDisabled ? '已禁用' : '已启用'}
                      </button>

                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => movePluginOrder(plugin.name, -1)}
                        className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] p-1 text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] disabled:opacity-30 cursor-pointer"
                        title="上移"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === sortedDefaultPlugins.length - 1}
                        onClick={() => movePluginOrder(plugin.name, 1)}
                        className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] p-1 text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] disabled:opacity-30 cursor-pointer"
                        title="下移"
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-1 pt-2 border-t border-[var(--kz-border)]/50 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-[var(--kz-fg-muted)]">
                        <span>
                          添加专属加权的 Bangumi ID（播放这些番剧时权重 <strong className="text-amber-400">+20</strong>）：
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={pluginIdInputs[plugin.name] || ''}
                          onChange={(e) =>
                            setPluginIdInputs((prev) => ({
                              ...prev,
                              [plugin.name]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddBangumiIds(plugin.name)
                            }
                          }}
                          placeholder="输入 Bangumi ID，如 253，多个用逗号隔开"
                          className="flex-1 rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-2.5 py-1 text-xs text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddBangumiIds(plugin.name)}
                          className="shrink-0 rounded-lg bg-[var(--kz-accent)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--kz-accent-hover)] cursor-pointer"
                        >
                          添加
                        </button>
                      </div>

                      {boostedIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {boostedIds.map((bgmId) => (
                            <span
                              key={bgmId}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono text-amber-400"
                            >
                              ID: {bgmId}
                              <button
                                type="button"
                                onClick={() => handleRemoveBangumiId(plugin.name, bgmId)}
                                className="hover:text-rose-400 cursor-pointer ml-0.5"
                                title="移除此 ID"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-[var(--kz-fg-dim)]">暂未添加任何专属番剧 ID</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--kz-border)]/40">
            <button
              type="button"
              onClick={handleResetPlugins}
              disabled={pluginsSaving}
              className="text-xs text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)] underline cursor-pointer"
            >
              恢复默认
            </button>
            <div className="text-xs">
              {pluginsSaving && <span className="text-[var(--kz-fg-muted)]">保存中…</span>}
              {pluginsMsg && <span className="text-[var(--kz-accent)]">{pluginsMsg}</span>}
            </div>
          </div>
        </div>
      </AdminCard>

      {/* 6. 全局默认播放器偏好 */}
      <AdminCard
        id="default-player"
        icon="🎬"
        title="全局默认播放器偏好"
        summary={`${defPlayer.speed}x · ${defPlayer.autoNext ? '连播' : '单集'} · ${defPlayer.superResolution && defPlayer.superResolution !== 'off' ? '超分开启' : '无超分'}`}
        isOpen={openSections['default-player']}
        onToggle={() => toggleSection('default-player')}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
            设定全站新访客或在播放页点击「恢复默认」时所继承的基准播放器设置。
          </p>

          <div className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
            <span className="font-medium text-[var(--kz-fg)]">默认播放倍速</span>
            <AdminSelect<number>
              value={defPlayer.speed ?? 1}
              onChange={(v) => updatePlayerPref({ speed: v })}
              options={PLAYER_SPEEDS.map((s) => ({ value: s, label: `${s}x` }))}
              className="w-28 shrink-0"
              dropdownWidth="w-28"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
            <span className="font-medium text-[var(--kz-fg)]">超分（Anime4K）</span>
            <AdminSelect
              value={defPlayer.superResolution || 'off'}
              onChange={(v) =>
                updatePlayerPref({ superResolution: v as SuperResolutionMode })
              }
              options={[
                { value: 'off', label: '关闭 (无开销)' },
                { value: 'efficiency', label: '效能优先 (轻量)' },
                { value: 'quality', label: '画质优先 (ModeA)' },
              ]}
              className="w-48 shrink-0"
              dropdownWidth="w-48"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--kz-border)]/40">
            <AdminToggle
              label="默认自动起播"
              checked={Boolean(defPlayer.autoplay)}
              onChange={(v) => updatePlayerPref({ autoplay: v })}
            />
            <AdminToggle
              label="默认连播下一集"
              checked={Boolean(defPlayer.autoNext)}
              onChange={(v) => updatePlayerPref({ autoNext: v })}
            />
            <AdminToggle
              label="默认记忆续播"
              checked={Boolean(defPlayer.continuePlay)}
              onChange={(v) => updatePlayerPref({ continuePlay: v })}
            />
            <AdminToggle
              label="默认优先从 bangumi-oped 获取精准跳过时间戳"
              checked={Boolean(defPlayer.preferBangumiOped)}
              onChange={(v) => updatePlayerPref({ preferBangumiOped: v })}
            />
            <AdminToggle
              label="默认第一集防跳过保护（首集不自动跳过 OP/ED，仅悬浮提示）"
              checked={Boolean(defPlayer.firstEpisodeProtect)}
              onChange={(v) => updatePlayerPref({ firstEpisodeProtect: v })}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--kz-border)]/40">
            <button
              type="button"
              onClick={handleResetPlayer}
              disabled={playerSaving}
              className="text-xs text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)] underline cursor-pointer"
            >
              恢复默认
            </button>
            <div className="text-xs">
              {playerSaving && <span className="text-[var(--kz-fg-muted)]">保存中…</span>}
              {playerMsg && <span className="text-[var(--kz-accent)]">{playerMsg}</span>}
            </div>
          </div>
        </div>
      </AdminCard>

      {/* 7. 全局默认弹幕偏好 */}
      <AdminCard
        id="default-danmaku"
        icon="💬"
        title="全局默认弹幕偏好"
        summary={defDanmaku.enabled ? `开启 · 透明度 ${Math.round((defDanmaku.opacity ?? 0.85) * 100)}%` : '默认关闭'}
        isOpen={openSections['default-danmaku']}
        onToggle={() => toggleSection('default-danmaku')}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
            设定全站新访客或点击弹幕设置「恢复默认」时生效的基准弹幕配置。
          </p>

          <AdminToggle
            label="默认开启弹幕总开关"
            checked={Boolean(defDanmaku.enabled)}
            onChange={(v) => setDefDanmaku((d) => ({ ...d, enabled: v }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs sm:text-sm">
              <div className="flex justify-between mb-1 text-[var(--kz-fg)]">
                <span>默认不透明度</span>
                <span>{Math.round((defDanmaku.opacity ?? 0.85) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={defDanmaku.opacity ?? 0.85}
                onChange={(e) =>
                  setDefDanmaku((d) => ({ ...d, opacity: Number(e.target.value) }))
                }
                className="w-full cursor-pointer"
              />
            </label>

            <label className="block text-xs sm:text-sm">
              <div className="flex justify-between mb-1 text-[var(--kz-fg)]">
                <span>默认字体缩放</span>
                <span>{Math.round((defDanmaku.fontSize ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={defDanmaku.fontSize ?? 1}
                onChange={(e) =>
                  setDefDanmaku((d) => ({ ...d, fontSize: Number(e.target.value) }))
                }
                className="w-full cursor-pointer"
              />
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--kz-border)]/40">
            <AdminToggle
              label="展示滚动弹幕"
              checked={defDanmaku.showScroll ?? true}
              onChange={(v) => setDefDanmaku((d) => ({ ...d, showScroll: v }))}
            />
            <AdminToggle
              label="展示顶部弹幕"
              checked={defDanmaku.showTop ?? true}
              onChange={(v) => setDefDanmaku((d) => ({ ...d, showTop: v }))}
            />
            <AdminToggle
              label="展示彩色弹幕"
              checked={defDanmaku.showColor ?? true}
              onChange={(v) => setDefDanmaku((d) => ({ ...d, showColor: v }))}
            />
            <AdminToggle
              label="默认开启简繁转换 (繁体转简体)"
              checked={defDanmaku.simplify ?? false}
              onChange={(v) => setDefDanmaku((d) => ({ ...d, simplify: v }))}
            />
          </div>

          {danmakuMsg && <div className="text-xs text-[var(--kz-accent)] pt-1">{danmakuMsg}</div>}

          <div className="flex items-center justify-between pt-2 border-t border-[var(--kz-border)]/40">
            <button
              type="button"
              onClick={handleResetDanmaku}
              disabled={danmakuSaving}
              className="text-xs text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)] underline cursor-pointer"
            >
              恢复默认
            </button>
            <button
              type="button"
              onClick={handleSaveDanmaku}
              disabled={danmakuSaving}
              className="rounded-xl bg-[var(--kz-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--kz-accent-hover)] active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {danmakuSaving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </AdminCard>

      {/* 8. 导航栏外链与广告商配置 */}
      <AdminCard
        id="custom-nav-links"
        icon="🔗"
        title="导航栏外链与广告商配置"
        summary={
          adminNavLinks.length > 0
            ? `已配置 ${adminNavLinks.length} 条 (${adminNavLinks.filter((l) => l.enabled).length} 条展示中 · 即改即存)`
            : '配置广告商或合作外链'
        }
        isOpen={openSections['custom-nav-links']}
        onToggle={() => toggleSection('custom-nav-links')}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed max-w-xl">
              在此配置顶部导航栏的广告商外链、合作推荐或社区链接（添加、修改、排序或开关均即改即存生效）。前台将严格采用{' '}
              <code className="text-[var(--kz-accent)] font-mono">rel="noopener noreferrer sponsored"</code>{' '}
              新标签页安全跳转，防劫持且符合 SEO 规范。
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAddLink}
                className="inline-flex items-center gap-1 rounded-xl bg-[var(--kz-accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--kz-accent-hover)] active:scale-95 transition-all cursor-pointer"
              >
                <span>➕</span>
                <span>添加外链广告位</span>
              </button>
            </div>
          </div>

          {/* 新增 / 编辑外链表单抽屉 */}
          {isAddingNavLink && (
            <div className="rounded-2xl border border-[var(--kz-accent)]/30 bg-[var(--kz-bg)] p-4 space-y-3 shadow-md animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-[var(--kz-border)] pb-2 text-xs font-bold text-[var(--kz-fg)]">
                <span>{editingLinkId ? '✏️ 编辑外链' : '➕ 新增广告外链'}</span>
                <button
                  type="button"
                  onClick={handleCancelLinkForm}
                  className="text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] cursor-pointer"
                >
                  ✕ 关闭
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-[var(--kz-fg)]">
                    链接名称 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="如：ACG 周边商城、特惠漫画网"
                    value={linkForm.title}
                    onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })}
                    className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[var(--kz-fg)]">
                    跳转目标 URL <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={linkForm.url}
                    onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })}
                    className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs text-[var(--kz-fg)] font-mono outline-none focus:border-[var(--kz-accent)] transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-[var(--kz-fg)]">
                      角标文本 (选填)
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      {['HOT', 'AD', '福利', '推荐'].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setLinkForm({ ...linkForm, badge: tag })}
                          className="rounded px-1.5 py-0.5 border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] text-[var(--kz-fg-muted)] hover:text-[var(--kz-accent)] hover:border-[var(--kz-accent)] cursor-pointer"
                        >
                          {tag}
                        </button>
                      ))}
                      {linkForm.badge && (
                        <button
                          type="button"
                          onClick={() => setLinkForm({ ...linkForm, badge: '' })}
                          className="text-[var(--kz-fg-dim)] hover:text-rose-400 ml-1 cursor-pointer"
                        >
                          清空
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="如：HOT、AD、福利（最多10字）"
                    value={linkForm.badge}
                    maxLength={10}
                    onChange={(e) => setLinkForm({ ...linkForm, badge: e.target.value })}
                    className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-3 py-2 text-xs text-[var(--kz-fg)] outline-none focus:border-[var(--kz-accent)] transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[var(--kz-fg)]">打开方式</label>
                  <AdminSelect<string>
                    value={linkForm.target}
                    onChange={(v) =>
                      setLinkForm({ ...linkForm, target: v === '_self' ? '_self' : '_blank' })
                    }
                    options={[
                      { value: '_blank', label: '🪟 新标签页打开 (_blank，推荐)' },
                      { value: '_self', label: '📄 当前标签页打开 (_self)' },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--kz-border)]">
                <div className="flex items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--kz-fg)]">
                    <input
                      type="checkbox"
                      checked={linkForm.highlight}
                      onChange={(e) => setLinkForm({ ...linkForm, highlight: e.target.checked })}
                      className="accent-[var(--kz-accent)] cursor-pointer"
                    />
                    <span>视觉高亮强调 (品牌主色微光)</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--kz-fg)]">
                    <input
                      type="checkbox"
                      checked={linkForm.enabled}
                      onChange={(e) => setLinkForm({ ...linkForm, enabled: e.target.checked })}
                      className="accent-[var(--kz-accent)] cursor-pointer"
                    />
                    <span>启用此链接</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelLinkForm}
                    className="rounded-xl border border-[var(--kz-border)] px-3 py-1.5 text-xs font-semibold text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={navLinksSaving}
                    onClick={handleSaveLinkForm}
                    className="rounded-xl bg-[var(--kz-accent)] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--kz-accent-hover)] cursor-pointer disabled:opacity-50"
                  >
                    {navLinksSaving ? '保存中…' : editingLinkId ? '保存修改' : '添加并保存'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 外链列表 */}
          {adminNavLinks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--kz-border)] p-8 text-center text-xs text-[var(--kz-fg-muted)]">
              暂未配置任何外链或广告商，点击上方「添加外链广告位」开始添加。
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--kz-border)] overflow-hidden divide-y divide-[var(--kz-border)]">
              {adminNavLinks.map((link, idx) => (
                <div
                  key={link.id}
                  className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 transition-colors ${
                    link.enabled ? 'bg-[var(--kz-bg)]' : 'bg-[var(--kz-bg-soft)] opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* 排序按钮 */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveNavLink(idx, 'up')}
                        className="rounded p-0.5 text-[10px] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] disabled:opacity-20 cursor-pointer"
                        title="上移"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === adminNavLinks.length - 1}
                        onClick={() => handleMoveNavLink(idx, 'down')}
                        className="rounded p-0.5 text-[10px] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] disabled:opacity-20 cursor-pointer"
                        title="下移"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[var(--kz-fg)] truncate">
                          {link.title}
                        </span>
                        {link.badge && (
                          <span className="rounded bg-[var(--kz-accent)]/15 border border-[var(--kz-accent)]/30 text-[var(--kz-accent)] px-1.5 py-0.2 text-[9px] font-bold">
                            {link.badge}
                          </span>
                        )}
                        {link.highlight && (
                          <span className="rounded bg-amber-500/15 text-amber-400 px-1 py-0.2 text-[9px] font-bold">
                            高亮
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--kz-fg-dim)]">
                          {link.target === '_self' ? '当前页打开' : '新标签页'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--kz-fg-dim)] truncate mt-0.5">
                        {link.url}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleNavLink(link.id)}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition-all ${
                        link.enabled
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg-muted)]'
                      }`}
                    >
                      {link.enabled ? '✓ 已启用' : '⚪ 已停用'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditLink(link)}
                      className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-1.5 text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] hover:border-[var(--kz-accent)] transition-all cursor-pointer"
                      title="编辑"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNavLink(link.id)}
                      className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-1.5 text-xs text-rose-400 hover:border-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                      title="删除"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 实时前台导航模拟预览 */}
          <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--kz-fg)]">
              <span>💻 前台导航条实时预览 (Live Preview)</span>
              <span className="text-[10px] text-[var(--kz-fg-dim)]">仅展示已启用的项</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-[var(--kz-border)] bg-[var(--kz-header-bg)] px-3 py-2">
              <span className="font-bold text-xs text-[var(--kz-fg)] pr-2 border-r border-[var(--kz-border)]">
                Animaku
              </span>
              <span className="text-xs text-[var(--kz-fg-muted)]">首页</span>
              <span className="text-xs text-[var(--kz-fg-muted)]">番剧</span>
              <span className="text-xs text-[var(--kz-fg-muted)]">时间表</span>
              {adminNavLinks
                .filter((l) => l.enabled)
                .map((l) => (
                  <span
                    key={l.id}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
                      l.highlight
                        ? 'text-[var(--kz-accent)] bg-[var(--kz-accent-soft)]'
                        : 'text-[var(--kz-fg)] bg-[var(--kz-bg-soft)]'
                    }`}
                  >
                    <span>{l.title}</span>
                    {l.badge && (
                      <span className="rounded bg-[var(--kz-accent)] text-white px-1 py-0.2 text-[9px] font-extrabold leading-none">
                        {l.badge}
                      </span>
                    )}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </AdminCard>

      {/* 9. 全局默认导航栏与外观偏好 */}
      <AdminCard
        id="default-nav"
        icon="🧭"
        title="全局默认导航与外观"
        summary={`${defTheme === 'light' ? '浅色主题' : '深色主题'} · ${defNav.openInNewTab ? '新标签页打开' : '当前页打开'}`}
        isOpen={openSections['default-nav']}
        onToggle={() => toggleSection('default-nav')}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
            设定新访客首次进入站点的默认主题外观与顶部导航栏快捷按钮展示。
          </p>

          <div className="flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--kz-fg)]">
            <span className="font-medium text-[var(--kz-fg)]">界面主题</span>
            <AdminSelect
              value={defTheme}
              onChange={(v) => updateNavPref(v as AppTheme, defNav)}
              options={[
                { value: 'light', label: '☀️ 浅色主题 (Light)' },
                { value: 'dark', label: '🌙 深色主题 (Dark)' },
              ]}
              className="w-44 shrink-0"
              dropdownWidth="w-44"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--kz-border)]/40">
            <AdminToggle
              label="在新标签页打开番剧卡片（保留列表淘番进度）"
              checked={Boolean(defNav.openInNewTab)}
              onChange={(v) => updateNavPref(defTheme, { ...defNav, openInNewTab: v })}
            />
            <AdminToggle
              label="展示导航栏「GitHub 源码」按钮"
              checked={Boolean(defNav.showGitHub)}
              onChange={(v) => updateNavPref(defTheme, { ...defNav, showGitHub: v })}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--kz-border)]/40">
            <button
              type="button"
              onClick={handleResetNav}
              disabled={navSaving}
              className="text-xs text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)] underline cursor-pointer"
            >
              恢复默认
            </button>
            <div className="text-xs">
              {navSaving && <span className="text-[var(--kz-fg-muted)]">保存中…</span>}
              {navMsg && <span className="text-[var(--kz-accent)]">{navMsg}</span>}
            </div>
          </div>
        </div>
      </AdminCard>

      {/* 9. 搜索引擎即时收录 (IndexNow) */}
      <AdminCard
        id="indexnow-ops"
        icon="🔍"
        title="搜索引擎收录推送 (IndexNow)"
        summary="向 Bing / Yandex 即时推送"
        isOpen={openSections['indexnow-ops']}
        onToggle={() => toggleSection('indexnow-ops')}
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
            通过 IndexNow 开放协议，立即向 Bing、Yandex
            等全球搜索引擎提交全站所有静态页与番剧条目 URL，加速新收录与更新。
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTriggerIndexNow}
              disabled={isIndexing}
              className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isIndexing ? '推送中…' : '🚀 立即推送全站 URL'}
            </button>
            {indexMsg && <span className="text-xs">{indexMsg}</span>}
          </div>
        </div>
      </AdminCard>

      {/* 10. 危险操作区 */}
      <AdminCard
        id="danger-zone"
        icon="⚠️"
        title="危险操作区"
        summary="出厂重置"
        isOpen={openSections['danger-zone']}
        onToggle={() => toggleSection('danger-zone')}
      >
        <div className="space-y-3">
          <p className="text-xs text-rose-400 leading-relaxed">
            将服务端保存的站点名称、标语、自定义图标、全站公告及所有全局默认配置彻底清除，恢复为代码出厂默认值。
          </p>
          <button
            type="button"
            onClick={handleResetAll}
            disabled={isResettingAll}
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isResettingAll ? '重置中…' : '全局恢复官方出厂默认 (Reset All)'}
          </button>
        </div>
      </AdminCard>

      {/* 图片裁剪弹窗 */}
      {cropModalData && (
        <IconCropModal
          imageSrc={cropModalData.rawUrl}
          fileName={cropModalData.fileName}
          onConfirm={handleCropComplete}
          onCancel={() => setCropModalData(null)}
        />
      )}

      {/* 公告弹窗实时预览 */}
      {previewAnnouncement && (
        <SiteAnnouncementModal
          announcement={previewAnnouncement}
          onClose={() => setPreviewAnnouncement(null)}
        />
      )}
    </div>
  )
}

function AdminCard({
  id,
  icon,
  title,
  summary,
  isOpen,
  onToggle,
  children,
}: {
  id: string
  icon?: string
  title: string
  summary?: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] shadow-sm transition-all duration-200 hover:border-[var(--kz-accent-ring)]"
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
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {summary && !isOpen && (
            <span className="hidden xs:inline-flex sm:inline-flex items-center rounded-full bg-[var(--kz-bg-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--kz-fg-muted)] border border-[var(--kz-border)]/60 max-w-[14rem] truncate">
              {summary}
            </span>
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
          <div className="pt-3">{children}</div>
        </div>
      )}
    </section>
  )
}

function AdminToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between text-xs sm:text-sm text-[var(--kz-fg)] py-1 cursor-pointer select-none">
      <span className="font-medium pr-2">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-[var(--kz-border)] text-[var(--kz-accent)] cursor-pointer"
      />
    </label>
  )
}

interface AdminSelectOption<T extends string | number> {
  value: T
  label: string
}

interface AdminSelectProps<T extends string | number> {
  id?: string
  value: T
  options: AdminSelectOption<T>[]
  onChange: (val: T) => void
  className?: string
  dropdownWidth?: string
  align?: 'left' | 'right'
}

function AdminSelect<T extends string | number>({
  id,
  value,
  options,
  onChange,
  className = '',
  dropdownWidth,
  align = 'right',
}: AdminSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value) || options[0]

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

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-between gap-2 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-1.5 text-xs sm:text-sm font-medium text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] transition-all cursor-pointer select-none text-left w-full shadow-xs"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate min-w-0">{selectedOption?.label || String(value)}</span>
        <svg
          className={`h-3.5 w-3.5 text-[var(--kz-fg-muted)] shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-[var(--kz-accent)]' : ''
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
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
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-1 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 ${
            dropdownWidth || 'w-full min-w-[9rem]'
          }`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs sm:text-sm transition-colors cursor-pointer select-none ${
                  isSelected
                    ? 'bg-[var(--kz-accent)]/15 font-semibold text-[var(--kz-accent)]'
                    : 'text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[var(--kz-accent)] ml-1"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
