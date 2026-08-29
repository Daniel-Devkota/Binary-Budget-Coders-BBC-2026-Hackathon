import { CalendarDays, Repeat2, History, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import { fetchMyBookings, fetchMyProposals } from '@/lib/api'
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { BookingCard } from './BookingCard'
import { SwapProposalCard } from './SwapProposalCard'

export function BookingsPage() {
  const userId = useAuth((s) => s.userId)
  const bookings = useAsync(() => (userId ? fetchMyBookings(userId) : Promise.resolve([])), [userId])
  const proposals = useAsync(() => (userId ? fetchMyProposals(userId) : Promise.resolve([])), [userId])

  const reload = () => { void bookings.reload(); void proposals.reload() }

  const all = bookings.data ?? []
  const upcoming = all
    .filter((b) => b.status === 'confirmed' && new Date(b.slot.starts_at) >= new Date())
    .sort((a, b) => a.slot.starts_at.localeCompare(b.slot.starts_at))
  const awaiting = all.filter(
    (b) => b.status === 'held' || (b.status === 'confirmed' && new Date(b.slot.starts_at) < new Date()),
  )
  const past = all.filter((b) => ['completed', 'cancelled'].includes(b.status))
  const pendingSwaps = (proposals.data ?? []).filter((p) => p.status === 'pending')
  const otherSwaps = (proposals.data ?? []).filter((p) => p.status !== 'pending')

  const loading = bookings.loading || proposals.loading

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl">Your sessions</h1>
        <p className="text-ink-soft">Everything you are teaching, learning or still deciding on.</p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabList className="flex-wrap">
          <Tab value="upcoming">
            Upcoming {upcoming.length > 0 && <Badge tone="indigo" className="ml-1.5">{upcoming.length}</Badge>}
          </Tab>
          <Tab value="swaps">
            Swaps {pendingSwaps.length > 0 && <Badge tone="amber" className="ml-1.5">{pendingSwaps.length}</Badge>}
          </Tab>
          <Tab value="awaiting">
            To confirm {awaiting.length > 0 && <Badge tone="clay" className="ml-1.5">{awaiting.length}</Badge>}
          </Tab>
          <Tab value="past">Past</Tab>
        </TabList>

        <TabPanel value="upcoming" className="pt-5 space-y-3">
          {loading ? (
            <><CardSkeleton /><CardSkeleton /></>
          ) : upcoming.length ? (
            upcoming.map((b) => <BookingCard key={b.id} booking={b} onChanged={reload} />)
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Nothing booked"
              body="Find an hour that suits you and pay with a token, or offer a swap and pay with your own time."
              action={<Link to="/search"><Button>Browse open sessions</Button></Link>}
            />
          )}
        </TabPanel>

        <TabPanel value="swaps" className="pt-5 space-y-3">
          {loading ? (
            <><CardSkeleton /><CardSkeleton /></>
          ) : pendingSwaps.length || otherSwaps.length ? (
            <>
              {pendingSwaps.map((p) => <SwapProposalCard key={p.id} proposal={p} onChanged={reload} />)}
              {otherSwaps.length > 0 && (
                <>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint pt-3">Settled</h2>
                  {otherSwaps.map((p) => <SwapProposalCard key={p.id} proposal={p} onChanged={reload} />)}
                </>
              )}
            </>
          ) : (
            <EmptyState
              icon={Repeat2}
              title="No swap proposals"
              body="A swap is an hour for an hour, and costs neither of you a token. Your home page lists the people you match with perfectly."
              action={<Link to="/home"><Button variant="outline">See your matches</Button></Link>}
            />
          )}
        </TabPanel>

        <TabPanel value="awaiting" className="pt-5 space-y-3">
          {loading ? (
            <CardSkeleton />
          ) : awaiting.length ? (
            awaiting.map((b) => <BookingCard key={b.id} booking={b} onChanged={reload} />)
          ) : (
            <EmptyState
              icon={Inbox}
              title="Nothing waiting on you"
              body="When a session has happened, the teacher marks it held and you confirm. Tokens move only after that."
            />
          )}
        </TabPanel>

        <TabPanel value="past" className="pt-5 space-y-3">
          {loading ? (
            <CardSkeleton />
          ) : past.length ? (
            past.map((b) => <BookingCard key={b.id} booking={b} onChanged={reload} />)
          ) : (
            <EmptyState icon={History} title="No history yet" body="Your completed sessions will collect here." />
          )}
        </TabPanel>
      </Tabs>
    </div>
  )
}
