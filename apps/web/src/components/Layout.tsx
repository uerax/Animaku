import { FormEvent, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  NavLink,
  Outlet,
  useNavigate,
  useSearchParams,
  useLocation,
} from 'react-router-dom'
import clsx from 'clsx'
import { defaultNavSettings, useSettingsStore } from '../stores/settings'
import { useSearchHistoryStore } from '../stores/search-history'
import { useSiteConfigStore } from '../stores/site-config'
import { getSiteBranding, useSiteBranding } from '../lib/site-branding'
import { preloadRoute, preloadCoreNavigationRoutes } from '../lib/route-preload'
import { useSiteHighlights } from '../lib/highlights'
import { DocumentSeo } from './DocumentSeo'
import { SiteFooter } from './SiteFooter'
import { UserDropdown } from './UserDropdown'
import { SearchHistoryDropdown } from './SearchHistoryDropdown'

/** Always visible in the top strip (mobile + desktop). */
const primaryLinks = [
  { to: '/', label: '首页', end: true },
  { to: '/anime', label: '番剧' },
]

/** Desktop strip + mobile overflow menu. */
const moreLinks = [
  { to: '/timeline', label: '时间表' },
]

function GitHubIconButton() {
  const b = getSiteBranding()
  return (
    <a
      href={b.githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] transition-all duration-200 hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 shadow-sm sm:h-9 sm:w-9"
      title={b.githubLabel}
      aria-label={`${b.productName} ${b.githubLabel}`}
    >
      <svg
        className="h-[18px] w-[18px] fill-current"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    </a>
  )
}

function NavItem({
  to,
  label,
  end,
  onNavigate,
}: {
  to: string
  label: string
  end?: boolean
  onNavigate?: () => void
}) {
  const onWarmup = () => {
    if (to !== '/') preloadRoute(to)
  }

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      onMouseEnter={onWarmup}
      onFocus={onWarmup}
      onTouchStart={onWarmup}
      className={({ isActive }) =>
        clsx(
          'relative whitespace-nowrap rounded-lg px-2.5 py-1 text-sm font-bold tracking-wide transition-colors sm:px-3.5 sm:py-1.5 sm:text-[15px]',
          isActive
            ? 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] ring-1 ring-[var(--kz-accent)]/25'
            : 'text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]',
        )
      }
    >
      {label}
    </NavLink>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ) : (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  )
}

export function Layout() {
  const isReducedMotion = useReducedMotion()
  const b = useSiteBranding()
  const iconMode = useSiteConfigStore((s) => s.iconMode)
  const iconUrl = useSiteConfigStore((s) => s.iconUrl)
  const iconUpdatedAt = useSiteConfigStore((s) => s.iconUpdatedAt)
  const customNavLinks = useSiteConfigStore((s) => s.customNavLinks)
  const fetchConfig = useSiteConfigStore((s) => s.fetchConfig)

  // 全站首屏静默预热运营展位/公告配置 (对齐 1 分钟 CDN 缓存，所有子页面秒级就绪且 0 布局跳变)
  useSiteHighlights()

  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

  const navigate = useNavigate()
  const location = useLocation()

  const [params] = useSearchParams()
  const showGitHub = useSettingsStore(
    (s) => s.nav?.showGitHub ?? defaultNavSettings.showGitHub,
  )

  const qFromUrl =
    location.pathname === '/search' ? params.get('q') || '' : ''
  const [q, setQ] = useState(qFromUrl)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const addSearch = useSearchHistoryStore((s) => s.addSearch)
  /** Mobile: icon-only until user opens search; desktop always shows field. */
  const [mobileSearchOpen, setMobileSearchOpen] = useState(
    () => location.pathname === '/search',
  )
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const mobileSearchFormRef = useRef<HTMLDivElement>(null)
  const desktopSearchRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (location.pathname === '/search') {
      setQ(params.get('q') || '')
      setMobileSearchOpen(true)
    }
  }, [location.pathname, params])

  // Idle background preloading: warm core navigation chunks (~15KB gzip)
  // during idle time after first paint so clicks never stall on any browser.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const schedule =
      'requestIdleCallback' in window
        ? (window.requestIdleCallback as (cb: () => void, opts?: { timeout: number }) => number)
        : (cb: () => void) => window.setTimeout(cb, 1500)
    const cancel =
      'cancelIdleCallback' in window
        ? (window.cancelIdleCallback as (id: number) => void)
        : (id: number) => window.clearTimeout(id)

    const handle = schedule(
      () => {
        preloadCoreNavigationRoutes()
      },
      { timeout: 3000 },
    )

    return () => cancel(handle)
  }, [])

  // Close overflow menu and search history on route change
  useEffect(() => {
    setMenuOpen(false)
    setSearchFocused(false)
  }, [location.pathname])

  // Outside click / Escape for menu
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Outside click / Escape for search history popover
  useEffect(() => {
    if (!searchFocused) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !desktopSearchRef.current?.contains(target) &&
        !mobileSearchFormRef.current?.contains(target)
      ) {
        setSearchFocused(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchFocused(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [searchFocused])

  useEffect(() => {
    if (mobileSearchOpen) {
      // Focus after expand so mobile keyboard opens
      const t = window.setTimeout(() => mobileSearchInputRef.current?.focus(), 30)
      return () => window.clearTimeout(t)
    }
  }, [mobileSearchOpen])

  function handleExecuteSearch(keyword: string) {
    const trimmed = keyword.trim()
    if (!trimmed) {
      navigate('/search')
      return
    }
    addSearch(trimmed)
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
    setMenuOpen(false)
    setSearchFocused(false)
  }

  function onSearch(e: FormEvent) {
    e.preventDefault()
    handleExecuteSearch(q)
  }

  function onSelectHistory(keyword: string) {
    setQ(keyword)
    handleExecuteSearch(keyword)
  }

  const moreActive = moreLinks.some(
    (l) =>
      location.pathname === l.to ||
      (l.to !== '/' && location.pathname.startsWith(l.to + '/')),
  )

  const isWatch =
    location.pathname.startsWith('/subject/') ||
    location.pathname.startsWith('/play/')

  return (
    <div className="flex min-h-screen flex-col bg-[var(--kz-bg)] text-[var(--kz-fg)]">
      <DocumentSeo />
      <header
        className={clsx(
          'z-40 border-b border-[var(--kz-border)] bg-[var(--kz-header-bg)] backdrop-blur-xl',
          isWatch ? 'relative lg:sticky lg:top-0' : 'sticky top-0',
        )}
      >
        <div
          className={clsx(
            'relative mx-auto flex items-center gap-1.5 px-2.5 py-1.5 sm:gap-3 sm:px-5 lg:px-0 sm:py-2',
            isWatch
              ? 'max-w-[1760px]'
              : 'w-full lg:w-[86%] lg:min-w-[1080px] lg:max-w-[1680px]',
          )}
        >
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
            aria-label={`${b.productName} 首页`}
            onClick={() => setMenuOpen(false)}
          >
            <img
              src={
                iconMode === 'url' && iconUrl
                  ? iconUrl
                  : `/logo.png${iconUpdatedAt ? `?v=${iconUpdatedAt}` : ''}`
              }
              alt={b.productName}
              width={32}
              height={32}
              className="h-7 w-7 rounded-full object-cover ring-1 ring-[var(--kz-border)] sm:h-8 sm:w-8"
              decoding="async"
            />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-[15px] font-bold tracking-tight">
                {b.productName}
              </span>
              <span className="text-[10px] font-normal text-[var(--kz-fg-muted)]">
                {b.tagline}
              </span>
            </span>
          </NavLink>

          {/* Primary tabs — no horizontal scroll on mobile */}
          <nav
            className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1"
            aria-label="主导航"
          >
            {primaryLinks.map((l) => (
              <NavItem key={l.to} {...l} />
            ))}

            {/* Desktop: rest of links inline */}
            <div className="hidden items-center gap-0.5 md:flex">
              {moreLinks.map((l) => (
                <NavItem key={l.to} {...l} />
              ))}

              {/* 自定义广告外链 / 赞助商直达 */}
              {customNavLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target={link.target || '_blank'}
                  rel="noopener noreferrer sponsored"
                  className={clsx(
                    'group relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-sm font-bold tracking-wide transition-all duration-200 sm:px-3 sm:py-2 sm:text-[15px]',
                    link.highlight
                      ? 'text-[var(--kz-accent)] hover:bg-[var(--kz-accent-soft)] hover:shadow-xs'
                      : 'text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]',
                  )}
                  title={link.title}
                >
                  <span>{link.title}</span>
                  {link.badge && (
                    <span
                      className={clsx(
                        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none shadow-xs',
                        link.highlight
                          ? 'bg-[var(--kz-accent)] text-white'
                          : 'bg-[var(--kz-bg-soft)] text-[var(--kz-accent)] border border-[var(--kz-border)]',
                      )}
                    >
                      {link.badge}
                    </span>
                  )}
                </a>
              ))}
            </div>

            {/* Mobile: overflow menu for remaining destinations */}
            <div className="relative md:hidden" ref={menuRef}>
              <button
                type="button"
                className={clsx(
                  'relative inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm font-bold tracking-wide transition-colors sm:px-3 sm:py-1.5 sm:text-[15px]',
                  moreActive || menuOpen
                    ? 'bg-[var(--kz-accent-soft)] text-[var(--kz-accent)] ring-1 ring-[var(--kz-accent)]/25'
                    : 'text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]',
                )}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="更多导航"
                onMouseEnter={() => moreLinks.forEach((l) => preloadRoute(l.to))}
                onTouchStart={() => moreLinks.forEach((l) => preloadRoute(l.to))}
                onClick={() => setMenuOpen((v) => !v)}
              >
                更多
                <MenuIcon open={menuOpen} />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[10.5rem] overflow-hidden rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] py-1 shadow-lg"
                >
                  {moreLinks.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      onMouseEnter={() => preloadRoute(l.to)}
                      onTouchStart={() => preloadRoute(l.to)}
                      className={({ isActive }) =>
                        clsx(
                          'block px-4 py-2.5 text-[15px] font-semibold transition-colors',
                          isActive
                            ? 'bg-[var(--kz-bg-hover)] text-[var(--kz-accent)]'
                            : 'text-[var(--kz-fg)] hover:bg-[var(--kz-bg-hover)]',
                        )
                      }
                    >
                      {l.label}
                    </NavLink>
                  ))}

                  {/* 移动端自定义广告外链 / 赞助商直达 */}
                  {customNavLinks.length > 0 && (
                    <div className="my-1 border-t border-[var(--kz-border)]/60 pt-1">
                      <div className="px-4 py-1 text-[11px] font-semibold text-[var(--kz-fg-dim)]">
                        合作推荐
                      </div>
                      {customNavLinks.map((link) => (
                        <a
                          key={link.id}
                          href={link.url}
                          target={link.target || '_blank'}
                          rel="noopener noreferrer sponsored"
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center justify-between px-4 py-2 text-[14px] font-semibold text-[var(--kz-fg)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span>{link.title}</span>
                            {link.badge && (
                              <span className="rounded bg-[var(--kz-accent)]/15 px-1 py-0.5 text-[9px] font-bold text-[var(--kz-accent)]">
                                {link.badge}
                              </span>
                            )}
                          </span>
                          <svg
                            className="h-3 w-3 shrink-0 text-[var(--kz-fg-dim)]"
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
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </nav>

          {/* Desktop search — integrated glassmorphic capsule */}
          <div className="relative hidden shrink-0 items-center md:flex" ref={desktopSearchRef}>
            <form
              onSubmit={onSearch}
              className="flex items-center"
              role="search"
            >
              <div
                className={clsx(
                  'group relative flex items-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] transition-[border-color,box-shadow,background-color] duration-150 ease-out shadow-sm',
                  'hover:border-[var(--kz-border-subtle)] hover:bg-[var(--kz-bg-soft)]',
                  'focus-within:border-[var(--kz-accent)] focus-within:bg-[var(--kz-bg-elevated)] focus-within:shadow-[0_0_14px_var(--kz-accent-ring)]',
                  'w-56 lg:w-64 xl:w-72',
                )}
              >
                <button
                  type="submit"
                  onMouseEnter={() => preloadRoute('/search')}
                  onFocus={() => preloadRoute('/search')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--kz-fg-muted)] transition-colors hover:text-[var(--kz-accent)] group-focus-within:text-[var(--kz-accent)]"
                  title="搜索"
                  aria-label="搜索"
                >
                  <SearchIcon />
                </button>
                <input
                  value={q}
                  onFocus={() => {
                    preloadRoute('/search')
                    setSearchFocused(true)
                  }}
                  onMouseEnter={() => preloadRoute('/search')}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜索番剧…"
                  aria-label="搜索番剧"
                  className="kz-search-input min-w-0 flex-1 border-none bg-transparent py-1.5 pr-2 text-[13.5px] text-[var(--kz-fg)] shadow-none outline-none ring-0 placeholder:text-[var(--kz-fg-dim)] focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                />
                {q.trim() ? (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--kz-bg-hover)] text-[var(--kz-fg-muted)] transition-colors hover:bg-[var(--kz-accent)] hover:text-white"
                    aria-label="清空输入"
                    title="清空"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                ) : (
                  <span className="pointer-events-none mr-2.5 hidden select-none rounded border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--kz-fg-dim)] lg:inline-block">
                    ↵
                  </span>
                )}
              </div>
            </form>

            <AnimatePresence>
              {searchFocused && (
                <SearchHistoryDropdown
                  onSelect={onSelectHistory}
                  className="absolute right-0 top-[calc(100%+8px)] w-72 max-w-[calc(100vw-32px)]"
                />
              )}
            </AnimatePresence>
          </div>

          {/* Desktop right action items */}
          <div className="hidden shrink-0 items-center gap-1.5 sm:gap-2 md:flex">
            {showGitHub && <GitHubIconButton />}
            <UserDropdown />
          </div>

          {/* Mobile right action items */}
          <div className="flex shrink-0 items-center gap-1.5 md:hidden">
            <button
              type="button"
              className={clsx(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] transition-all duration-200 hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 shadow-sm sm:h-9 sm:w-9',
                mobileSearchOpen && 'invisible pointer-events-none',
              )}
              aria-label="搜索番剧"
              title="搜索"
              disabled={mobileSearchOpen}
              tabIndex={mobileSearchOpen ? -1 : 0}
              onClick={(e) => {
                e.currentTarget.blur()
                setMenuOpen(false)
                setMobileSearchOpen(true)
              }}
            >
              <SearchIcon />
            </button>
            {showGitHub && <GitHubIconButton />}
            <UserDropdown />
          </div>

          {/*
            Mobile search overlay — covers logo/nav so the field never
            squeezes next to 首页/番剧 and collides with text.
          */}
          {mobileSearchOpen && (
            <div
              ref={mobileSearchFormRef}
              className="absolute inset-0 z-50 md:hidden"
            >
              <form
                onSubmit={onSearch}
                role="search"
                className="flex h-full items-center gap-2 bg-[var(--kz-header-bg)] px-3 backdrop-blur-xl"
              >
                <div className="flex min-w-0 flex-1 items-center rounded-full border border-[var(--kz-accent)] bg-[var(--kz-bg)] shadow-[0_0_12px_var(--kz-accent-ring)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--kz-accent)]">
                    <SearchIcon />
                  </span>
                  <input
                    ref={mobileSearchInputRef}
                    value={q}
                    onFocus={() => setSearchFocused(true)}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="搜索番剧…"
                    aria-label="搜索番剧"
                    className="kz-search-input min-w-0 flex-1 border-none bg-transparent py-1.5 pr-2 text-[14px] text-[var(--kz-fg)] shadow-none outline-none ring-0 placeholder:text-[var(--kz-fg-dim)] focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                  />
                  {q.trim() && (
                    <button
                      type="button"
                      onClick={() => setQ('')}
                      className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--kz-bg-hover)] text-[var(--kz-fg-muted)] hover:bg-[var(--kz-accent)] hover:text-white"
                      aria-label="清空输入"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="kz-btn-primary shrink-0 !rounded-full !px-3.5 !py-2 text-[13.5px] shadow-sm"
                >
                  搜索
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]"
                  aria-label="关闭搜索"
                  onClick={() => {
                    setMobileSearchOpen(false)
                    setSearchFocused(false)
                    if (location.pathname !== '/search') setQ('')
                  }}
                >
                  <MenuIcon open />
                </button>
              </form>

              <AnimatePresence>
                {searchFocused && (
                  <div className="absolute top-[calc(100%+4px)] inset-x-2">
                    <SearchHistoryDropdown
                      onSelect={onSelectHistory}
                      isMobile
                      className="w-full"
                    />
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </header>

      <main
        className={clsx(
          // min-w-0: flex column child can otherwise refuse to shrink on iOS,
          // letting wide grid cards blow past the page gutters.
          'mx-auto w-full min-w-0 flex-1',
          isWatch
            ? 'max-w-[1760px] px-0 py-3 sm:px-5 sm:py-4 lg:px-6'
            : 'w-full lg:w-[86%] lg:min-w-[1080px] lg:max-w-[1680px] px-4 py-6 sm:px-5 lg:px-0',
        )}
      >
        <motion.div
          key={location.pathname}
          initial={isReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="w-full min-w-0 flex-1"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Watch: no footer — cinema chrome; elsewhere promote repo + optional maintainer */}
      {!isWatch && <SiteFooter />}
    </div>
  )
}
