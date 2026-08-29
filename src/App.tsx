import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/stores/authStore'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/Toast'
import { AuthPage } from '@/features/auth/AuthPage'
import { LandingPage } from '@/features/home/LandingPage'
import { HomePage } from '@/features/home/HomePage'
import { SearchPage } from '@/features/search/SearchPage'
import { SkillPage } from '@/features/skills/SkillPage'
import { PublicProfilePage } from '@/features/profile/PublicProfilePage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { BookingsPage } from '@/features/booking/BookingsPage'
import { RequestsPage } from '@/features/requests/RequestsPage'
import { MapPlaceholder } from '@/features/home/MapPlaceholder'
import { BlockMark } from '@/components/layout/AppShell'

const MessagesPage = lazy(() =>
  import('@/features/messaging/MessagesPage').then((m) => ({ default: m.MessagesPage })),
)
const FeedPage = lazy(() =>
  import('@/features/feed/FeedPage').then((m) => ({ default: m.FeedPage })),
)

function FullPageLoader() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <BlockMark className="animate-pulse scale-150" />
        <span className="text-sm text-ink-faint">Stacking blocks…</span>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <FullPageLoader />
  if (!session) {
    return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <AppShell>{children}</AppShell>
}

export default function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => init(), [init])

  return (
    <>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<AuthPage mode="signin" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />

          <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/search" element={<RequireAuth><SearchPage /></RequireAuth>} />
          <Route path="/skill/:slug" element={<RequireAuth><SkillPage /></RequireAuth>} />
          <Route path="/u/:id" element={<RequireAuth><PublicProfilePage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/bookings" element={<RequireAuth><BookingsPage /></RequireAuth>} />
          <Route path="/messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
          <Route path="/messages/:conversationId" element={<RequireAuth><MessagesPage /></RequireAuth>} />
          <Route path="/requests" element={<RequireAuth><RequestsPage /></RequireAuth>} />
          <Route path="/feed" element={<RequireAuth><FeedPage /></RequireAuth>} />
          <Route path="/map" element={<RequireAuth><MapPlaceholder /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}
