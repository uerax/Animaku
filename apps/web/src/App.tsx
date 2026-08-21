import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoadingState } from './components/ui'
import { routeImports } from './lib/route-preload'

// Keep HomePage in the initial chunk for instantaneous first-paint
import { HomePage } from './pages/HomePage'

// Route-level code splitting: lazy-load non-index pages using unified preload loaders
const TimelinePage = lazy(routeImports.timeline)
const AnimePage = lazy(routeImports.anime)
const SearchPage = lazy(routeImports.search)
const CollectPage = lazy(routeImports.collect)
const HistoryPage = lazy(routeImports.history)
const SettingsPage = lazy(routeImports.settings)
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
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="timeline"
          element={
            <Suspense fallback={<PageFallback />}>
              <TimelinePage />
            </Suspense>
          }
        />
        <Route
          path="anime"
          element={
            <Suspense fallback={<PageFallback />}>
              <AnimePage />
            </Suspense>
          }
        />
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
      </Route>
    </Routes>
  )
}
