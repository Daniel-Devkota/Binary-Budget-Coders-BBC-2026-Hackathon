import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { confirmWithCode } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import type { BookingWithContext } from '@/types/models'

/**
 * The learner's half, and the only step there is: confirmed straight to
 * completed, with the token moving in the same call.
 *
 * Every refusal the server has — wrong code, locked out after five, session no
 * longer awaiting confirmation — comes back as a thrown error, and the message
 * is shown inline rather than as a toast, because the person is mid-typing and
 * needs it next to the field.
 */
export function ConfirmCodeDialog({
  booking,
  open,
  onOpenChange,
  onConfirmed,
  initialCode,
}: {
  booking: BookingWithContext
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Fires after the token has moved — the caller offers the photo from here. */
  onConfirmed: () => void
  /** Prefilled when the learner arrived by scanning the teacher's QR. */
  initialCode?: string
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setCode(initialCode ?? '')
    setError(null)
    // Autofocus so a scanned link is one tap from done.
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open, initialCode])

  const teacherName = booking.teacher.display_name.split(' ')[0]

  const submit = async () => {
    if (code.length !== 6) { setError('The code is six digits.'); return }
    setBusy(true)
    setError(null)
    try {
      await confirmWithCode(booking.id, code)
      onOpenChange(false)
      onConfirmed()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Confirm this session"
        description={`Ask ${teacherName} to show you their code, and type it in while you are still together.`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); void submit() }}
        >
          <Field label="Six-digit code" htmlFor="confirm-code" error={error}>
            <Input
              ref={inputRef}
              id="confirm-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              // Strip anything that is not a digit so a pasted code with spaces
              // in it still works.
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
              className="h-14 text-center font-display font-extrabold tabular-nums tracking-[0.4em] text-2xl"
            />
          </Field>

          <p className="text-xs text-ink-faint">
            {booking.payment_type === 'token'
              ? `${teacherName} is credited the moment this goes through.`
              : 'This is a swap, so no tokens move either way.'}{' '}
            If the code will not work, you can still confirm the usual way once they mark the
            session as held.
          </p>

          <Button type="submit" className="w-full" size="lg" loading={busy}>
            <Check className="size-4" aria-hidden /> Confirm and release the token
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
