import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { useSiteConfigStore } from '../stores/site-config'
import { preloadCoreNavigationRoutes } from '../lib/route-preload'
import { useSiteHighlights } from '../lib/highlights'
import { DocumentSeo } from './DocumentSeo'
import { SiteFooter } from './SiteFooter'
import { LoginModal } from './LoginModal'
import { Navbar } from './nav/Navbar'

export function Layout() {
  const isReducedMotion = useReducedMotion()
  const location = useLocation()
  const fetchConfig = useSiteConfigStore((s) => s.fetchConfig)

  // 全站首屏静默预热运营展位/公告配置 (对齐 1 分钟 CDN 缓存，所有子页面秒级就绪且 0 布局跳变)
  useSiteHighlights()

  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

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

  const isWatch =
    location.pathname.startsWith('/subject/') ||
    location.pathname.startsWith('/play/')

  return (
    <div className="flex min-h-screen flex-col bg-[var(--kz-bg)] text-[var(--kz-fg)]">
      <DocumentSeo />

      {/* 现代解耦顶部导航栏 */}
      <Navbar />

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

      {/* 全局登录与账号绑定控制面板 */}
      <LoginModal />
    </div>
  )
}
