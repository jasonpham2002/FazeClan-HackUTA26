import { Route, Routes } from 'react-router-dom'
import { AdminLayout } from './admin/AdminLayout'
import { ApplicationDetailPage } from './admin/pages/ApplicationDetailPage'
import { ApplicationListPage } from './admin/pages/ApplicationListPage'
import { EventEditorPage } from './admin/pages/EventEditorPage'
import { FanPointsPage } from './admin/pages/FanPointsPage'
import { InsightsPage } from './admin/pages/InsightsPage'
import { MarketsPage } from './admin/pages/MarketsPage'
import { RewardsAdminPage } from './admin/pages/RewardsAdminPage'
import { InterviewEditorPage } from './admin/pages/InterviewEditorPage'
import { OverviewPage } from './admin/pages/OverviewPage'
import { DemoBanner } from './components/ui/DemoBanner'
import { FanSignUpPage, FinishSignInPage, SignInPage } from './components/ui/SignInPage'
import { EmptyState } from './components/ui/ui'
import { MatchesPage } from './fan/MatchesPage'
import { PlayerPage } from './fan/PlayerPage'
import { PlayersExperience } from './fan/experience/PlayersExperience'
import { PlayersPage } from './fan/PlayersPage'
import { RewardsPage } from './fan/RewardsPage'
import { FanLayout, FanEventsPage, FanEventPage, FanApplicationPage, FanProfilePage, FanProfileEditPage } from './fan/FanPages'

export default function App() {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <Routes>
        {/* Fan routes (Johnny), using the same API/store and components as staff. */}
        <Route element={<FanLayout />}>
          <Route path="/" element={<FanEventsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          {/* FaZe ID: the immersive scroll scene, reached from the logo. */}
          <Route path="/faze-id" element={<PlayersExperience />} />
          <Route path="/players/:id" element={<PlayerPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/rewards" element={<RewardsPage />} />
          <Route path="/events/:id" element={<FanEventPage />} />
          <Route path="/applications/:id" element={<FanApplicationPage />} />
          <Route path="/profile" element={<FanProfilePage />} />
          <Route path="/profile/edit" element={<FanProfileEditPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-in/continue" element={<FinishSignInPage />} />
          <Route path="/sign-up" element={<FanSignUpPage />} />
        </Route>

        {/* Staff routes (Khoi) */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="markets" element={<MarketsPage />} />
          <Route path="rewards" element={<RewardsAdminPage />} />
          <Route path="fans/:id/points" element={<FanPointsPage />} />
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
