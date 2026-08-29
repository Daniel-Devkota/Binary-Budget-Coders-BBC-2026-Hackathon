import { useEffect, useState } from 'react'
import { Video, MapPin, Clock, Repeat2, Coins, Check, X, ExternalLink, Zap, KeyRound } from 'lucide-react'
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
import { ShowCodeDialog } from './ShowCodeDialog'
import { ConfirmCodeDialog } from './ConfirmCodeDialog'

const statusTone = {
  confirmed: 'indigo',
  held: 'amber',
  completed: 'moss',
  cancelled: 'clay',
} as const

/**
 * FR14. Null is not an omission — bookings completed before confirm codes
 * existed have no method recorded, and guessing one for them would be worse
 * than saying nothing.
 */
const outcomeLabel: Record<string, string> = {
  code: 'Confirmed in person',
  learner: 'Confirmed later',
  auto: 'Auto-confirmed after 48 hours',
  force: 'Completed with the demo shortcut',
}

const statusLabel = {
  confirmed: 'Confirmed',
  held: 'Awaiting your confirmation',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const

export function BookingCard({
  booking,
  onChanged,
  scannedCode,
}: {
  booking: BookingWithContext
  onChanged: () => void
  /**
   * FR13 — the learner arrived by scanning the teacher's QR, so the confirm
   * dialog opens on its own with the six digits already in it.
   */
  scannedCode?: string | null
}) {
  const { userId, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [postOpen, setPostOpen] = useState(false)

  const [codeOpen, setCodeOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Distinguishes the dialog opening on its own after a confirmation from
  // someone deliberately pressing "Share this session" — only the first offers
  // an equal-weight Skip.
  const [justConfirmed, setJustConfirmed] = useState(false)

  const iAmTeacher = booking.teacher_id === userId
  const other = iAmTeacher ? booking.learner : booking.teacher
  const past = new Date(booking.slot.starts_at) < new Date()
  const revealed = booking.status !== 'cancelled'
  // In-person and online are genuinely different flows from here on. Co-presence
  // is the whole premise of the code, and two people on a video call can read
  // six digits aloud, so online keeps the two-step attestation.
  const inPerson = booking.slot.mode === 'in_person'
  const awaitingConfirmation = booking.status === 'confirmed' && past

  useEffect(() => {
    if (scannedCode && awaitingConfirmation && inPerson && !iAmTeacher) setConfirmOpen(true)
  }, [scannedCode, awaitingConfirmation, inPerson, iAmTeacher])

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
        {awaitingConfirmation && inPerson && iAmTeacher && (
          <>
            <Button size="sm" onClick={() => setCodeOpen(true)}>
              <KeyRound className="size-3.5" aria-hidden /> Show confirm code
            </Button>
            {/*
              The two-step path stays reachable for in-person too. A learner
              locked out after five wrong codes is told they can still confirm
              the usual way, and that has to be true.
            */}
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() => act(() => markHeld(booking.id), 'Marked as held. Waiting on their confirmation.')}
            >
              <Check className="size-3.5" aria-hidden /> Confirm without a code
            </Button>
          </>
        )}
        {awaitingConfirmation && inPerson && !iAmTeacher && (
          <Button size="sm" onClick={() => setConfirmOpen(true)}>
            <Check className="size-3.5" aria-hidden /> Confirm session
          </Button>
        )}
        {awaitingConfirmation && !inPerson && iAmTeacher && (
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
          <>
            {booking.confirmed_method && outcomeLabel[booking.confirmed_method] && (
              <p className="text-xs text-ink-faint self-center">
                {outcomeLabel[booking.confirmed_method]}.
              </p>
            )}
            <Button size="sm" variant="outline" onClick={() => setPostOpen(true)}>
              Share this session
            </Button>
          </>
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

      {codeOpen && (
        <ShowCodeDialog booking={booking} open={codeOpen} onOpenChange={setCodeOpen} />
      )}

      {confirmOpen && (
        <ConfirmCodeDialog
          booking={booking}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          initialCode={scannedCode ?? undefined}
          onConfirmed={async () => {
            await refreshProfile()
            toast.success(
              booking.payment_type === 'token'
                ? 'Confirmed. Their token is on the way.'
                : 'Confirmed. A swap costs neither of you a token.',
            )
            // FR10 — the photo is offered where it is natural, and skipping it
            // costs one tap. It is never a condition of anyone getting paid.
            //
            // onChanged() deliberately waits until that dialog closes: reloading
            // now moves this booking from "To confirm" to "Past", which unmounts
            // this card and takes the photo dialog with it.
            setJustConfirmed(true)
            setPostOpen(true)
          }}
        />
      )}

      {postOpen && (
        <ConsentPostDialog
          booking={booking}
          open={postOpen}
          onOpenChange={(v) => {
            setPostOpen(v)
            if (!v && justConfirmed) { setJustConfirmed(false); onChanged() }
          }}
          onDone={onChanged}
          offerSkip={justConfirmed}
        />
      )}
    </Card>
  )
}
