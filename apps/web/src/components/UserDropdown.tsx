import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import {
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
  const logout = useAuthStore((s) => s.logout)
  const initAuth = useAuthStore((s) => s.initAuth)
  const openLoginModal = useAuthStore((s) => s.openLoginModal)

  const bangumiImageHost = useSettingsStore((s) => s.bangumiImageHost)
  const setBangumiImageHost = useSettingsStore((s) => s.setBangumiImageHost)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const isReducedMotion = useReducedMotion()

  // 挂载时尝试初始化一次会话状态（读取现有 Token 缓存）
  useEffect(() => {
    void initAuth()
  }, [initAuth])

  // 路由变化时自动收起菜单
  useEffect(() => {
    setOpen(false)
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

  const onWarmupTimeline = () => {
    preloadRoute('/timeline')
  }

  const handleLogout = async () => {
    setOpen(false)
    await logout()
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
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 origin-top-right rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/98 p-1.5 shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/10"
          >
          {/* 用户概览卡片区 */}
          <div className="flex items-center gap-2.5 rounded-xl bg-[var(--kz-bg-soft)]/70 p-2.5">
            {authed && user.avatarUrl ? (
              <BangumiAvatar
                src={user.avatarUrl}
                name={user.nickname}
                sizeClass="h-9 w-9"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--kz-bg-hover)] text-[var(--kz-fg-muted)] ring-1 ring-[var(--kz-border)]">
                {authed ? (
                  <span className="font-bold text-xs text-[var(--kz-accent)]">
                    {user.nickname.slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <svg
                    className="h-4.5 w-4.5"
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
                <span className="truncate font-semibold text-xs text-[var(--kz-fg)]">
                  {authed ? user.nickname : '访客体验'}
                </span>
                <span
                  className={clsx(
                    'rounded-md px-1.5 py-0.5 text-[9px] font-medium leading-none shrink-0',
                    authed
                      ? 'bg-[var(--kz-accent)]/15 text-[var(--kz-accent)] border border-[var(--kz-accent)]/20'
                      : 'bg-[var(--kz-bg-hover)] text-[var(--kz-fg-muted)] border border-[var(--kz-border)]',
                  )}
                >
                  {authed ? (user.provider === 'bangumi' ? 'Bangumi' : '本地账号') : '未登录'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10.5px] text-[var(--kz-fg-muted)]">
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

            {/* 每日时间表 */}
            <Link
              to="/timeline"
              role="menuitem"
              onMouseEnter={onWarmupTimeline}
              onFocus={onWarmupTimeline}
              onTouchStart={onWarmupTimeline}
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
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>每日时间表</span>
              </div>
              <span className="text-[10px] text-[var(--kz-fg-dim)]">追番放送</span>
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
          <div className="mt-1 border-t border-[var(--kz-border)] pt-1">
            {authed ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors select-none cursor-pointer"
              >
                <svg
                  className="h-3.5 w-3.5"
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
                <span>退出</span>
              </button>
            ) : (
              <div className="p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    openLoginModal()
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--kz-accent)] px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--kz-accent-hover)] transition-all cursor-pointer active:scale-95"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  <span>登录</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
