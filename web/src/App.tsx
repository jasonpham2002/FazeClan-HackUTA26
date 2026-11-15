import { Route, Routes } from 'react-router-dom'
import { AdminLayout } from './admin/AdminLayout'
import { ApplicationDetailPage } from './admin/pages/ApplicationDetailPage'
import { ApplicationListPage } from './admin/pages/ApplicationListPage'
import { EventEditorPage } from './admin/pages/EventEditorPage'
import { InterviewEditorPage } from './admin/pages/InterviewEditorPage'
import { OverviewPage } from './admin/pages/OverviewPage'
import { DemoBanner } from './components/ui/DemoBanner'
import { EmptyState } from './components/ui/ui'
import { FanLayout, FanEventsPage, FanEventPage, FanApplicationPage, FanProfilePage, FanSignInPage } from './fan/FanPages'

export default function App() {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <Routes>
        {/* Fan routes (Johnny), using the same API/store and components as staff. */}
        <Route element={<FanLayout />}>
          <Route path="/" element={<FanEventsPage />} />
          <Route path="/events/:id" element={<FanEventPage />} />
          <Route path="/applications/:id" element={<FanApplicationPage />} />
          <Route path="/profile" element={<FanProfilePage />} />
          <Route path="/sign-in" element={<FanSignInPage />} />
        </Route>

        {/* Staff routes (Khoi) */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="events/new" element={<EventEditorPage />} />
          <Route path="events/:id" element={<EventEditorPage />} />
          <Route path="events/:id/interview" element={<InterviewEditorPage />} />
          <Route path="events/:id/applications" element={<ApplicationListPage />} />
          <Route path="applications/:id" element={<ApplicationDetailPage />} />
        </Route>

        <Route
          path="*"
          element={
            <main className="mx-auto max-w-xl p-8">
              <EmptyState title="Page not found" />
            </main>
          }
        />
      </Routes>
    </div>
  )
}
