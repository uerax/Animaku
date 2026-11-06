import { useState, useRef, useEffect, FormEvent } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useSearchHistoryStore } from '../../stores/search-history'
import { preloadRoute } from '../../lib/route-preload'
import { SearchHistoryDropdown } from '../SearchHistoryDropdown'

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

export function NavSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  const qFromUrl = location.pathname === '/search' ? params.get('q') || '' : ''
  const [q, setQ] = useState(qFromUrl)
  const [searchFocused, setSearchFocused] = useState(false)
  const addSearch = useSearchHistoryStore((s) => s.addSearch)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync with URL query parameter
  useEffect(() => {
    if (location.pathname === '/search') {
      setQ(params.get('q') || '')
    }
  }, [location.pathname, params])

  // Close search dropdown on route change
  useEffect(() => {
    setSearchFocused(false)
  }, [location.pathname])

  // Global keyboard shortcut: Cmd+K / Ctrl+K or '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase()
      const isInputActive =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        (document.activeElement as HTMLElement)?.isContentEditable

      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !isInputActive)) {
        e.preventDefault()
        preloadRoute('/search')
        inputRef.current?.focus()
        setSearchFocused(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Outside click & Escape to dismiss dropdown
  useEffect(() => {
    if (!searchFocused) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setSearchFocused(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchFocused(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [searchFocused])

  const handleExecuteSearch = (keyword: string) => {
    const trimmed = keyword.trim()
    if (!trimmed) {
      navigate('/search')
      return
    }
    addSearch(trimmed)
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
    setSearchFocused(false)
    inputRef.current?.blur()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    handleExecuteSearch(q)
  }

  const onSelectHistory = (keyword: string) => {
    setQ(keyword)
    handleExecuteSearch(keyword)
  }

  return (
    <div
      className="relative hidden shrink-0 items-center md:flex w-56 lg:w-64 xl:w-72"
      ref={containerRef}
    >
      <form onSubmit={onSubmit} role="search" className="flex w-full items-center">
        <div
          className={clsx(
            'group relative flex h-9.5 sm:h-10 w-full items-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/70 transition-[border-color,box-shadow,background-color] duration-200 ease-out shadow-2xs',
            'hover:border-[var(--kz-border-subtle)] hover:bg-[var(--kz-bg-elevated)]',
            'focus-within:border-[var(--kz-accent)] focus-within:bg-[var(--kz-bg-elevated)] focus-within:shadow-[0_0_16px_var(--kz-accent-ring)]',
          )}
        >
          {/* Search submit icon button */}
          <button
            type="submit"
            onMouseEnter={() => preloadRoute('/search')}
            onFocus={() => preloadRoute('/search')}
            className="flex h-9.5 w-9.5 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-[var(--kz-fg-muted)] transition-colors hover:text-[var(--kz-accent)] group-focus-within:text-[var(--kz-accent)] cursor-pointer"
            title="搜索"
            aria-label="搜索"
          >
            <SearchIcon />
          </button>

          {/* Search input field */}
          <input
            ref={inputRef}
            value={q}
            onFocus={() => {
              preloadRoute('/search')
              setSearchFocused(true)
            }}
            onMouseEnter={() => preloadRoute('/search')}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索番剧…"
            aria-label="搜索番剧"
            className="kz-search-input min-w-0 flex-1 border-none bg-transparent py-2 pr-2 text-[13.5px] text-[var(--kz-fg)] shadow-none outline-none ring-0 placeholder:text-[var(--kz-fg-dim)] focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          />

          {/* Clear button or Hotkey badge */}
          {q.trim() ? (
            <button
              type="button"
              onClick={() => {
                setQ('')
                inputRef.current?.focus()
              }}
              className="mr-2.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--kz-bg-hover)] text-[var(--kz-fg-muted)] transition-all hover:bg-[var(--kz-accent)] hover:text-white cursor-pointer active:scale-90"
              aria-label="清空输入"
              title="清空"
            >
              <ClearIcon />
            </button>
          ) : (
            <div className="pointer-events-none mr-2.5 hidden items-center gap-1 select-none lg:flex">
              <kbd className="inline-flex h-5 items-center rounded border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-1.5 text-[10px] font-semibold text-[var(--kz-fg-dim)] shadow-2xs">
                ⌘K
              </kbd>
            </div>
          )}
        </div>
      </form>

      {/* Dropdown search history: 与搜索框 100% 等宽垂直对齐 */}
      <AnimatePresence>
        {searchFocused && (
          <SearchHistoryDropdown
            onSelect={onSelectHistory}
            className="absolute inset-x-0 top-[calc(100%+8px)] w-full"
          />
        )}
      </AnimatePresence>
    </div>
  )
}
