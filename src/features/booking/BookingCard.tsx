import { useState } from 'react'
import { Video, MapPin, Clock, Repeat2, Coins, Check, X, ExternalLink, Zap } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'
import { PersonRow } from '@/components/domain/PersonRow'
import { SkillPill } from '@/components/domain/SkillPill'
import { dayLabel, timeRange } from '@/lib/format'
import { cancelBooking, completeBooking, forceComplete, markHeld } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { DEV_TOOLS } from '@/lib/constants'
import { useAuth } from '@/stores/authStore'
import type { BookingWithContext } from '@/types/models'
import { ConsentPostDialog } from '@/features/feed/ConsentPostDialog'

const statusTone = {
  confirmed: 'indigo',
  held: 'amber',
  completed: 'moss',
  cancelled: 'clay',
} as const

const statusLabel = {
  confirmed: 'Confirmed',
  held: 'Awaiting your confirmation',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const

export function BookingCard({
  booking,
  onChanged,
}: {
  booking: BookingWithContext
  onChanged: () => void
}) {
  const { userId, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [postOpen, setPostOpen] = useState(false)

  const iAmTeacher = booking.teacher_id === userId
  const other = iAmTeacher ? booking.learner : booking.teacher
  const past = new Date(booking.slot.starts_at) < new Date()
  const revealed = booking.status !== 'cancelled'

  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      await refreshProfile()
      toast.success(ok)
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <SkillPill skill={booking.skill} />
          <Badge tone={booking.payment_type === 'swap' ? 'amber' : 'indigo'}>
            {booking.payment_type === 'swap' ? (
              <><Repeat2 className="size-3" aria-hidden /> Swap</>
            ) : (
              <><Coins className="size-3" aria-hidden /> 1 token</>
            )}
          </Badge>
        </div>
        <Badge tone={statusTone[booking.status as keyof typeof statusTone]}>
          {statusLabel[booking.status as keyof typeof statusLabel]}
        </Badge>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-display font-bold text-lg leading-none">{dayLabel(booking.slot.starts_at)}</p>
        <p className="text-sm text-ink-soft flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {timeRange(booking.slot.starts_at, booking.slot.ends_at)}
        </p>
        <p className="text-xs text-ink-faint">
          {iAmTeacher ? 'You are teaching' : 'You are learning'}
        </p>
      </div>

      <PersonRow person={other} size="sm" />

      {revealed && (booking.meeting_url || booking.location_text) && (
        <div className="rounded-[12px] border-2 border-line bg-paper-deep px-3 py-2 text-sm">
          {booking.meeting_url ? (
            <a
              href={booking.meeting_url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-2 font-semibold text-indigo-600 hover:underline underline-offset-2 break-all"
            >
              <Video className="size-4 shrink-0" aria-hidden />
              {booking.meeting_url}
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
          ) : (
            <p className="flex items-center gap-2 text-ink-soft">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {booking.location_text}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {booking.status === 'confirmed' && iAmTeacher && past && (
          <Button size="sm" loading={busy} onClick={() => act(() => markHeld(booking.id), 'Marked as held. Waiting on their confirmation.')}>
            <Check className="size-3.5" aria-hidden /> Session happened
          </Button>
        )}
        {booking.status === 'held' && !iAmTeacher && (
          <Button size="sm" loading={busy} onClick={() => act(() => completeBooking(booking.id), 'Confirmed. Their token is on the way.')}>
            <Check className="size-3.5" aria-hidden /> Yes, it happened
          </Button>
        )}
        {booking.status === 'held' && iAmTeacher && (
          <p className="text-xs text-ink-faint self-center">
            Auto-confirms {booking.auto_confirm_at ? dayLabel(booking.auto_confirm_at) : 'in 48 hours'}.
          </p>
        )}
        {['confirmed', 'held'].includes(booking.status) && (
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={() => act(() => cancelBooking(booking.id), 'Cancelled.')}
          >
            <X className="size-3.5" aria-hidden /> Cancel
          </Button>
        )}
        {booking.status === 'completed' && (
          <Button size="sm" variant="outline" onClick={() => setPostOpen(true)}>
            Share this session
          </Button>
        )}
        {DEV_TOOLS && ['confirmed', 'held'].includes(booking.status) && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-amber-600"
            loading={busy}
            title="Demo shortcut — skips the clock"
            onClick={() => act(() => forceComplete(booking.id), 'Completed.')}
          >
            <Zap className="size-3.5" aria-hidden /> Force complete
          </Button>
        )}
      </div>

      {postOpen && (
        <ConsentPostDialog
          booking={booking}
          open={postOpen}
          onOpenChange={setPostOpen}
          onDone={onChanged}
        />
      )}
    </Card>
  )
}
