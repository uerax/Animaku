import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  NavLink,
  Outlet,
  useNavigate,
  useSearchParams,
  useLocation,
} from 'react-router-dom'
import clsx from 'clsx'
import { useSettingsStore } from '../stores/settings'
import { getSiteBranding } from '../lib/site-branding'
import { DocumentSeo } from './DocumentSeo'
import { SiteFooter } from './SiteFooter'

/** Always visible in the top strip (mobile + desktop). */
const primaryLinks = [
  { to: '/', label: '首页', end: true },
  { to: '/anime', label: '番剧' },
]

/** Desktop strip + mobile overflow menu. */
const moreLinks = [
  { to: '/timeline', label: '时间表' },
  { to: '/collect', label: '追番' },
  { to: '/history', label: '历史' },
  { to: '/settings', label: '设置' },
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

function ThemeToggleButton() {
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] transition-all duration-200 hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 shadow-sm sm:h-9 sm:w-9"
      title={isLight ? '切换到深色主题' : '切换到浅色主题'}
      aria-label={isLight ? '切换到深色主题' : '切换到浅色主题'}
    >
      {isLight ? (
        <svg
          width="18"
          height="18"
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
          width="18"
          height="18"
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
    </button>
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
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'relative whitespace-nowrap rounded-lg px-2 py-1 text-sm font-bold tracking-wide transition-all duration-200 sm:px-3.5 sm:py-2 sm:text-[15px]',
          isActive
            ? 'text-[var(--kz-fg)]'
            : 'text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && (
            <span
              className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--kz-accent)] shadow-[0_0_8px_var(--kz-accent)]"
              aria-hidden
            />
          )}
        </>
      )}
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
  const b = getSiteBranding()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const qFromUrl =
    location.pathname === '/search' ? params.get('q') || '' : ''
  const [q, setQ] = useState(qFromUrl)
  const [menuOpen, setMenuOpen] = useState(false)
  /** Mobile: icon-only until user opens search; desktop always shows field. */
  const [mobileSearchOpen, setMobileSearchOpen] = useState(
    () => location.pathname === '/search',
  )
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (location.pathname === '/search') {
      setQ(params.get('q') || '')
      setMobileSearchOpen(true)
    }
  }, [location.pathname, params])

  // Close overflow menu on route change
  useEffect(() => {
    setMenuOpen(false)
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

  useEffect(() => {
    if (mobileSearchOpen) {
      // Focus after expand so mobile keyboard opens
      const t = window.setTimeout(() => mobileSearchInputRef.current?.focus(), 30)
      return () => window.clearTimeout(t)
    }
  }, [mobileSearchOpen])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const keyword = q.trim()
    if (!keyword) {
      navigate('/search')
      return
    }
    navigate(`/search?q=${encodeURIComponent(keyword)}`)
    setMenuOpen(false)
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
      <header className="sticky top-0 z-40 border-b border-[var(--kz-border)] bg-[var(--kz-header-bg)] backdrop-blur-xl">
        <div className="relative mx-auto flex max-w-[1760px] items-center gap-1.5 px-2.5 py-1.5 sm:gap-3 sm:px-5 lg:px-6 sm:py-2">
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
            onClick={() => setMenuOpen(false)}
          >
            <img
              src="/favicon-32x32.png"
              alt=""
              width={32}
              height={32}
              className="h-7 w-7 rounded-full ring-1 ring-[var(--kz-border)] sm:h-8 sm:w-8"
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
            </div>

            {/* Mobile: overflow menu for remaining destinations */}
            <div className="relative md:hidden" ref={menuRef}>
              <button
                type="button"
                className={clsx(
                  'relative inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-[15px] font-bold tracking-wide transition-colors',
                  moreActive || menuOpen
                    ? 'text-[var(--kz-fg)]'
                    : 'text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)]',
                )}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="更多导航"
                onClick={() => setMenuOpen((v) => !v)}
              >
                更多
                <MenuIcon open={menuOpen} />
                {moreActive && !menuOpen && (
                  <span
                    className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-[var(--kz-accent)]"
                    aria-hidden
                  />
                )}
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
                </div>
              )}
            </div>
          </nav>

          {/* Desktop search — integrated glassmorphic capsule */}
          <form
            onSubmit={onSearch}
            className="hidden shrink-0 items-center md:flex"
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--kz-fg-muted)] transition-colors hover:text-[var(--kz-accent)] group-focus-within:text-[var(--kz-accent)]"
                title="搜索"
                aria-label="搜索"
              >
                <SearchIcon />
              </button>
              <input
                value={q}
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

          {/* Mobile: search icon only (expanded overlay is below) */}
          <button
            type="button"
            className={clsx(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] transition-colors hover:bg-[var(--kz-bg-hover)] md:hidden',
              mobileSearchOpen && 'invisible',
            )}
            aria-label="搜索番剧"
            title="搜索"
            aria-hidden={mobileSearchOpen}
            tabIndex={mobileSearchOpen ? -1 : 0}
            onClick={() => {
              setMenuOpen(false)
              setMobileSearchOpen(true)
            }}
          >
            <SearchIcon />
          </button>

          <ThemeToggleButton />
          <GitHubIconButton />

          {/*
            Mobile search overlay — covers logo/nav so the field never
            squeezes next to 首页/番剧 and collides with text.
          */}
          {mobileSearchOpen && (
            <form
              onSubmit={onSearch}
              role="search"
              className="absolute inset-0 z-50 flex items-center gap-2 bg-[var(--kz-header-bg)] px-3 backdrop-blur-xl md:hidden"
            >
              <div className="flex min-w-0 flex-1 items-center rounded-full border border-[var(--kz-accent)] bg-[var(--kz-bg)] shadow-[0_0_12px_var(--kz-accent-ring)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--kz-accent)]">
                  <SearchIcon />
                </span>
                <input
                  ref={mobileSearchInputRef}
                  value={q}
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
                  if (location.pathname !== '/search') setQ('')
                }}
              >
                <MenuIcon open />
              </button>
            </form>
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
            : 'max-w-[1760px] px-4 py-6 sm:px-5 lg:px-6',
        )}
      >
        <Outlet />
      </main>

      {/* Watch: no footer — cinema chrome; elsewhere promote repo + optional maintainer */}
      {!isWatch && <SiteFooter />}
    </div>
  )
}
