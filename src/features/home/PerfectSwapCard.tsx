import { useState } from 'react'
import { ArrowLeftRight, Repeat2, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { Select, Textarea, Field } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { SkillPill } from '@/components/domain/SkillPill'
import { useAsync } from '@/lib/useAsync'
import { useAuth } from '@/stores/authStore'
import { fetchOpenSlots, proposeSwap } from '@/lib/api'
import { dayLabel, timeRange } from '@/lib/format'
import { errorMessage } from '@/lib/utils'
import type { PerfectSwap } from '@/types/models'

export function PerfectSwapCard({ swap, onDone }: { swap: PerfectSwap; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const first = swap.partner.display_name.split(' ')[0]

  return (
    <>
      <Card lift className="p-5 space-y-4 relative overflow-hidden">
        <span className="absolute -right-6 -top-6 size-20 rotate-12 rounded-[16px] bg-amber-100 border-2 border-amber-200" aria-hidden />
        <div className="flex items-center gap-3 relative">
          <Avatar name={swap.partner.display_name} src={swap.partner.avatar_url} id={swap.partner.id} size="lg" />
          <div className="min-w-0">
            <Link to={`/u/${swap.partner.id}`} className="font-display font-bold text-lg leading-tight hover:underline underline-offset-2">
              {swap.partner.display_name}
            </Link>
            <p className="text-xs text-ink-faint truncate">{swap.partner.city ?? 'Online'}</p>
          </div>
        </div>

        <div className="relative space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-ink-soft">They teach</span>
            <SkillPill skill={swap.theyTeach} />
            <span className="text-ink-faint text-xs">you want it</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-ink-soft">They want</span>
            <SkillPill skill={swap.theyWant} />
            <span className="text-ink-faint text-xs">you teach it</span>
          </div>
        </div>

        <div className="flex gap-2 relative">
          <Button size="sm" variant="accent" className="flex-1" onClick={() => setOpen(true)}>
            <Repeat2 className="size-3.5" aria-hidden /> Propose swap
          </Button>
          <Link to={`/u/${swap.partner.id}`}>
            <Button size="sm" variant="outline" aria-label={`Message ${first}`}>
              <MessageSquare className="size-3.5" aria-hidden />
            </Button>
          </Link>
        </div>
      </Card>

      {open && <SwapDialog swap={swap} open={open} onOpenChange={setOpen} onDone={onDone} />}
    </>
  )
}

function SwapDialog({
  swap,
  open,
  onOpenChange,
  onDone,
}: {
  swap: PerfectSwap
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone?: () => void
}) {
  const userId = useAuth((s) => s.userId)!
  const [theirSlot, setTheirSlot] = useState('')
  const [mySlot, setMySlot] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const theirs = useAsync(
    () => fetchOpenSlots({ teacherId: swap.partner.id, skillId: swap.theyTeach.id }),
    [swap.partner.id, swap.theyTeach.id],
  )
  const mine = useAsync(
    () => fetchOpenSlots({ teacherId: userId, skillId: swap.theyWant.id }),
    [userId, swap.theyWant.id],
  )

  const submit = async () => {
    if (!theirSlot || !mySlot) { toast.error('Pick a time on both sides.'); return }
    setBusy(true)
    try {
      await proposeSwap({ responderSlotId: theirSlot, proposerSlotId: mySlot, message: message.trim() || undefined })
      toast.success(`Swap sent to ${swap.partner.display_name.split(' ')[0]}.`)
      onOpenChange(false)
      onDone?.()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const empty = (list: unknown[] | null, who: string, skill: string) =>
    list && list.length === 0 ? `${who} has no open ${skill} slots right now.` : undefined

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Swap with ${swap.partner.display_name}`}
        description="An hour each. No tokens move."
      >
        <div className="space-y-4">
          <Field
            label={`${swap.theyTeach.name} — their session, for you`}
            htmlFor="theirs"
            hint={empty(theirs.data, swap.partner.display_name.split(' ')[0], swap.theyTeach.name)}
          >
            <Select id="theirs" value={theirSlot} onChange={(e) => setTheirSlot(e.target.value)}>
              <option value="">Choose a time…</option>
              {(theirs.data ?? []).map((s) => (
                <option key={s.id} value={s.id!}>
                  {dayLabel(s.starts_at!)} · {timeRange(s.starts_at!, s.ends_at!)} · {s.mode === 'online' ? 'Online' : 'In person'}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-center gap-2 text-ink-faint text-xs font-semibold uppercase tracking-wide">
            <span className="h-0.5 flex-1 bg-line" />
            <ArrowLeftRight className="size-4" aria-hidden />
            <span className="h-0.5 flex-1 bg-line" />
          </div>

          <Field
            label={`${swap.theyWant.name} — your session, for them`}
            htmlFor="mine"
            hint={empty(mine.data, 'You', swap.theyWant.name)}
          >
            <Select id="mine" value={mySlot} onChange={(e) => setMySlot(e.target.value)}>
              <option value="">Choose a time…</option>
              {(mine.data ?? []).map((s) => (
                <option key={s.id} value={s.id!}>
                  {dayLabel(s.starts_at!)} · {timeRange(s.starts_at!, s.ends_at!)} · {s.mode === 'online' ? 'Online' : 'In person'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Message" htmlFor="swapmsg" hint="Optional.">
            <Textarea
              id="swapmsg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Hi ${swap.partner.display_name.split(' ')[0]} — straight trade?`}
              maxLength={500}
            />
          </Field>

          <Button className="w-full" size="lg" variant="accent" onClick={submit} loading={busy}>
            Send swap proposal
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
