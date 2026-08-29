import { useEffect, useState } from 'react'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { revealSessionCode } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import type { BookingWithContext } from '@/types/models'

/**
 * The teacher's half. Six digits, large enough to read across a table, held on
 * screen while the learner types them in.
 *
 * The code is fetched on open rather than with the bookings list: the server
 * will not reveal it until 15 minutes before the session, and asking for every
 * booking up front would mean most of those calls raising for no reason.
 */
export function ShowCodeDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingWithContext
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCode(null)
    setError(null)
    revealSessionCode(booking.id)
      .then((c) => { if (!cancelled) setCode(c) })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)) })
    return () => { cancelled = true }
  }, [open, booking.id])

  const learnerName = booking.learner.display_name.split(' ')[0]

  // FR13. Opening this on the learner's phone lands on /bookings with the
  // confirm dialog already open and the six digits filled in — it is the same
  // code and the same RPC, just fewer taps. SVG, so there is no canvas and
  // nothing to rasterise.
  const deepLink = code
    ? `${window.location.origin}/bookings?confirm=${booking.id}&c=${code}`
    : null

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Your confirm code"
        description={`Show this to ${learnerName}. They type it in and the session is done — no second step for either of you.`}
      >
        <div className="space-y-4">
          <div className="grid place-items-center rounded-[16px] border-2 border-line-strong bg-paper-deep py-8">
            {code ? (
              <p
                className="font-display font-extrabold tabular-nums tracking-[0.2em] text-5xl sm:text-6xl"
                aria-label={`Confirm code ${code.split('').join(' ')}`}
              >
                {code}
              </p>
            ) : error ? (
              <p className="px-6 text-center text-sm font-medium text-clay-500">{error}</p>
            ) : (
              <Loader2 className="size-6 animate-spin text-ink-faint" aria-label="Loading" />
            )}
          </div>

          {deepLink && (
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-[12px] border-2 border-line-strong bg-white p-3">
                <QRCodeSVG value={deepLink} size={148} level="M" />
              </div>
              <p className="text-xs text-ink-faint">Or let {learnerName} scan this.</p>
            </div>
          )}

          {code && (
            <p className="flex items-start gap-2 text-xs text-ink-soft bg-indigo-50 border-2 border-indigo-200 rounded-[12px] p-3">
              <ShieldCheck className="size-4 mt-0.5 shrink-0 text-indigo-500" aria-hidden />
              Only {learnerName} can use this, and only for this session. It stays the same if you
              close this and open it again.
            </p>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
