import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PluginCatalogItem, PluginMeta } from '@animaku/shared'
import {
  catalogItemStatus,
  comparePluginOrder,
  PLAYER_SPEEDS,
  bangumiOAuthUrl,
  isAnxRule,
} from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import { pluginApi } from '../lib/plugin-api'
import { validatePluginLocal } from '../lib/plugin-validate'
import { pluginNeedsFullMediaProxy } from '../lib/plugin-capabilities'
import {
  fetchServerHealth,
  mediaFullProxyEnabled,
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
import { EMPTY_ARRAY, FALLBACK_DANMAKU, FALLBACK_PLAYER } from '../lib/stable'
import {
  buildBangumiOpedContent,
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
  isBlocked: (plugin: PluginMeta) => boolean,
): PluginMeta[] {
  if (!order.length) {
    return [...plugins].sort((a, b) => {
      const blocked = Number(isBlocked(a)) - Number(isBlocked(b))
      return blocked !== 0 ? blocked : comparePluginOrder(a, b)
    })
  }
  const rank = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    rank.set(order[i].toLowerCase(), i)
  }
  return [...plugins].sort((a, b) => {
    const blocked = Number(isBlocked(a)) - Number(isBlocked(b))
    if (blocked !== 0) return blocked
    const ra = rank.get(a.name.toLowerCase()) ?? order.length
    const rb = rank.get(b.name.toLowerCase()) ?? order.length
    if (ra !== rb) return ra - rb
    return comparePluginOrder(a, b)
  })
}

type CatalogSort = 'lastUpdate' | 'name'

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
  const proxyToken = useSettingsStore((s) => s.proxyToken)
  const setProxyToken = useSettingsStore((s) => s.setProxyToken)

  const plugins = usePluginStore((s) =>
    Array.isArray(s.plugins) ? s.plugins : EMPTY_ARRAY,
  )
  const importRule = usePluginStore((s) => s.importRule)
  const removePlugin = usePluginStore((s) => s.removePlugin)
  const togglePlugin = usePluginStore((s) => s.togglePlugin)
  const setPluginAdBlocker = usePluginStore((s) => s.setPluginAdBlocker)
  const setPluginProxy = usePluginStore((s) => s.setPluginProxy)
  const ensureDefaults = usePluginStore((s) => s.ensureDefaults)
  const resetToDefaults = usePluginStore((s) => s.resetToDefaults)
  const pluginOrder = usePluginStore((s) =>
    Array.isArray(s.pluginOrder) ? s.pluginOrder : [],
  )
  const setPluginOrder = usePluginStore((s) => s.setPluginOrder)

  const [tokenInput, setTokenInput] = useState(bangumiToken)
  const [tokenMsg, setTokenMsg] = useState('')
  const [pluginMsg, setPluginMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [useMirror, setUseMirror] = useState(false)
  const [catalogSort, setCatalogSort] = useState<CatalogSort>('lastUpdate')
  const [catalogFilter, setCatalogFilter] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)

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
  const proxyTokenRequired = Boolean((health.data as ServerHealth | undefined)?.proxyTokenRequired)
  const isProxyUnlocked = !proxyTokenRequired || Boolean(proxyToken?.trim())
  const mediaFullProxy = mediaFullProxyEnabled(health.data as ServerHealth | undefined)
  const canUseFullProxySource = mediaFullProxy && Boolean(player.serverProxy) && isProxyUnlocked

  // Proxy unlock state
  const [showUnlockInput, setShowUnlockInput] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [showPasswordText, setShowPasswordText] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [unlockSuccess, setUnlockSuccess] = useState(false)
  const unlockInputRef = useRef<HTMLInputElement>(null)

  // OP/ED 标记助手本地数据
  const opedStore = useCustomOpedStore()
  const opedSubjects = opedStore.subjects
  const [opedToast, setOpedToast] = useState('')

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

  async function handleVerifyUnlock() {
    if (!unlockPassword.trim() || isVerifying) return
    setIsVerifying(true)
    setVerifyError('')
    try {
      const res = await fetch('/api/proxy/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: unlockPassword.trim() }),
      })
      const data = (await res.json()) as { ok: boolean; message?: string }
      if (res.ok && data.ok) {
        setUnlockSuccess(true)
        setProxyToken(unlockPassword.trim())
        setPlayer({ serverProxy: true })
        setTimeout(() => {
          setShowUnlockInput(false)
          setUnlockPassword('')
          setUnlockSuccess(false)
        }, 400)
      } else {
        setVerifyError(data.message || '口令错误，请检查 .env 中的 PROXY_TOKEN')
        setIsShaking(true)
        setTimeout(() => setIsShaking(false), 450)
        unlockInputRef.current?.select()
      }
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : '验证失败，请检查网络')
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 450)
    } finally {
      setIsVerifying(false)
    }
  }

  function handleRelockProxy() {
    setProxyToken('')
    setPlayer({ serverProxy: false })
    setShowUnlockInput(false)
    setVerifyError('')
  }
  /** User order within available/blocked groups; blocked sources stay at the end. */
  const sortedPlugins = useMemo(
    () =>
      sortPluginsByOrder(
        plugins,
        pluginOrder,
        (p) => pluginNeedsFullMediaProxy(p) && !canUseFullProxySource,
      ),
    [plugins, pluginOrder, canUseFullProxySource],
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

  const [activeShop, setActiveShop] = useState<'anibaka' | 'kazumi'>('anibaka')

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
      'rule-catalog': false,
      'player-settings': true,
      'danmaku-settings': false,
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
        'rule-catalog',
        'player-settings',
        'danmaku-settings',
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

  const catalog = useQuery({
    queryKey: ['plugin-catalog', activeShop, useMirror],
    queryFn: ({ signal }) => pluginApi.catalog(activeShop, useMirror, { signal }),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const installedByName = useMemo(() => {
    const map = new Map<string, PluginMeta>()
    for (const p of plugins) {
      map.set(p.name.toLowerCase(), p)
    }
    return map
  }, [plugins])

  const catalogItems = useMemo(() => {
    const items = [...(catalog.data?.data ?? [])]
    if (catalogSort === 'lastUpdate') {
      items.sort((a, b) => b.lastUpdate - a.lastUpdate)
    } else {
      items.sort((a, b) =>
        (a.title || a.name).toLowerCase().localeCompare((b.title || b.name).toLowerCase()),
      )
    }
    const q = catalogFilter.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.title && i.title.toLowerCase().includes(q)) ||
        (i.author && i.author.toLowerCase().includes(q)) ||
        (i.intro && i.intro.toLowerCase().includes(q)) ||
        (i.labels && i.labels.some((l) => l.toLowerCase().includes(q))),
    )
  }, [catalog.data?.data, catalogSort, catalogFilter])

  async function saveToken() {
    setBangumiToken(tokenInput.trim())
    setTokenMsg('已保存')
    setTimeout(() => setTokenMsg(''), 2000)
  }

  async function onImportFile(file: File) {
    setPluginMsg('')
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const list = Array.isArray(json) ? json : [json]
      let n = 0
      for (const item of list) {
        // Local parse only — rule JSON never uploaded for validation
        const validated = validatePluginLocal(item)
        if (!validated.ok || !validated.rule) {
          throw new Error(validated.message || '规则无效')
        }
        importRule(validated.rule, { source: 'import' })
        n++
      }
      setPluginMsg(`成功导入 ${n} 条规则（仅保存在本机）`)
    } catch (e) {
      setPluginMsg(e instanceof Error ? e.message : '导入失败')
    }
  }

  async function installFromCatalog(item: PluginCatalogItem) {
    setInstalling(item.name)
    setPluginMsg('')
    try {
      const shop = item.shop || activeShop
      const res = await pluginApi.download(item.name, shop, useMirror)
      const validated = validatePluginLocal(res.data)
      if (!validated.ok || !validated.rule) {
        throw new Error(validated.message || '规则校验失败')
      }
      importRule(validated.rule, { source: 'catalog' })
      setPluginMsg(`已安装 ${item.title || item.name} v${validated.rule.version}`)
    } catch (e) {
      setPluginMsg(
        e instanceof Error ? e.message : `安装 ${item.title || item.name} 失败`,
      )
    } finally {
      setInstalling(null)
    }
  }

  async function updateAllFromCatalog() {
    if (!catalog.data?.data?.length) return
    setBatchBusy(true)
    setPluginMsg('')
    let updated = 0
    let failed = 0
    try {
      for (const item of catalog.data.data) {
        const local = installedByName.get(item.name.toLowerCase())
        const status = catalogItemStatus(local, item)
        if (status !== 'update') continue
        try {
          const shop = item.shop || activeShop
          const res = await pluginApi.download(item.name, shop, useMirror)
          const validated = validatePluginLocal(res.data)
          if (!validated.ok || !validated.rule) {
            failed++
            continue
          }
          importRule(validated.rule, { source: 'catalog' })
          updated++
        } catch {
          failed++
        }
      }
      setPluginMsg(
        updated
          ? `已更新 ${updated} 条${failed ? `，失败 ${failed}` : ''}`
          : failed
            ? `更新失败 ${failed} 条`
            : '没有可更新的规则',
      )
    } finally {
      setBatchBusy(false)
    }
  }

  function formatLastUpdate(ms: number) {
    if (!ms) return ''
    try {
      return new Date(ms).toLocaleString()
    } catch {
      return String(ms)
    }
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
        icon={<span className="h-2.5 w-2.5 rounded-full bg-[var(--kz-accent)] inline-block" />}
        title="服务状态"
        summary={`v${b.version} · ${health.data?.ok ? 'API 正常' : health.isLoading ? '检测中' : '未连接'}`}
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
          <div className="flex items-center justify-between pt-1.5">
            <span>媒体代理</span>
            <span className="font-semibold text-[var(--kz-fg)]">
              {health.isLoading
                ? '检测中…'
                : health.data?.ok
                  ? mediaFullProxy
                    ? '允许全量（MEDIA_FULL_PROXY=1）'
                    : '仅 m3u8（MEDIA_FULL_PROXY=0）'
                  : '未知'}
            </span>
          </div>
          {!health.isLoading && health.data?.ok && (
            <div className="flex items-center justify-between pt-1.5">
              <span>开放代理访问</span>
              <span className="font-semibold text-[var(--kz-fg)]">
                {(health.data as ServerHealth).publicProxy
                  ? '公网可调'
                  : '仅本机/局域网'}
              </span>
            </div>
          )}
        </div>
        <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)] pt-1">
          以上配置由服务器 <code className="text-[var(--kz-fg-muted)]">.env</code>{' '}
          决定。公网部署建议保持仅 m3u8，避免被当作出站带宽跳板。
        </p>
      </CollapsibleSection>

      {/* 2. 封面图片源 */}
      <CollapsibleSection
        id="image-host"
        icon="🖼️"
        title="封面图片源"
        summary={bangumiImageHost.includes('mirror') || bangumiImageHost.includes('proxy') ? '代理优化' : '官方直连'}
        isOpen={Boolean(openSections['image-host'])}
        onToggle={() => toggleSection('image-host')}
      >
        <p className="text-xs sm:text-sm text-[var(--kz-fg-muted)]">
          番剧海报封面与角色图的访问 CDN。此处选择仅保存在本机浏览器。
        </p>
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
        <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
          切换后立即生效；新域名的图片按需重新下载并建立浏览器本地缓存。
        </p>
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
                  href="https://github.com/uerax/bangumi-oped/upload/data"
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
        <p className="text-xs sm:text-sm text-[var(--kz-fg-muted)] leading-relaxed">
          列表首位为播放时的默认源。可拖拽或按 ▲▼ 调整顺序。
          导入 JSON 仅在本机校验与保存。仓库：{' '}
          <a
            href="https://github.com/Predidit/KazumiRules"
            className="kz-link"
            target="_blank"
            rel="noreferrer"
          >
            KazumiRules
          </a>
          。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl bg-[var(--kz-fg)] px-3.5 py-1.5 text-xs sm:text-sm font-medium text-[var(--kz-bg)] hover:opacity-90 cursor-pointer shadow-sm"
          >
            导入 JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImportFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  '将清空当前规则并恢复为内置默认（xifan-next / cycani / anime1 / libvio / mxdm / omofun / xifan），确定？',
                )
              ) {
                resetToDefaults()
                setPluginMsg('已恢复默认规则')
              }
            }}
            className="rounded-xl border border-[var(--kz-border)] px-3.5 py-1.5 text-xs sm:text-sm text-[var(--kz-fg)] hover:bg-[var(--kz-bg-soft)] cursor-pointer"
          >
            恢复默认
          </button>
        </div>
        {pluginMsg && <div className="text-sm text-emerald-400">{pluginMsg}</div>}
        {!plugins.length && (
          <div className="text-sm text-[var(--kz-fg-muted)]">暂无插件，可恢复默认或从仓库安装</div>
        )}
        {plugins.length > 1 && (
          <p className="text-xs text-[var(--kz-fg-dim)]">
            拖拽手柄或按 ▲▼ 调整顺序，首位为播放默认源
          </p>
        )}
        <ul className="space-y-2">
          {sortedPlugins.map((p, idx) => {
            const needsFull = pluginNeedsFullMediaProxy(p)
            const blockedByServer = needsFull && !canUseFullProxySource
            const effectivelyOn = p.enabled !== false && !blockedByServer
            const proxyLocked = needsFull && canUseFullProxySource
            const proxyDisabled = !canUseFullProxySource || !player.serverProxy
            const proxyChecked = p.proxy ?? false
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
                  // 延迟一帧更新状态，确保浏览器顺利捕获原生 Drag Image，避免因 DOM 样式重排中断拖拽
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
                    return // 鼠标在卡片内部子元素间移动时忽略，避免频繁闪烁与重渲染
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
                className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 select-none transition-colors duration-150 ${
                  isDragging
                    ? 'opacity-40 border-dashed border-[var(--kz-accent)] bg-[var(--kz-bg-soft)]'
                    : isDragOver
                      ? 'border-[var(--kz-accent)] ring-2 ring-[var(--kz-accent)]/40 bg-[var(--kz-accent)]/5 shadow-sm'
                      : 'border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] hover:border-[var(--kz-border-hover)]'
                } ${blockedByServer ? 'opacity-70' : ''}`}
              >
                {/* Row 1: plugin info + order buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Drag handle / order buttons - touch-none 确保移动端按住手柄时不触发页面滚动 */}
                  <div
                    className="mr-0.5 flex flex-col items-center gap-0.5 text-[var(--kz-fg-dim)] cursor-grab active:cursor-grabbing p-1.5 sm:p-0.5 rounded hover:bg-[var(--kz-bg-soft)] active:bg-[var(--kz-bg-soft)] select-none touch-none"
                    title="拖拽手柄排序或按 ▲▼ 微调"
                    draggable={false}
                    onDragStart={(e) => e.stopPropagation()}
                    onTouchStart={() => handleTouchStart(p.name)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchCancel}
                  >
                    <button
                      type="button"
                      disabled={isFirst}
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        movePlugin(p.name, -1)
                      }}
                      title="上移（首位为默认源）"
                      className="text-[10px] leading-none disabled:opacity-20 hover:text-[var(--kz-accent)] cursor-pointer p-0.5"
                      aria-label="上移"
                    >
                      ▲
                    </button>
                    <span className="text-[11px] leading-none text-[var(--kz-fg-dim)] select-none py-0.5 tracking-tighter" aria-hidden>
                      ⋮⋮
                    </span>
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
                      className="text-[10px] leading-none disabled:opacity-20 hover:text-[var(--kz-accent)] cursor-pointer p-0.5"
                      aria-label="下移"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {p.name}{' '}
                      <span className="text-xs text-[var(--kz-fg-muted)]">
                        v{p.version || '?'}
                      </span>
                      {isFirst && (
                        <span className="ml-1 text-xs text-[var(--kz-accent)]">
                          默认源
                        </span>
                      )}
                      {p.source && (
                        <span className="ml-1 text-xs text-[var(--kz-fg-dim)]">
                          {p.source === 'builtin'
                            ? '内置'
                            : p.source === 'catalog'
                              ? '仓库'
                              : '导入'}
                        </span>
                      )}
                      {isAnxRule(p) ? (
                        <span
                          className="ml-1.5 inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                          title="由 AniBaka 流水线解释器驱动"
                        >
                          AniBaka
                        </span>
                      ) : ['cycani', 'tvtfun', 'xifan-next', 'moonci', 'anime1', 'omofun'].includes(
                          p.name.toLowerCase(),
                        ) ? (
                        <span
                          className="ml-1.5 inline-flex items-center rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400"
                          title="由 TypeScript 专有适配器驱动"
                        >
                          专有直连
                        </span>
                      ) : (
                        <span
                          className="ml-1.5 inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                          title="传统 Kazumi 规则驱动"
                        >
                          Kazumi
                        </span>
                      )}
                      {blockedByServer && (
                        <span
                          className="ml-2 text-xs text-amber-400"
                          title="需要 MEDIA_FULL_PROXY=1 代拉 Cookie mp4"
                        >
                          需全量代理
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-[var(--kz-fg-muted)]">
                      {p.baseURL}
                    </div>
                    {blockedByServer && (
                      <div className="mt-0.5 text-xs text-amber-400/90">
                        服务器仅代理 m3u8，已禁用此源（部署方设置 MEDIA_FULL_PROXY=1
                        后可用）
                      </div>
                    )}
                  </div>
                </div>
                {/* Row 2: options + actions */}
                <div
                  className="flex flex-wrap items-center gap-3 lg:flex-1 lg:justify-end"
                  draggable={false}
                  onDragStart={(e) => e.stopPropagation()}
                >
                  <label
                    className={`flex items-center gap-1 text-xs text-[var(--kz-fg-muted)] cursor-pointer ${
                      blockedByServer ? 'cursor-not-allowed' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={effectivelyOn}
                      disabled={blockedByServer}
                      onChange={() => togglePlugin(p.id)}
                    />
                    启用
                  </label>
                  <label
                    className="flex items-center gap-1 text-xs text-[var(--kz-fg-muted)] cursor-pointer"
                    title="HLS 分片广告过滤（#EXT-X-DISCONTINUITY 短段）。播放列表经服务器过滤；无 cookie 时分片可直连 CDN。"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(p.adBlocker)}
                      onChange={(e) =>
                        setPluginAdBlocker(p.id, e.target.checked)
                      }
                    />
                    广告过滤
                  </label>
                  <label
                    className={`flex items-center gap-1 text-xs text-[var(--kz-fg-muted)] ${
                      proxyDisabled || proxyLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    title={
                      proxyLocked
                        ? '此源需要服务器代理才能播放，不可关闭'
                        : proxyDisabled
                          ? '需开启上方「服务器代理」'
                          : '媒体经服务器代理'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={proxyChecked}
                      disabled={proxyDisabled || proxyLocked}
                      onChange={(e) =>
                        setPluginProxy(p.id, e.target.checked)
                      }
                    />
                    代理
                  </label>
                  {!isBuiltinPlugin(p) && (
                    <button
                      type="button"
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onClick={() => removePlugin(p.id)}
                      className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-[var(--kz-bg-soft)] cursor-pointer"
                    >
                      删除
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </CollapsibleSection>

      {/* 6. 规则仓库 */}
      <CollapsibleSection
        id="rule-catalog"
        icon="🏪"
        title="规则仓库"
        summary={activeShop === 'anibaka' ? '⭐ AniBaka 规则库 (34+)' : '📦 Kazumi 规则库 (遗留)'}
        isOpen={Boolean(openSections['rule-catalog'])}
        onToggle={() => toggleSection('rule-catalog')}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <label className="flex items-center gap-1.5 text-[var(--kz-fg-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={useMirror}
                onChange={(e) => setUseMirror(e.target.checked)}
              />
              使用镜像
            </label>
            <button
              type="button"
              onClick={() => void catalog.refetch()}
              disabled={catalog.isFetching}
              className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1 text-xs text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] disabled:opacity-50 cursor-pointer"
            >
              {catalog.isFetching ? '刷新中…' : '刷新目录'}
            </button>
            <button
              type="button"
              onClick={() => void updateAllFromCatalog()}
              disabled={batchBusy || catalog.isLoading || !catalog.data}
              className="rounded-lg bg-[var(--kz-accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--kz-accent-hover)] disabled:opacity-50 cursor-pointer"
            >
              {batchBusy ? '更新中…' : '更新全部'}
            </button>
          </div>
        </div>

        {/* Shop Switcher Tabs */}
        <div className="flex rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveShop('anibaka')}
            className={`flex-1 rounded-lg py-1.5 px-2 text-xs font-medium transition-all text-center ${
              activeShop === 'anibaka'
                ? 'bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] shadow-sm'
                : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]'
            }`}
          >
            <span>⭐ AniBaka 规则库</span>
            <span className="hidden sm:inline text-[10px] text-emerald-400 font-semibold ml-1">(推荐 · 34+现代源)</span>
            <span className="sm:hidden ml-1 rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[9px] text-emerald-400 font-semibold">34+</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveShop('kazumi')}
            className={`flex-1 rounded-lg py-1.5 px-2 text-xs font-medium transition-all text-center ${
              activeShop === 'kazumi'
                ? 'bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] shadow-sm'
                : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]'
            }`}
          >
            <span>📦 Kazumi 规则库</span>
            <span className="hidden sm:inline text-[10px] text-[var(--kz-fg-dim)] ml-1">(遗留源)</span>
            <span className="sm:hidden ml-1 text-[9px] text-[var(--kz-fg-dim)]">旧</span>
          </button>
        </div>

        <p className="text-xs text-[var(--kz-fg-muted)] leading-relaxed">
          {activeShop === 'anibaka' ? (
            <>
              从{' '}
              <a
                href="https://github.com/AniBakaBaka/AniBakaRule"
                className="kz-link"
                target="_blank"
                rel="noreferrer"
              >
                AniBakaBaka/AniBakaRule
              </a>{' '}
              选择流水线规则安装。支持多步请求、解密与自动过盾。
            </>
          ) : (
            <>
              从{' '}
              <a
                href="https://github.com/Predidit/KazumiRules"
                className="kz-link"
                target="_blank"
                rel="noreferrer"
              >
                Predidit/KazumiRules
              </a>{' '}
              选择传统规则安装（部分老规则可能失效）。
            </>
          )}
        </p>

        <div className="flex flex-wrap gap-2">
          <input
            value={catalogFilter}
            onChange={(e) => setCatalogFilter(e.target.value)}
            placeholder="筛选规则名称、标签或简介…"
            className="min-w-[9rem] flex-1 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-1.5 text-xs sm:text-sm"
          />
          <select
            value={catalogSort}
            onChange={(e) => setCatalogSort(e.target.value as CatalogSort)}
            className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1.5 text-xs sm:text-sm cursor-pointer"
          >
            <option value="name">按名称排序</option>
            <option value="lastUpdate">按更新时间</option>
          </select>
        </div>

        {catalog.isError && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            {(catalog.error as Error).message || '无法访问规则仓库'}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2 py-1 text-xs text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)]"
                onClick={() => setUseMirror((v) => !v)}
              >
                {useMirror ? '改用直连' : '改用镜像'}
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-900/50 px-2 py-1 text-xs text-red-200 hover:bg-red-900"
                onClick={() => void catalog.refetch()}
              >
                重试
              </button>
            </div>
          </div>
        )}

        {catalog.isLoading && (
          <div className="text-sm text-[var(--kz-fg-muted)]">加载目录中…</div>
        )}

        {catalog.data && (
          <div className="truncate text-xs text-[var(--kz-fg-dim)]">
            来源：{catalog.data.source}
          </div>
        )}

        <ul className="max-h-[28rem] space-y-2.5 overflow-y-auto pr-1">
          {catalogItems.map((item) => {
            const local = installedByName.get(item.name.toLowerCase())
            const status = catalogItemStatus(local, item)
            const busy = installing === item.name
            const label =
              status === 'install'
                ? '安装'
                : status === 'update'
                  ? '更新'
                  : '已安装'
            return (
              <li
                key={`${item.shop || activeShop}-${item.name}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-3 sm:p-3.5 transition-all hover:border-[var(--kz-accent-ring)]"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
                  {item.badge ? (
                    <img
                      src={item.badge}
                      alt=""
                      className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded-lg object-contain bg-black/10 p-0.5 mt-0.5"
                      onError={(e) => {
                        ;(e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-semibold text-xs sm:text-sm text-[var(--kz-fg)]">
                        {item.title || item.name}
                      </span>
                      {item.title && item.title !== item.name && (
                        <span className="font-mono text-[11px] text-[var(--kz-fg-dim)]">
                          ({item.name})
                        </span>
                      )}
                      <span className="rounded border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-1.5 py-0.2 text-[9px] sm:text-[10px] text-[var(--kz-fg-muted)]">
                        v{item.version}
                      </span>
                      {item.labels && item.labels.map((lbl) => (
                        <span
                          key={lbl}
                          className={`rounded px-1.5 py-0.2 text-[9px] sm:text-[10px] font-medium border ${
                            lbl.includes('无广告') || lbl.includes('超清')
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : lbl.includes('少广告') || lbl.includes('高清')
                                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                                : 'bg-[var(--kz-bg-elevated)] border-[var(--kz-border)] text-[var(--kz-fg-muted)]'
                          }`}
                        >
                          {lbl}
                        </span>
                      ))}
                      {item.antiCrawlerEnabled && (
                        <span className="rounded bg-amber-950 px-1.5 py-0.2 text-[9px] sm:text-[10px] text-amber-300">
                          captcha
                        </span>
                      )}
                    </div>
                    {item.intro && (
                      <div className="line-clamp-2 text-xs text-[var(--kz-fg-muted)] leading-relaxed">
                        {item.intro}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-[var(--kz-fg-dim)]">
                      {item.site && (
                        <a
                          href={item.site}
                          target="_blank"
                          rel="noreferrer"
                          className="kz-link truncate max-w-[12rem] sm:max-w-[16rem]"
                          title={item.site}
                        >
                          {item.site}
                        </a>
                      )}
                      {item.author && <span>作者：{item.author}</span>}
                      {item.lastUpdate > 0 && (
                        <span>更新：{formatLastUpdate(item.lastUpdate)}</span>
                      )}
                      {local && (
                        <span className="text-emerald-400/90 font-medium">
                          · 本地已装 v{local.version}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={status === 'installed' || busy}
                    onClick={() => void installFromCatalog(item)}
                    className="rounded-xl bg-[var(--kz-fg)] px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-[var(--kz-bg)] shadow-sm hover:opacity-90 disabled:cursor-default disabled:border disabled:border-[var(--kz-border)] disabled:bg-[var(--kz-bg-elevated)] disabled:text-[var(--kz-fg-muted)] cursor-pointer"
                  >
                    {busy ? '安装中…' : label}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </CollapsibleSection>

      {/* 7. 播放器偏好 */}
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{proxyTokenRequired ? (isProxyUnlocked ? '🔓' : '🔒') : '⚡'}</span>
              <span className="text-xs sm:text-sm font-medium text-[var(--kz-fg)]">服务器代理</span>
              {proxyTokenRequired && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    isProxyUnlocked
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {isProxyUnlocked ? '已解锁' : '需口令'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {proxyTokenRequired && isProxyUnlocked && (
                <button
                  type="button"
                  onClick={handleRelockProxy}
                  className="text-xs text-[var(--kz-fg-dim)] hover:text-amber-400 transition-colors underline decoration-dotted cursor-pointer"
                  title="清空当前保存的口令并重新上锁"
                >
                  🔒 锁定
                </button>
              )}
              <input
                type="checkbox"
                disabled={!mediaFullProxy}
                checked={mediaFullProxy && Boolean(player.serverProxy) && isProxyUnlocked}
                onChange={(e) => {
                  if (proxyTokenRequired && !isProxyUnlocked) {
                    setShowUnlockInput(true)
                    setTimeout(() => unlockInputRef.current?.focus(), 50)
                    return
                  }
                  setPlayer({ serverProxy: e.target.checked })
                }}
                className="h-4 w-4 rounded accent-[var(--kz-accent)] cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Inline smooth expanding password card when locked */}
          {proxyTokenRequired && showUnlockInput && !isProxyUnlocked && (
            <div
              className={`rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/80 backdrop-blur-md p-3.5 sm:p-4 space-y-3 shadow-lg transition-all duration-200 ${
                isShaking ? 'animate-kz-shake ring-2 ring-rose-500/50' : ''
              } ${unlockSuccess ? 'ring-2 ring-emerald-500/60 bg-emerald-950/20' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--kz-fg)]">
                  <span>🔑</span>
                  <span>管理员代理口令 (PROXY_TOKEN)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnlockInput(false)
                    setVerifyError('')
                  }}
                  className="text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] px-1.5 py-0.5 rounded hover:bg-[var(--kz-bg)] cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    ref={unlockInputRef}
                    type={showPasswordText ? 'text' : 'password'}
                    value={unlockPassword}
                    autoFocus
                    placeholder="输入 .env 中配置的口令…"
                    onChange={(e) => {
                      setUnlockPassword(e.target.value)
                      if (verifyError) setVerifyError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleVerifyUnlock()
                    }}
                    className="w-full rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-3 py-2 pr-9 text-xs sm:text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none ring-[var(--kz-accent)] focus:ring-2"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPasswordText((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] select-none"
                    title={showPasswordText ? '隐藏密码' : '显示密码'}
                  >
                    {showPasswordText ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!unlockPassword.trim() || isVerifying}
                  onClick={() => void handleVerifyUnlock()}
                  className="rounded-xl bg-[var(--kz-accent)] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-[var(--kz-accent-hover)] disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isVerifying ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>验证中…</span>
                    </>
                  ) : unlockSuccess ? (
                    <span>✓ 验证成功</span>
                  ) : (
                    <span>🔓 验证并解锁</span>
                  )}
                </button>
              </div>
              {verifyError && (
                <p className="text-xs text-rose-400 flex items-center gap-1 font-medium">
                  <span>✖</span>
                  <span>{verifyError}</span>
                </p>
              )}
              <p className="text-[10px] sm:text-[11px] text-[var(--kz-fg-dim)]">
                💡 口令保存在当前浏览器中，验证成功后刷新页面无需重新输入。
              </p>
            </div>
          )}

          <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
            {mediaFullProxy ? (
              <>
                总开关。关闭后下方所有源全部直连 CDN。开启后可单独为每个源设置是否走媒体代理。
              </>
            ) : (
              <>
                服务器 <code className="text-[var(--kz-fg-muted)]">MEDIA_FULL_PROXY=0</code>
                （默认）：最多代理 m3u8 列表，分片由浏览器直连 CDN。如需 Anime1 等源请在 .env 开启 MEDIA_FULL_PROXY=1。
              </>
            )}
          </p>
        </div>
        <Toggle
          label="强制广告过滤"
          checked={Boolean(player.forceAdBlocker)}
          onChange={(forceAdBlocker) => setPlayer({ forceAdBlocker })}
        />
        <p className="text-[11px] sm:text-xs text-[var(--kz-fg-dim)]">
          开启后所有规则播放 m3u8 时强制过滤短广告分片。
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
      </CollapsibleSection>

      {/* 8. 弹幕默认设置 */}
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
