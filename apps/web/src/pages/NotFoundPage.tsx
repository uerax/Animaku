import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useInRouterContext } from 'react-router-dom'
import { preloadRoute } from '../lib/route-preload'

export interface NotFoundPageProps {
  /** Visual theme mode / variant */
  type?: '404' | 'not_found' | 'error' | 'offline'
  /** Main heading */
  title?: string
  /** Subheading / explanation */
  description?: string
  /** HTTP or business status code (default: 404) */
  statusCode?: number | string
  /** If caused by a specific subject ID */
  subjectId?: number | string
  /** Raw error object for debugging */
  error?: unknown
  /** Retry callback if recoverable */
  onRetry?: () => void
  /** Compact inline mode for embedded states */
  compact?: boolean
}

/** Safe Link that falls back to <a> when rendered outside <BrowserRouter> */
function SafeLink({
  to,
  className,
  onMouseEnter,
  children,
}: {
  to: string
  className?: string
  onMouseEnter?: () => void
  children: ReactNode
}) {
  const inRouter = useInRouterContext()
  if (inRouter) {
    return (
      <Link to={to} className={className} onMouseEnter={onMouseEnter}>
        {children}
      </Link>
    )
  }
  return (
    <a href={to} className={className} onMouseEnter={onMouseEnter}>
      {children}
    </a>
  )
}

/**
 * Animated Vector Illustration for Anime 404 & Lost Signal
 */
function NotFoundIllustration({ type }: { type: NotFoundPageProps['type'] }) {
  const isError = type === 'error'
  const isOffline = type === 'offline'

  return (
    <div className="relative mx-auto flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56" aria-hidden>
      {/* Background radial glow */}
      <div
        className={`absolute inset-0 rounded-full blur-3xl opacity-30 ${
          isError ? 'bg-rose-500' : 'bg-[var(--kz-accent)]'
        }`}
      />

      <svg
        className="relative z-10 h-full w-full drop-shadow-md select-none transition-transform duration-500 hover:scale-105"
        viewBox="0 0 240 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Orbital cosmic rings */}
        <ellipse
          cx="120"
          cy="120"
          rx="105"
          ry="38"
          transform="rotate(-22 120 120)"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          className="text-[var(--kz-border)] opacity-60"
        />
        <ellipse
          cx="120"
          cy="120"
          rx="85"
          ry="30"
          transform="rotate(35 120 120)"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="2 4"
          className="text-[var(--kz-accent)] opacity-40"
        />

        {/* Floating background star particles */}
        <circle cx="36" cy="70" r="3" fill="var(--kz-accent)" className="animate-pulse opacity-75" />
        <circle cx="204" cy="58" r="2" fill="var(--kz-score)" className="animate-ping opacity-60" style={{ animationDuration: '3s' }} />
        <circle cx="198" cy="165" r="3.5" fill="var(--kz-accent)" className="animate-pulse opacity-70" />
        <circle cx="48" cy="172" r="2" fill="var(--kz-fg-dim)" className="opacity-50" />

        {/* Sparkle cross icons */}
        <path
          d="M30 115 L32 110 L34 115 L39 117 L34 119 L32 124 L30 119 L25 117 Z"
          fill="var(--kz-accent)"
          className="opacity-70 animate-bounce"
          style={{ animationDuration: '4s' }}
        />
        <path
          d="M208 100 L209.5 96 L211 100 L215 101.5 L211 103 L209.5 107 L208 103 L204 101.5 Z"
          fill="var(--kz-score)"
          className="opacity-80 animate-pulse"
        />

        {/* Anime TV / Monitor Body */}
        <g transform="translate(48, 52)">
          {/* Antenna */}
          <path
            d="M52 14 L28 -8 M92 14 L116 -8"
            stroke="var(--kz-fg-dim)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="26" cy="-10" r="4.5" fill="var(--kz-accent)" />
          <circle cx="118" cy="-10" r="4.5" fill="var(--kz-accent)" />

          {/* TV Outer Shell */}
          <rect
            x="8"
            y="12"
            width="128"
            height="96"
            rx="18"
            fill="var(--kz-bg-elevated)"
            stroke="var(--kz-border)"
            strokeWidth="3"
            className="shadow-xl"
          />

          {/* Screen Inner Bezel */}
          <rect
            x="18"
            y="22"
            width="92"
            height="76"
            rx="10"
            fill="var(--kz-bg-soft)"
            stroke="var(--kz-border)"
            strokeWidth="1.5"
          />

          {/* TV Screen Face / Emotion Expression */}
          {isError ? (
            /* Error / Crash Emotion ( >_< ) */
            <g className="text-rose-500">
              {/* Left Eye > */}
              <path d="M35 48 L46 54 L35 60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Right Eye < */}
              <path d="M79 48 L68 54 L79 60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Wavy Mouth */}
              <path d="M50 72 Q57 66 64 72" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              {/* Sweat drop */}
              <path d="M85 36 Q87 40 85 43 Q83 40 85 36" fill="var(--kz-accent)" />
            </g>
          ) : isOffline ? (
            /* Offline / Disconnected Emotion */
            <g className="text-[var(--kz-fg-dim)]">
              {/* Left Eye - */}
              <line x1="36" y1="54" x2="48" y2="54" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              {/* Right Eye - */}
              <line x1="66" y1="54" x2="78" y2="54" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              {/* Open O mouth */}
              <ellipse cx="57" cy="70" rx="5" ry="6" stroke="currentColor" strokeWidth="2.5" fill="none" />
              {/* Zzz sleeping signal */}
              <text x="78" y="40" fill="var(--kz-accent)" fontSize="12" fontWeight="bold" fontFamily="monospace">Z</text>
            </g>
          ) : (
            /* 404 / Lost in Anime Void Emotion ( ; _ ; ) with blush */
            <g>
              {/* Left Eye Tear */}
              <path d="M38 52 Q44 48 50 52" stroke="var(--kz-fg)" strokeWidth="3" strokeLinecap="round" fill="none" />
              <circle cx="40" cy="62" r="2.5" fill="var(--kz-accent)" className="animate-pulse" />

              {/* Right Eye Tear */}
              <path d="M64 52 Q70 48 76 52" stroke="var(--kz-fg)" strokeWidth="3" strokeLinecap="round" fill="none" />
              <circle cx="74" cy="62" r="2.5" fill="var(--kz-accent)" className="animate-pulse" />

              {/* Cute wavy triangle mouth ( ^ ▽ ^ or open cute mouth ) */}
              <path d="M52 66 Q57 73 62 66 Z" fill="var(--kz-accent)" opacity="0.85" />

              {/* Pink blush cheeks */}
              <ellipse cx="33" cy="62" rx="4" ry="2.5" fill="#f43f5e" opacity="0.45" />
              <ellipse cx="81" cy="62" rx="4" ry="2.5" fill="#f43f5e" opacity="0.45" />

              {/* TV Screen scanlines effect */}
              <line x1="22" y1="32" x2="106" y2="32" stroke="var(--kz-border)" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
              <line x1="22" y1="84" x2="106" y2="84" stroke="var(--kz-border)" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
            </g>
          )}

          {/* TV Controls on the right */}
          <circle cx="120" cy="36" r="4.5" fill="var(--kz-accent)" opacity="0.8" />
          <circle cx="120" cy="52" r="4.5" fill="var(--kz-border)" />
          <rect x="116" y="68" width="8" height="3" rx="1.5" fill="var(--kz-fg-dim)" opacity="0.6" />
          <rect x="116" y="76" width="8" height="3" rx="1.5" fill="var(--kz-fg-dim)" opacity="0.6" />

          {/* TV Stand / Legs */}
          <path d="M38 108 L28 122 M106 108 L116 122" stroke="var(--kz-border)" strokeWidth="4" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}

/**
 * Modern, Anime-Themed 404 Not Found & Error State Page
 */
export function NotFoundPage({
  type = '404',
  title,
  description,
  statusCode = 404,
  subjectId,
  error,
  onRetry,
  compact = false,
}: NotFoundPageProps) {
  const inRouter = useInRouterContext()
  const routerNavigate = inRouter ? useNavigate() : null
  const [query, setQuery] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)

  const isError = type === 'error'
  const isSubjectNotFound = Boolean(subjectId) || type === 'not_found'

  // Default smart copy
  const displayTitle =
    title ||
    (isError
      ? '页面加载失败'
      : isSubjectNotFound
        ? '番剧条目不存在或已下架'
        : '页面在异次元迷路了…')

  const displayDescription =
    description ||
    (isError
      ? '与服务器通信时发生异常，请检查网络连接或稍后重试。'
      : isSubjectNotFound
        ? `未找到编号为 ${subjectId ?? ''} 的番剧信息，该条目可能已被下架、尚未收录或链接有误。`
        : '你所访问的页面不存在、已被移动，或者输入的链接有误。')

  const badgeText = isError
    ? `ERROR ${statusCode || 500}`
    : `HTTP ${statusCode || 404}`

  const errorString =
    error instanceof Error
      ? `${error.name}: ${error.message}\n\n${error.stack || ''}`
      : error
        ? String(error)
        : ''

  function navigateTo(target: string | number) {
    if (typeof target === 'number') {
      if (typeof window !== 'undefined') {
        if (window.history.length > 1) {
          window.history.back()
        } else {
          window.location.href = '/'
        }
      }
      return
    }
    if (routerNavigate) {
      routerNavigate(target)
    } else if (typeof window !== 'undefined') {
      window.location.href = target
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    const kw = query.trim()
    if (!kw) {
      navigateTo('/search')
      return
    }
    navigateTo(`/search?q=${encodeURIComponent(kw)}`)
  }

  function handleCopyError() {
    if (!errorString) return
    navigator.clipboard.writeText(errorString).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className={`relative mx-auto flex w-full max-w-4xl flex-col items-center text-center ${
        compact ? 'py-8' : 'py-12 sm:py-16 md:py-20'
      }`}
      role="main"
      aria-label="404 页面未找到"
    >
      {/* Visual illustration */}
      <NotFoundIllustration type={type} />

      {/* Status Badge */}
      <div className="mt-6 sm:mt-8 flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--kz-accent-soft)] px-3 py-1 text-xs font-bold tracking-wider text-[var(--kz-accent)] ring-1 ring-[var(--kz-accent-ring)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--kz-accent)] animate-ping" />
          {badgeText}
        </span>
      </div>

      {/* Main Heading */}
      <h1 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-[var(--kz-fg)]">
        {displayTitle}
      </h1>

      {/* Subheading / Description */}
      <p className="mt-3 max-w-lg text-sm sm:text-base leading-relaxed text-[var(--kz-fg-muted)]">
        {displayDescription}
      </p>

      {/* Quick In-Page Search Bar */}
      <form
        onSubmit={handleSearch}
        className="mt-6 sm:mt-8 w-full max-w-md px-4"
        role="search"
      >
        <div className="group relative flex items-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-1.5 shadow-sm transition-all duration-200 hover:border-[var(--kz-accent-ring)] focus-within:border-[var(--kz-accent)] focus-within:shadow-[0_0_16px_var(--kz-accent-ring)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--kz-fg-dim)] group-focus-within:text-[var(--kz-accent)]">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索你想看的动漫番剧…"
            className="kz-search-input min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--kz-fg)] placeholder:text-[var(--kz-fg-dim)] focus:outline-none"
          />
          <button
            type="submit"
            className="kz-btn-primary shrink-0 !rounded-full !px-4 !py-2 !text-xs !font-bold"
          >
            搜索
          </button>
        </div>
      </form>

      {/* Primary Action Buttons */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 px-4">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="kz-btn-primary !gap-2 !py-2.5 !px-5 shadow-md"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            重新加载
          </button>
        ) : null}

        <SafeLink
          to="/"
          onMouseEnter={() => preloadRoute('/')}
          className="kz-btn-primary !gap-2 !py-2.5 !px-5 shadow-md"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          返回首页
        </SafeLink>

        <button
          type="button"
          onClick={() => navigateTo(-1)}
          className="kz-pill kz-pill-idle !min-h-[2.4rem] border border-[var(--kz-border)] !px-4 !text-xs sm:!text-sm hover:border-[var(--kz-accent)]"
        >
          返回上一页
        </button>

        <SafeLink
          to="/anime"
          onMouseEnter={() => preloadRoute('/anime')}
          className="kz-pill kz-pill-idle !min-h-[2.4rem] border border-[var(--kz-border)] !px-4 !text-xs sm:!text-sm hover:border-[var(--kz-accent)]"
        >
          番剧目录
        </SafeLink>
      </div>

      {/* Quick Navigation Cards */}
      <div className="mt-10 sm:mt-12 w-full max-w-xl px-4 text-left">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--kz-fg-dim)] text-center">
          试试这些推荐入口
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <SafeLink
            to="/anime?sort=heat"
            onMouseEnter={() => preloadRoute('/anime')}
            className="kz-surface kz-surface-interactive flex flex-col items-center justify-center p-3 text-center rounded-xl transition-all"
          >
            <span className="text-lg">🔥</span>
            <span className="mt-1 text-xs font-bold text-[var(--kz-fg)]">热门番剧</span>
            <span className="text-[10px] text-[var(--kz-fg-dim)]">当下高分热播</span>
          </SafeLink>

          <SafeLink
            to="/timeline"
            onMouseEnter={() => preloadRoute('/timeline')}
            className="kz-surface kz-surface-interactive flex flex-col items-center justify-center p-3 text-center rounded-xl transition-all"
          >
            <span className="text-lg">📅</span>
            <span className="mt-1 text-xs font-bold text-[var(--kz-fg)]">每日放送</span>
            <span className="text-[10px] text-[var(--kz-fg-dim)]">本季新番日历</span>
          </SafeLink>

          <SafeLink
            to="/collect"
            onMouseEnter={() => preloadRoute('/collect')}
            className="kz-surface kz-surface-interactive flex flex-col items-center justify-center p-3 text-center rounded-xl transition-all"
          >
            <span className="text-lg">⭐</span>
            <span className="mt-1 text-xs font-bold text-[var(--kz-fg)]">我的追番</span>
            <span className="text-[10px] text-[var(--kz-fg-dim)]">个人收藏列表</span>
          </SafeLink>

          <SafeLink
            to="/history"
            onMouseEnter={() => preloadRoute('/history')}
            className="kz-surface kz-surface-interactive flex flex-col items-center justify-center p-3 text-center rounded-xl transition-all"
          >
            <span className="text-lg">🕒</span>
            <span className="mt-1 text-xs font-bold text-[var(--kz-fg)]">观看历史</span>
            <span className="text-[10px] text-[var(--kz-fg-dim)]">继续上次播放</span>
          </SafeLink>
        </div>
      </div>

      {/* Collapsible Error Stack / Diagnostic Details (if error is present) */}
      {errorString ? (
        <div className="mt-8 w-full max-w-xl px-4 text-left">
          <div className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-3 text-xs">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="flex items-center gap-1.5 font-semibold text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]"
              >
                <svg
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    showDetails ? 'rotate-90' : ''
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                {showDetails ? '收起技术排查详情' : '展开技术排查详情'}
              </button>

              {showDetails && (
                <button
                  type="button"
                  onClick={handleCopyError}
                  className="text-[11px] font-semibold text-[var(--kz-accent)] hover:underline"
                >
                  {copied ? '已复制 ✓' : '复制错误'}
                </button>
              )}
            </div>

            {showDetails && (
              <pre className="mt-2.5 max-h-48 overflow-auto rounded-lg bg-[var(--kz-bg-soft)] p-3 font-mono text-[11.5px] leading-relaxed text-[var(--kz-danger)] whitespace-pre-wrap break-all select-text">
                {errorString}
              </pre>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
