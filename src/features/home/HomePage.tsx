import { Link } from 'react-router-dom'
import {
  Sparkles, CalendarDays, Coins, ArrowRight, Search, Compass, TrendingUp, Inbox,
  GraduationCap, Lightbulb, CalendarPlus, Check,
} from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import {
  fetchLedger, fetchMyBookings, fetchMyProposals, fetchMySlots, fetchOpenSlots,
  fetchPerfectSwaps, fetchUserSkills,
} from '@/lib/api'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CardSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { TokenChip } from '@/components/ui/TokenChip'
import { Badge } from '@/components/ui/Badge'
import { PerfectSwapCard } from './PerfectSwapCard'
import { BookingCard } from '@/features/booking/BookingCard'
import { SlotCard } from '@/components/domain/SlotCard'
import { SwapProposalCard } from '@/features/booking/SwapProposalCard'
import { TOKEN_CAP } from '@/lib/constants'
import { relative } from '@/lib/format'

const ledgerCopy: Record<string, string> = {
  signup_grant: 'Welcome grant',
  weekly_grant: 'Weekly top-up',
  booking_hold: 'Booked a session',
  booking_refund: 'Booking cancelled',
  teach_earn: 'You taught a session',
}

export function HomePage() {
  const { profile, userId } = useAuth()
  const first = profile?.display_name?.split(' ')[0] ?? 'there'

  const swaps = useAsync(() => (userId ? fetchPerfectSwaps(userId) : Promise.resolve([])), [userId])
  const bookings = useAsync(() => (userId ? fetchMyBookings(userId) : Promise.resolve([])), [userId])
  const proposals = useAsync(() => (userId ? fetchMyProposals(userId) : Promise.resolve([])), [userId])
  const ledger = useAsync(() => (userId ? fetchLedger(userId, 6) : Promise.resolve([])), [userId])
  const fresh = useAsync(() => fetchOpenSlots({ limit: 6 }), [])
  const mySkills = useAsync(() => (userId ? fetchUserSkills(userId) : Promise.resolve([])), [userId])
  const mySlots = useAsync(() => (userId ? fetchMySlots(userId) : Promise.resolve([])), [userId])

  const upcoming = (bookings.data ?? [])
    .filter((b) => ['confirmed', 'held'].includes(b.status))
    .sort((a, b) => a.slot.starts_at.localeCompare(b.slot.starts_at))

  const inbound = (proposals.data ?? []).filter(
    (p) => p.status === 'pending' && p.responder_id === userId,
  )

  const reloadAll = () => {
    void bookings.reload()
    void proposals.reload()
    void swaps.reload()
    void ledger.reload()
  }

  return (
    <div className="space-y-8">
      {/* ─── header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl">Hey {first}.</h1>
          <p className="text-ink-soft">
            {upcoming.length > 0
              ? `You have ${upcoming.length} session${upcoming.length === 1 ? '' : 's'} coming up.`
              : 'Nothing booked yet — there is someone below who wants what you know.'}
          </p>
        </div>
        <Link to="/search">
          <Button>
            <Search className="size-4" aria-hidden /> Find a session
          </Button>
        </Link>
      </div>

      {/* ─── setup: nothing can match you until these three exist ───────── */}
      {!mySkills.loading && !mySlots.loading && (
        <SetupCard
          teaches={(mySkills.data ?? []).some((s) => s.kind === 'teach')}
          learns={(mySkills.data ?? []).some((s) => s.kind === 'learn')}
          hasSlot={(mySlots.data ?? []).some(
            (s) => s.starts_at && new Date(s.starts_at) >= new Date() && s.status === 'open',
          )}
        />
      )}

      {/* ─── perfect swaps: the headline ────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center size-9 rounded-[11px] bg-amber-300 border-2 border-amber-500">
            <Sparkles className="size-4 text-ink" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl leading-tight">Perfect swaps for you</h2>
            <p className="text-sm text-ink-soft">
              They teach what you want, and want what you teach. Nobody spends a token.
            </p>
          </div>
        </div>

        {swaps.loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <CardSkeleton /><CardSkeleton /><CardSkeleton />
          </div>
        ) : swaps.data?.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {swaps.data.slice(0, 6).map((s) => (
              <PerfectSwapCard key={s.partner.id} swap={s} onDone={reloadAll} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Compass}
            title="No perfect match yet"
            body="Add another skill you can teach or want to learn — every one you add multiplies the chance of a two-way match."
            action={
              <Link to="/profile">
                <Button variant="outline">Manage your skills <ArrowRight className="size-4" aria-hidden /></Button>
              </Link>
            }
          />
        )}
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ─── left column ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {inbound.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Inbox className="size-4 text-amber-500" aria-hidden />
                <h2 className="text-xl leading-tight">Swap proposals waiting on you</h2>
                <Badge tone="amber">{inbound.length}</Badge>
              </div>
              <div className="space-y-3">
                {inbound.map((p) => (
                  <SwapProposalCard key={p.id} proposal={p} onChanged={reloadAll} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl leading-tight flex items-center gap-2">
                <CalendarDays className="size-4 text-indigo-500" aria-hidden /> Your next sessions
              </h2>
              <Link to="/bookings" className="text-sm font-semibold text-indigo-500 hover:underline underline-offset-2">
                See all
              </Link>
            </div>
            {bookings.loading ? (
              <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>
            ) : upcoming.length ? (
              <div className="space-y-3">
                {upcoming.slice(0, 3).map((b) => (
                  <BookingCard key={b.id} booking={b} onChanged={reloadAll} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Your calendar is empty"
                body="Book someone's open hour with a token, or offer one of yours as a swap."
                action={<Link to="/search"><Button variant="outline">Browse open sessions</Button></Link>}
              />
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl leading-tight flex items-center gap-2">
              <TrendingUp className="size-4 text-moss-500" aria-hidden /> Newly opened hours
            </h2>
            {fresh.loading ? (
              <div className="grid sm:grid-cols-2 gap-4"><CardSkeleton /><CardSkeleton /></div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {(fresh.data ?? []).slice(0, 4).map((s) => (
                  <SlotCard key={s.id} slot={s} onChanged={() => void fresh.reload()} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ─── right column ────────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Coins className="size-4 text-amber-500" aria-hidden /> Your tokens
              </CardTitle>
              <TokenChip balance={profile?.token_balance ?? 0} />
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex gap-1.5" aria-hidden>
                {Array.from({ length: TOKEN_CAP }, (_, i) => (
                  <span
                    key={i}
                    className={`h-9 flex-1 rounded-[8px] border-2 ${
                      i < (profile?.token_balance ?? 0)
                        ? 'bg-amber-300 border-amber-500'
                        : 'bg-paper-deep border-line'
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm text-ink-soft leading-relaxed">
                Your balance never goes past {TOKEN_CAP}. Teaching is the only way to earn, which is
                the entire point.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
            <CardBody>
              {ledger.loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" />
                </div>
              ) : ledger.data?.length ? (
                <ul className="divide-y-2 divide-line -my-1">
                  {ledger.data.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <span
                        className={`grid place-items-center size-8 shrink-0 rounded-[9px] border-2 font-bold text-sm tabular-nums ${
                          e.delta > 0
                            ? 'bg-moss-100 border-moss-500/40 text-moss-600'
                            : 'bg-clay-100 border-clay-500/40 text-clay-600'
                        }`}
                      >
                        {e.delta > 0 ? `+${e.delta}` : e.delta}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate">
                          {ledgerCopy[e.reason] ?? e.reason}
                        </span>
                        <span className="block text-xs text-ink-faint">{relative(e.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-faint">Nothing yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * The whole platform is inert until you have taught-list + learn-list + one open hour.
 * A new account has none of the three and no reason to open the profile page, so the
 * prompt has to live on the first screen they land on. It disappears once all three exist.
 */
function SetupCard({ teaches, learns, hasSlot }: { teaches: boolean; learns: boolean; hasSlot: boolean }) {
  const steps = [
    {
      done: teaches,
      icon: GraduationCap,
      label: 'Add something you can teach',
      body: 'You only need to be a step ahead of the person learning.',
      to: '/profile?tab=skills',
      cta: 'Add a teach skill',
    },
    {
      done: learns,
      icon: Lightbulb,
      label: 'Add something you want to learn',
      body: 'This is the half that finds you a perfect two-way swap.',
      to: '/profile?tab=skills',
      cta: 'Add a learn skill',
    },
    {
      done: hasSlot,
      icon: CalendarPlus,
      label: 'Publish an hour you are free',
      body: 'An open hour is what makes you findable and bookable.',
      to: '/profile?tab=slots',
      cta: 'Publish an hour',
    },
  ]

  const remaining = steps.filter((s) => !s.done)
  if (remaining.length === 0) return null
  const next = remaining[0]

  return (
    <Card className="border-amber-500 bg-amber-100/50">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-600" aria-hidden />
          Finish setting up — {steps.length - remaining.length} of {steps.length} done
        </CardTitle>
        <p className="text-sm text-ink-soft">
          Nobody can match with you until all three are in place. It takes about a minute.
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        <ol className="grid sm:grid-cols-3 gap-3">
          {steps.map(({ done, icon: Icon, label, body, to }) => (
            <li key={label}>
              <Link
                to={to}
                className={`flex h-full gap-2.5 p-3 rounded-[12px] border-2 bg-white ${
                  done ? 'border-moss-500/50 opacity-60' : 'border-line-strong hover:bg-paper-deep'
                }`}
              >
                <span
                  className={`grid place-items-center size-7 shrink-0 rounded-[9px] border-2 ${
                    done ? 'bg-moss-500 border-moss-600 text-white' : 'bg-amber-300 border-amber-500 text-ink'
                  }`}
                  aria-hidden
                >
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className="space-y-0.5">
                  <span className={`block text-sm font-semibold ${done ? 'line-through' : ''}`}>{label}</span>
                  <span className="block text-xs text-ink-soft">{done ? 'Done.' : body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <Link to={next.to}>
          <Button variant="accent">
            {next.cta} <ArrowRight className="size-4" aria-hidden />
          </Button>
        </Link>
      </CardBody>
    </Card>
  )
}
