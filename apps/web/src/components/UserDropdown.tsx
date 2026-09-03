import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { isGuestUser } from '@animaku/shared'
import { useAuthStore } from '../stores/auth'
import { preloadRoute } from '../lib/route-preload'
import { BangumiAvatar } from './BangumiImage'

export function UserDropdown() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const authed = useAuthStore((s) => s.isAuthenticated())
  const user = useAuthStore((s) => s.getUser())
  const logout = useAuthStore((s) => s.logout)
  const initAuth = useAuthStore((s) => s.initAuth)

  const isGuest = isGuestUser(user)

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

  const onWarmupSettings = () => {
    preloadRoute('/settings')
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
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 origin-top-right overflow-hidden rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-1.5 shadow-2xl backdrop-blur-2xl transition-all duration-150"
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
            {/* 我的追番（已从主导航迁移至此） */}
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

            {/* 设置 */}
            <Link
              to="/settings"
              role="menuitem"
              onMouseEnter={onWarmupSettings}
              onFocus={onWarmupSettings}
              onTouchStart={onWarmupSettings}
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>偏好与设置</span>
              </div>
            </Link>
          </div>

          {/* 底部功能/状态区 */}
          <div className="mt-1 border-t border-[var(--kz-border)] pt-1">
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
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    navigate('/settings#bangumi-token')
                  }}
                  className="w-full rounded-xl bg-[var(--kz-accent)] px-3 py-1.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-[var(--kz-accent-hover)] transition-colors cursor-pointer select-none"
                >
                  绑定 Bangumi 账号
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
