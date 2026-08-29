import { useState } from 'react'
import { ImagePlus, ShieldCheck } from 'lucide-react'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea, Field } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { createPost, uploadImage } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { useAuth } from '@/stores/authStore'
import type { BookingWithContext } from '@/types/models'

/**
 * A post starts as pending_consent. Nothing with another person in it reaches
 * the feed until they say yes — that is enforced by the posts RLS policy too.
 */
export function ConsentPostDialog({
  booking,
  open,
  onOpenChange,
  onDone,
  offerSkip,
}: {
  booking: BookingWithContext
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone?: () => void
  /**
   * Set when the dialog opened on its own straight after a confirmation rather
   * than because someone pressed "Share this session". Skipping then has to
   * cost exactly one tap and read as an equal choice, not as a dismissal — the
   * photo is never a condition of getting paid.
   */
  offerSkip?: boolean
}) {
  const userId = useAuth((s) => s.userId)!
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const partner = booking.teacher_id === userId ? booking.learner : booking.teacher

  const choose = (f: File | null) => {
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const submit = async () => {
    if (!caption.trim()) { toast.error('Add a line about how it went.'); return }
    setBusy(true)
    try {
      const photo_url = file ? await uploadImage('session-photos', userId, file) : null
      await createPost({
        booking_id: booking.id,
        author_id: userId,
        partner_id: partner.id,
        skill_id: booking.skill_id,
        caption: caption.trim(),
        photo_url,
      })
      toast.success(`Sent to ${partner.display_name.split(' ')[0]} to approve.`)
      onOpenChange(false)
      onDone?.()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Share this session"
        description={`${partner.display_name} has to approve before anyone else sees it.`}
      >
        <div className="space-y-4">
          <Field label="How did it go?" htmlFor="caption">
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={`An hour of ${booking.skill.name} with ${partner.display_name.split(' ')[0]} and I…`}
              maxLength={400}
            />
          </Field>

          <div className="space-y-2">
            <span className="block text-[13px] font-semibold text-ink-soft">Photo (optional)</span>
            <label className="flex items-center gap-3 p-3 rounded-[12px] border-2 border-dashed border-line-strong cursor-pointer hover:bg-paper-deep">
              <ImagePlus className="size-5 text-ink-faint" aria-hidden />
              <span className="text-sm text-ink-soft">
                {file ? file.name : 'Choose an image — up to 5MB'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
              />
            </label>
            {preview && (
              <img
                src={preview}
                alt=""
                className="w-full max-h-56 object-cover rounded-[12px] border-2 border-line-strong"
              />
            )}
          </div>

          <p className="flex items-start gap-2 text-xs text-ink-soft bg-indigo-50 border-2 border-indigo-200 rounded-[12px] p-3">
            <ShieldCheck className="size-4 mt-0.5 shrink-0 text-indigo-500" aria-hidden />
            Nothing is published until {partner.display_name.split(' ')[0]} approves it. Either of you
            can decline and the post disappears.
          </p>

          {offerSkip ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
                Skip
              </Button>
              <Button size="lg" onClick={submit} loading={busy}>
                Send for approval
              </Button>
            </div>
          ) : (
            <Button className="w-full" size="lg" onClick={submit} loading={busy}>
              Send for approval
            </Button>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
