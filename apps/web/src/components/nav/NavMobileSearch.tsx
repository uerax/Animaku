import { useState, useRef, useEffect, FormEvent } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useSearchHistoryStore } from '../../stores/search-history'
import { SearchHistoryDropdown } from '../SearchHistoryDropdown'

interface NavMobileSearchProps {
  open: boolean
  onClose: () => void
}

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

function CloseIcon() {
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
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

export function NavMobileSearch({ open, onClose }: NavMobileSearchProps) {
  const isReducedMotion = useReducedMotion()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  const qFromUrl = location.pathname === '/search' ? params.get('q') || '' : ''
  const [q, setQ] = useState(qFromUrl)
  const [searchFocused, setSearchFocused] = useState(false)
  const addSearch = useSearchHistoryStore((s) => s.addSearch)

  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Sync with URL query parameter
  useEffect(() => {
    if (location.pathname === '/search') {
      setQ(params.get('q') || '')
    }
  }, [location.pathname, params])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus()
      }, 40)
      return () => window.clearTimeout(timer)
    }
  }, [open])

  // Outside click & Escape to dismiss
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!overlayRef.current?.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const handleExecuteSearch = (keyword: string) => {
    const trimmed = keyword.trim()
    if (!trimmed) {
      navigate('/search')
      onClose()
      return
    }
    addSearch(trimmed)
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
    onClose()
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
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          initial={
            isReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }
          }
          animate={
            isReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
          }
          exit={
            isReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }
          }
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 z-50 flex items-center md:hidden"
        >
          <form
            onSubmit={onSubmit}
            role="search"
            className="flex h-full w-full items-center gap-2 bg-[var(--kz-header-bg)]/98 px-3 backdrop-blur-2xl border-b border-[var(--kz-border)]"
          >
            {/* Search Input Box */}
            <div className="flex min-w-0 flex-1 items-center rounded-full border border-[var(--kz-accent)] bg-[var(--kz-bg)] shadow-[0_0_12px_var(--kz-accent-ring)]">
              <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center text-[var(--kz-accent)]">
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                value={q}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索番剧…"
                aria-label="搜索番剧"
                className="kz-search-input min-w-0 flex-1 border-none bg-transparent py-1.5 pr-2 text-xs text-[var(--kz-fg)] shadow-none outline-none ring-0 placeholder:text-[var(--kz-fg-dim)] focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              />
              {q.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setQ('')
                    inputRef.current?.focus()
                  }}
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
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Submit search button */}
            <button
              type="submit"
              className="kz-btn-primary shrink-0 !rounded-full !px-3.5 !py-1.5 text-xs font-semibold shadow-xs"
            >
              搜索
            </button>

            {/* Close button */}
            <button
              type="button"
              className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] active:scale-95 transition-all cursor-pointer"
              aria-label="关闭搜索"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </form>

          {/* Search history popover in mobile mode */}
          <AnimatePresence>
            {searchFocused && (
              <div className="absolute top-[calc(100%+6px)] inset-x-2 z-50">
                <SearchHistoryDropdown
                  onSelect={onSelectHistory}
                  isMobile
                  className="w-full shadow-2xl"
                />
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
