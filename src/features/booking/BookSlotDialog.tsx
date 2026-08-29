import { useState } from 'react'
import { Coins, Repeat2, Video, MapPin, AlertTriangle } from 'lucide-react'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea, Field, Select } from '@/components/ui/Input'
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { SkillPill } from '@/components/domain/SkillPill'
import { useAsync } from '@/lib/useAsync'
import { useAuth } from '@/stores/authStore'
import { bookWithToken, fetchMySlots, proposeSwap } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { dayLabel, timeRange } from '@/lib/format'
import type { SlotWithContext } from '@/types/models'

export function BookSlotDialog({
  slot,
  open,
  onOpenChange,
  onDone,
}: {
  slot: SlotWithContext
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone?: () => void
}) {
  const { profile, refreshProfile, userId } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [offerSlotId, setOfferSlotId] = useState('')

  const mySlots = useAsync(
    async () => (userId ? (await fetchMySlots(userId)).filter((s) => s.status === 'open') : []),
    [userId],
  )

  const canAfford = (profile?.token_balance ?? 0) >= 1

  const doToken = async () => {
    setBusy(true)
    try {
      await bookWithToken(slot.id!)
      await refreshProfile()
      toast.success('Booked. The meeting details are on your sessions page.')
      onDone?.()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const doSwap = async () => {
    if (!offerSlotId) { toast.error('Pick one of your own slots to offer.'); return }
    setBusy(true)
    try {
      await proposeSwap({
        responderSlotId: slot.id!,
        proposerSlotId: offerSlotId,
        message: message.trim() || undefined,
      })
      toast.success('Swap proposed. You will hear back on your sessions page.')
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
        title={`Book ${slot.skill?.name ?? 'this session'}`}
        description={`with ${slot.teacher?.display_name ?? 'this teacher'}`}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-[12px] bg-paper-deep border-2 border-line">
            <SkillPill skill={slot.skill} as="span" />
            <span className="text-sm font-semibold">
              {dayLabel(slot.starts_at!)} · {timeRange(slot.starts_at!, slot.ends_at!)}
            </span>
            <span className="text-xs text-ink-soft flex items-center gap-1 ml-auto">
              {slot.mode === 'online' ? (
                <><Video className="size-3.5" aria-hidden /> Online</>
              ) : (
                <><MapPin className="size-3.5" aria-hidden /> In person</>
              )}
            </span>
          </div>

          <Tabs defaultValue="token">
            <TabList className="w-full">
              <Tab value="token" className="flex-1">
                <span className="inline-flex items-center gap-1.5"><Coins className="size-3.5" aria-hidden /> Pay a token</span>
              </Tab>
              <Tab value="swap" className="flex-1">
                <span className="inline-flex items-center gap-1.5"><Repeat2 className="size-3.5" aria-hidden /> Swap a lesson</span>
              </Tab>
            </TabList>

            <TabPanel value="token" className="pt-4 space-y-4">
              <p className="text-sm text-ink-soft">
                One token is held now and released to {slot.teacher?.display_name?.split(' ')[0] ?? 'the teacher'}{' '}
                once you confirm the session happened. Cancel any time before it starts and you get it back.
              </p>
              <div className="flex items-center justify-between p-3 rounded-[12px] border-2 border-line bg-white">
                <span className="text-sm font-semibold">Your balance</span>
                <span className="font-display font-bold tabular-nums">
                  {profile?.token_balance ?? 0} → {Math.max(0, (profile?.token_balance ?? 0) - 1)}
                </span>
              </div>
              {!canAfford && (
                <p className="flex items-start gap-2 text-sm text-clay-600 bg-clay-100 border-2 border-clay-500/40 rounded-[12px] p-3">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
                  You are out of tokens. Teach a session to earn one, or propose a swap instead — swaps
                  cost nothing.
                </p>
              )}
              <Button className="w-full" size="lg" onClick={doToken} loading={busy} disabled={!canAfford}>
                Confirm booking
              </Button>
            </TabPanel>

            <TabPanel value="swap" className="pt-4 space-y-4">
              <p className="text-sm text-ink-soft">
                Offer one of your own open slots in return. No tokens move in either direction — you
                each teach an hour.
              </p>
              <Field
                label="The slot you are offering"
                htmlFor="offer"
                hint={
                  mySlots.data && mySlots.data.length === 0
                    ? 'You have no open slots yet. Publish one from your profile first.'
                    : undefined
                }
              >
                <Select id="offer" value={offerSlotId} onChange={(e) => setOfferSlotId(e.target.value)}>
                  <option value="">Choose one of your slots…</option>
                  {(mySlots.data ?? []).map((s) => (
                    <option key={s.id} value={s.id!}>
                      {s.skill?.name} — {dayLabel(s.starts_at!)} {timeRange(s.starts_at!, s.ends_at!)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Message" htmlFor="msg" hint="Optional, but a line about why helps.">
                <Textarea
                  id="msg"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="I teach guitar and you want it — straight trade?"
                  maxLength={500}
                />
              </Field>
              <Button
                className="w-full"
                size="lg"
                variant="accent"
                onClick={doSwap}
                loading={busy}
                disabled={!mySlots.data?.length}
              >
                Send swap proposal
              </Button>
            </TabPanel>
          </Tabs>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
