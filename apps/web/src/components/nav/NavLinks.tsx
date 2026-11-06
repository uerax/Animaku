import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import { useSiteConfigStore } from '../../stores/site-config'
import { preloadRoute } from '../../lib/route-preload'

const mainLinks = [
  { to: '/', label: '首页', end: true },
  { to: '/anime', label: '番剧' },
  { to: '/timeline', label: '时间表' },
]

function MenuChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={clsx(
        'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
        open ? 'rotate-180 text-[var(--kz-accent)]' : 'text-[var(--kz-fg-dim)]',
      )}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function NavLinks() {
  const isReducedMotion = useReducedMotion()
  const location = useLocation()
  const customNavLinks = useSiteConfigStore((s) => s.customNavLinks)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Route change: close overflow menu
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Outside click & Escape for overflow menu
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const onWarmup = (to: string) => {
    if (to !== '/') preloadRoute(to)
  }

  return (
    <nav
      className="flex h-full min-w-0 items-center gap-1 sm:gap-2 lg:gap-3"
      aria-label="主导航"
    >
      {/* Primary destinations with active underline indicator */}
      {mainLinks.map((link) => {
        const isActive = link.end
          ? location.pathname === link.to
          : location.pathname === link.to ||
            (link.to !== '/' && location.pathname.startsWith(link.to + '/'))

        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onMouseEnter={() => onWarmup(link.to)}
            onFocus={() => onWarmup(link.to)}
            onTouchStart={() => onWarmup(link.to)}
            className={clsx(
              'group relative flex h-full items-center justify-center px-2 sm:px-3 text-[14.5px] sm:text-[15.5px] font-medium tracking-wide transition-colors duration-150 select-none cursor-pointer',
              'drop-shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
              isActive
                ? 'text-[var(--kz-accent)]'
                : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]',
            )}
          >
            <span className="relative flex items-center justify-center py-1">
              <span className="kz-nav-title inline-block">{link.label}</span>

              {/* 贴近文字底部的激活指示小横条 (静态纯 CSS，无跨组件位移动画开销) */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1.5 inset-x-0 h-[2.5px] rounded-full bg-[var(--kz-accent)]"
                />
              )}
            </span>
          </NavLink>
        )
      })}

      {/* Desktop inline custom links */}
      <div className="hidden h-full items-center gap-1 sm:gap-2 lg:gap-3 md:flex">
        {customNavLinks.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target={link.target || '_blank'}
            rel="noopener noreferrer sponsored"
            className={clsx(
              'group relative inline-flex h-full items-center gap-1.5 px-2.5 sm:px-3 text-[14px] sm:text-[15px] font-medium tracking-wide transition-all duration-150',
              'drop-shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
              link.highlight
                ? 'text-[var(--kz-accent)]'
                : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]',
            )}
            title={link.title}
          >
            <span className="relative flex items-center gap-1.5 py-1">
              <span className="kz-nav-title inline-block">{link.title}</span>
              {link.badge && (
                <span
                  className={clsx(
                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none',
                    link.highlight
                      ? 'bg-[var(--kz-accent)] text-white'
                      : 'bg-[var(--kz-bg-soft)] text-[var(--kz-accent)] border border-[var(--kz-border)]',
                  )}
                >
                  {link.badge}
                </span>
              )}
            </span>
          </a>
        ))}
      </div>

      {/* Mobile overflow menu ONLY if customNavLinks exist */}
      {customNavLinks.length > 0 && (
        <div className="relative flex h-full items-center md:hidden" ref={menuRef}>
          <button
            type="button"
            className={clsx(
              'group relative flex h-full items-center gap-0.5 px-1.5 text-[14px] font-medium tracking-wide transition-colors duration-150 select-none cursor-pointer',
              'drop-shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
              menuOpen
                ? 'text-[var(--kz-accent)]'
                : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]',
            )}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="更多推荐"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span>更多</span>
            <MenuChevron open={menuOpen} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                initial={
                  isReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.95, y: -4 }
                }
                animate={
                  isReducedMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                exit={
                  isReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.95, y: -4 }
                }
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'top left' }}
                className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[11rem] overflow-hidden rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)]/98 p-1.5 shadow-xl backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/10"
              >
                <div className="px-3.5 py-1 text-[10.5px] font-semibold text-[var(--kz-fg-dim)]">
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
                    className="flex items-center justify-between rounded-xl px-3.5 py-2 text-[13.5px] font-medium text-[var(--kz-fg)] transition-colors hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)]"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span>{link.title}</span>
                      {link.badge && (
                        <span className="rounded-full bg-[var(--kz-accent)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--kz-accent)]">
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </nav>
  )
}
