import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoadingState } from './components/ui'

// Keep HomePage in the initial chunk for instantaneous first-paint
import { HomePage } from './pages/HomePage'

// Route-level code splitting: lazy-load non-index pages on demand
const TimelinePage = lazy(() =>
  import('./pages/TimelinePage').then((m) => ({ default: m.TimelinePage })),
)
const AnimePage = lazy(() =>
  import('./pages/AnimePage').then((m) => ({ default: m.AnimePage })),
)
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })),
)
const CollectPage = lazy(() =>
  import('./pages/CollectPage').then((m) => ({ default: m.CollectPage })),
)
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const SubjectPage = lazy(() =>
  import('./pages/SubjectPage').then((m) => ({ default: m.SubjectPage })),
)
const PlayPage = lazy(() =>
  import('./pages/PlayPage').then((m) => ({ default: m.PlayPage })),
)

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
