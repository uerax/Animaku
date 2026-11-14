import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoadingState } from './components/ui'
import { routeImports } from './lib/route-preload'
import { statsApi } from './lib/api'

const ACTIVE_PING_SESSION_KEY = 'animaku_last_active_ping'
const ACTIVE_PING_INTERVAL_MS = 30 * 60 * 1000 // 30 分钟去重

function useActiveTelemetry() {
  useEffect(() => {
    try {
      const now = Date.now()
      const stored = sessionStorage.getItem(ACTIVE_PING_SESSION_KEY)
      const lastPing = stored ? Number(stored) : 0
      if (!lastPing || now - lastPing > ACTIVE_PING_INTERVAL_MS) {
        sessionStorage.setItem(ACTIVE_PING_SESSION_KEY, String(now))
        void statsApi.pingActive().catch(() => {})
      }
    } catch {
      // 兼容私密浏览限制 sessionStorage 的场景
      void statsApi.pingActive().catch(() => {})
    }
  }, [])
}

// Keep core navigation pages and NotFoundPage in the initial chunk for instantaneous render
import { HomePage } from './pages/HomePage'
import { AnimePage } from './pages/AnimePage'
import { TimelinePage } from './pages/TimelinePage'
import { NotFoundPage } from './pages/NotFoundPage'

// Route-level code splitting: lazy-load secondary pages using unified preload loaders
const SearchPage = lazy(routeImports.search)
const CollectPage = lazy(routeImports.collect)
const HistoryPage = lazy(routeImports.history)
const SettingsPage = lazy(routeImports.settings)
const AdminPage = lazy(routeImports.admin)
const SubjectPage = lazy(routeImports.subject)
const PlayPage = lazy(routeImports.play)

function PageFallback() {
  return (
    <div className="py-12">
      <LoadingState text="加载页面…" />
    </div>
  )
}

export default function App() {
  useActiveTelemetry()

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="anime" element={<AnimePage />} />
        <Route
          path="search"
          element={
            <Suspense fallback={<PageFallback />}>
              <SearchPage />
            </Suspense>
          }
        />
        <Route
          path="collect"
          element={
            <Suspense fallback={<PageFallback />}>
              <CollectPage />
            </Suspense>
          }
        />
        <Route
          path="history"
          element={
            <Suspense fallback={<PageFallback />}>
              <HistoryPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageFallback />}>
              <SettingsPage />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            <Suspense fallback={<PageFallback />}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route
          path="subject/:id"
          element={
            <Suspense fallback={<PageFallback />}>
              <SubjectPage />
            </Suspense>
          }
        />
        <Route
          path="play/:id"
          element={
            <Suspense fallback={<PageFallback />}>
              <PlayPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
