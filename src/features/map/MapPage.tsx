import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, Globe2, LocateFixed, MapPin, Repeat2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Avatar } from '@/components/ui/Avatar'
import { toast } from '@/components/ui/Toast'
import { BookSlotDialog } from '@/features/booking/BookSlotDialog'
import { useAuth } from '@/stores/authStore'
import { fetchPerfectSwaps, fetchSlot, fetchSlotsInBounds } from '@/lib/api'
import { dayLabel, timeRange } from '@/lib/format'
import { cn, errorMessage } from '@/lib/utils'
import type { MapPoint, SlotWithContext } from '@/types/models'
import type { Viewport } from './GlobeMap'

// WebGL and a tile style are a heavy chunk. Nothing about the rest of the app
// should wait on them.
const GlobeMap = lazy(() => import('./GlobeMap').then((m) => ({ default: m.GlobeMap })))

export function MapPage() {
  const { profile, userId } = useAuth()
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1.6)
  const [swapPartnerIds, setSwapPartnerIds] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom: number; nonce: number } | null>(null)
  const [booking, setBooking] = useState<SlotWithContext | null>(null)

  // Only the newest viewport wins: panning fast otherwise lets a slow early
  // response overwrite a fast late one.
  const requestId = useRef(0)

  const initialCentre = useMemo(
    () => (profile?.lat != null && profile.lng != null ? { lat: profile.lat, lng: profile.lng } : null),
    [profile],
  )

  useEffect(() => {
    if (!userId) return
    fetchPerfectSwaps(userId)
      .then((swaps) => setSwapPartnerIds(new Set(swaps.map((s) => s.partner.id))))
      .catch(() => { /* the amber highlight is a bonus, never a blocker */ })
  }, [userId])

  const onViewportChange = useCallback(async (v: Viewport) => {
    const id = ++requestId.current
    setZoom(v.zoom)
    setLoading(true)
    try {
      const rows = await fetchSlotsInBounds(v)
      if (id === requestId.current) { setPoints(rows); setError(null) }
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      if (initialCentre) setFocus({ ...initialCentre, zoom: 11, nonce: Date.now() })
      else toast.error('This browser will not share a location.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setFocus({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 12, nonce: Date.now() }),
      () => {
        // Denied or unavailable — the profile's city is a fine second choice.
        if (initialCentre) {
          setFocus({ ...initialCentre, zoom: 11, nonce: Date.now() })
          toast.success(`Showing ${profile?.city ?? 'your city'} instead.`)
        } else {
          toast.error('Could not get your location. Try dragging the globe.')
        }
      },
      { timeout: 8000 },
    )
  }, [initialCentre, profile?.city])

  const openBooking = useCallback(async (point: MapPoint) => {
    if (!point.slot_id) return
    try {
      const slot = await fetchSlot(point.slot_id)
      if (!slot) { toast.error('That session was just taken.'); return }
      if (slot.teacher_id === userId) { toast.error('That is one of your own sessions.'); return }
      setBooking(slot)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }, [userId])

  const sessions = points.filter((p) => p.kind === 'slot')
  const clustered = zoom <= 6

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl">Sessions on the map</h1>
          <p className="text-sm text-ink-soft max-w-xl">
            Every in-person session with an open slot, anywhere on Earth. Spin the globe, dive into a
            city, and book what you find. Pins sit within about 500m of the real spot — the exact
            meeting point is shared once a booking is confirmed.
          </p>
        </div>
        <Button variant="outline" onClick={useMyLocation}>
          <LocateFixed className="size-4" aria-hidden /> Use my location
        </Button>
      </header>

      <Suspense fallback={<Skeleton className="w-full rounded-[14px]" style={{ height: 'min(62vh, 560px)' }} />}>
        <GlobeMap
          points={points}
          loading={loading}
          swapPartnerIds={swapPartnerIds}
          initialCentre={initialCentre}
          focus={focus}
          onViewportChange={onViewportChange}
          onBook={openBooking}
        />
      </Suspense>

      {error && (
        <p className="text-sm text-clay-600 bg-clay-100 border-2 border-clay-500/40 rounded-[12px] p-3">
          {error}
        </p>
      )}

      <section aria-label="Sessions in view" className="space-y-3">
        <h2 className="text-lg flex items-center gap-2">
          {clustered ? <Globe2 className="size-4 text-indigo-500" aria-hidden /> : <MapPin className="size-4 text-indigo-500" aria-hidden />}
          {clustered ? 'Cities with open sessions' : 'Sessions in view'}
        </h2>

        {loading && points.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : points.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="Nothing open in this part of the world"
            body="Zoom out to find a city that is busy, or post what you want to learn — someone nearby may pick it up."
            action={
              <div className="flex gap-2">
                <Link to="/requests"><Button variant="accent">Request a skill</Button></Link>
                <Link to="/search"><Button variant="outline">Browse all sessions</Button></Link>
              </div>
            }
          />
        ) : clustered ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {points.map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  className="block-card block-card-lift p-4 w-full flex items-center justify-between gap-3 text-left"
                  onClick={() => setFocus({ lat: p.lat, lng: p.lng, zoom: 11, nonce: Date.now() })}
                >
                  <span className="font-display font-bold">{p.label}</span>
                  <span className="text-sm text-ink-soft tabular-nums">
                    {p.session_count} session{p.session_count === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((p) => {
              const swap = !!p.teacher_id && swapPartnerIds.has(p.teacher_id)
              return (
                <li key={p.slot_id}>
                  <Card lift className={cn('p-4 space-y-3 h-full', swap && 'border-amber-500')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/skill/${p.skill_slug}`} className="font-display font-bold hover:underline underline-offset-2">
                          {p.skill_name}
                        </Link>
                        {p.starts_at && p.ends_at && (
                          <p className="text-[13px] text-ink-soft">
                            {dayLabel(p.starts_at)} · {timeRange(p.starts_at, p.ends_at)}
                          </p>
                        )}
                      </div>
                      {swap && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[8px] bg-amber-100 border-2 border-amber-200 text-[11px] font-bold text-amber-600">
                          <Repeat2 className="size-3" aria-hidden /> Swap
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Avatar name={p.teacher_name} src={p.teacher_avatar} id={p.teacher_id ?? ''} size="sm" />
                      <Link to={`/u/${p.teacher_id}`} className="text-[13px] font-semibold truncate hover:underline underline-offset-2">
                        {p.teacher_name}
                      </Link>
                      <span className="text-[12px] text-ink-faint truncate ml-auto">{p.label}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => openBooking(p)}
                        disabled={p.teacher_id === userId}
                      >
                        {p.teacher_id === userId ? 'Your session' : 'Book'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFocus({ lat: p.lat, lng: p.lng, zoom: 14, nonce: Date.now() })}
                      >
                        Show on map
                      </Button>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {booking && (
        <BookSlotDialog
          slot={booking}
          open={!!booking}
          onOpenChange={(v) => !v && setBooking(null)}
          onDone={() => {
            setBooking(null)
            // The slot is no longer open, so drop it without a round trip.
            setPoints((cur) => cur.filter((p) => p.slot_id !== booking.id))
          }}
        />
      )}
    </div>
  )
}

export default MapPage
