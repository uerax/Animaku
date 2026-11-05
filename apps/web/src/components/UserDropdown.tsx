import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import {
  bangumiOAuthUrl,
  BANGUMI_IMAGE_HOST_BANGUMI,
  BANGUMI_IMAGE_HOST_MIRROR,
} from '@animaku/shared'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { BANGUMI_IMAGE_HOST_OPTIONS } from '../lib/bangumi-image-host'
import { preloadRoute } from '../lib/route-preload'
import { BangumiAvatar } from './BangumiImage'
import { KzSelect, KzSwitch } from './ui'

export function UserDropdown() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  const authed = useAuthStore((s) => s.isAuthenticated())
  const user = useAuthStore((s) => s.getUser())
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const initAuth = useAuthStore((s) => s.initAuth)

  const bangumiImageHost = useSettingsStore((s) => s.bangumiImageHost)
  const setBangumiImageHost = useSettingsStore((s) => s.setBangumiImageHost)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const [tokenInput, setTokenInput] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const isReducedMotion = useReducedMotion()

  // 挂载时尝试初始化一次会话状态（读取现有 Token 缓存）
  useEffect(() => {
    void initAuth()
  }, [initAuth])

  // 路由变化时自动收起菜单并清空错误
  useEffect(() => {
    setOpen(false)
    setLoginError(null)
  }, [location.pathname])

  // 点击外部与 ESC 键自动关闭
  useEffect(() => {
    if (!open) return
    const handleDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDocClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleDocClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const onWarmupCollect = () => {
    preloadRoute('/collect')
  }

  const onWarmupHistory = () => {
    preloadRoute('/history')
  }

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    setTokenInput('')
    setLoginError(null)
  }

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = tokenInput.trim()
    if (!trimmed) {
      setLoginError('请输入 Access Token')
      return
    }
    setLoginLoading(true)
    setLoginError(null)
    try {
      await login(trimmed, 'bangumi')
      setTokenInput('')
    } catch (err: unknown) {
      let msg = 'Token 验证失败，请检查后重试'
      if (err instanceof Error) {
        if (
          err.message.includes('Unauthorized') ||
          err.message.includes('need Login') ||
          err.message.includes('expired')
        ) {
          msg = 'Token 无效或已过期，请检查后重试'
        } else {
          msg = err.message
        }
      }
      setLoginError(msg)
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* 入口按钮 */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="用户中心与功能菜单"
        title={authed ? `用户：${user.nickname}` : '用户模块（未登录）'}
        className={clsx(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-[var(--kz-bg-elevated)] transition-all duration-200 active:scale-95 shadow-sm sm:h-9 sm:w-9 select-none cursor-pointer',
          open
            ? 'border-[var(--kz-accent)] text-[var(--kz-accent)] bg-[var(--kz-bg-hover)] shadow-[0_0_8px_var(--kz-accent-ring)] ring-1 ring-[var(--kz-accent)]'
            : 'border-[var(--kz-border)] text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)]',
        )}
      >
        {authed && user.avatarUrl ? (
          <div className="h-full w-full p-0.5">
            <BangumiAvatar
              src={user.avatarUrl}
              name={user.nickname}
              sizeClass="h-full w-full"
              className="ring-0"
            />
          </div>
        ) : authed ? (
          <span className="text-xs font-bold text-[var(--kz-accent)]">
            {user.nickname.slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <svg
            className="h-[18px] w-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </button>

      {/* 下拉列表框架 */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={isReducedMotion ? false : { opacity: 0, scale: 0.94, y: -6 }}
            animate={isReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={isReducedMotion ? undefined : { opacity: 0, scale: 0.94, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 origin-top-right rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/98 p-1.5 shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/10"
          >
          {/* 用户概览卡片区 */}
          <div className="flex items-center gap-3 rounded-xl bg-[var(--kz-bg-soft)]/70 p-3">
            {authed && user.avatarUrl ? (
              <BangumiAvatar
                src={user.avatarUrl}
                name={user.nickname}
                sizeClass="h-10 w-10"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--kz-bg-hover)] text-[var(--kz-fg-muted)] ring-1 ring-[var(--kz-border)]">
                {authed ? (
                  <span className="font-bold text-sm text-[var(--kz-accent)]">
                    {user.nickname.slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-sm text-[var(--kz-fg)]">
                  {authed ? user.nickname : '访客体验'}
                </span>
                <span
                  className={clsx(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none shrink-0',
                    authed
                      ? 'bg-[var(--kz-accent)]/15 text-[var(--kz-accent)] border border-[var(--kz-accent)]/20'
                      : 'bg-[var(--kz-bg-hover)] text-[var(--kz-fg-muted)] border border-[var(--kz-border)]',
                  )}
                >
                  {authed ? (user.provider === 'bangumi' ? 'Bangumi' : '本地账号') : '未登录'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[var(--kz-fg-muted)]">
                {authed
                  ? `@${user.username || user.id}`
                  : '登录后可跨端同步追番与记录'}
              </p>
            </div>
          </div>

          {/* 菜单项导航区 */}
          <div className="mt-1 space-y-0.5">
            {/* 我的追番 */}
            <Link
              to="/collect"
              role="menuitem"
              onMouseEnter={onWarmupCollect}
              onFocus={onWarmupCollect}
              onTouchStart={onWarmupCollect}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-[var(--kz-fg)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
            >
              <div className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4 text-[var(--kz-fg-muted)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                <span>我的追番</span>
              </div>
              <span className="text-[10px] text-[var(--kz-fg-dim)]">
                {authed ? '在看 · 想看 · 看过' : '未同步'}
              </span>
            </Link>

            {/* 观看历史 */}
            <Link
              to="/history"
              role="menuitem"
              onMouseEnter={onWarmupHistory}
              onFocus={onWarmupHistory}
              onTouchStart={onWarmupHistory}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-[var(--kz-fg)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
            >
              <div className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4 text-[var(--kz-fg-muted)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 15" />
                </svg>
                <span>观看历史</span>
              </div>
              <span className="text-[10px] text-[var(--kz-fg-dim)]">最近播放</span>
            </Link>

            {/* 分割线 */}
            <div className="my-1 border-t border-[var(--kz-border)]/40" />

            {/* 深色模式开关 */}
            <div
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('button')) {
                  setTheme(theme === 'dark' ? 'light' : 'dark')
                }
              }}
              className="flex items-center justify-between rounded-xl px-3 py-1.5 text-xs font-medium text-[var(--kz-fg)] transition-colors hover:bg-[var(--kz-bg-hover)] cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5">
                {theme === 'dark' ? (
                  <svg
                    className="h-4 w-4 text-[var(--kz-accent)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4 text-[var(--kz-fg-muted)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                )}
                <span>深色模式</span>
              </div>
              <KzSwitch
                checked={theme === 'dark'}
                onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                size="sm"
                aria-label="切换深色模式"
              />
            </div>

            {/* 封面图片源 */}
            <div className="flex items-center justify-between rounded-xl px-3 py-1.5 text-xs font-medium text-[var(--kz-fg)] transition-colors hover:bg-[var(--kz-bg-hover)]">
              <div className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4 text-[var(--kz-fg-muted)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>封面图片源</span>
              </div>
              <KzSelect
                value={bangumiImageHost}
                onChange={(val) => setBangumiImageHost(val)}
                options={BANGUMI_IMAGE_HOST_OPTIONS.map((opt) => ({
                  value: opt.host,
                  label:
                    opt.host === BANGUMI_IMAGE_HOST_MIRROR
                      ? '代理'
                      : opt.host === BANGUMI_IMAGE_HOST_BANGUMI
                        ? '官方'
                        : opt.label,
                }))}
                size="sm"
                align="right"
                className="w-20 shrink-0"
                dropdownWidth="w-20"
                aria-label="选择封面图片源"
              />
            </div>
          </div>

          {/* 底部功能/状态区 */}
          <div className="mt-1 border-t border-[var(--kz-border)] pt-1.5">
            {authed ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors text-left select-none cursor-pointer"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>退出登录 / 解除绑定</span>
              </button>
            ) : (
              <form onSubmit={handleLogin} className="space-y-1.5 p-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-semibold text-[var(--kz-fg-muted)]">
                    绑定 Bangumi 账号
                  </span>
                  <a
                    href={bangumiOAuthUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[10px] text-[var(--kz-accent)] hover:underline"
                    title="在 Bangumi 官网获取个人 Access Token"
                  >
                    <span>获取 Token</span>
                    <svg
                      className="h-2.5 w-2.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    data-clarity-mask="True"
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value)
                      if (loginError) setLoginError(null)
                    }}
                    placeholder="粘贴 Access Token…"
                    disabled={loginLoading}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg)] px-2.5 py-1.5 text-xs text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] outline-none focus:border-[var(--kz-accent)] focus:ring-1 focus:ring-[var(--kz-accent)] transition-all"
                  />
                  <button
                    type="submit"
                    disabled={loginLoading || !tokenInput.trim()}
                    className={clsx(
                      'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all select-none',
                      loginLoading || !tokenInput.trim()
                        ? 'bg-[var(--kz-accent)]/50 cursor-not-allowed opacity-60'
                        : 'bg-[var(--kz-accent)] hover:bg-[var(--kz-accent-hover)] cursor-pointer active:scale-95',
                    )}
                  >
                    {loginLoading ? '验证中…' : '绑定'}
                  </button>
                </div>

                {loginError && (
                  <p className="px-0.5 text-[10px] text-rose-500 leading-tight">
                    {loginError}
                  </p>
                )}
              </form>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
