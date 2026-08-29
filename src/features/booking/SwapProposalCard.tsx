import { useState } from 'react'
import { ArrowLeftRight, Check, X, Undo2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'
import { PersonRow } from '@/components/domain/PersonRow'
import { SkillPill } from '@/components/domain/SkillPill'
import { dayLabel, timeRange } from '@/lib/format'
import { respondToSwap, withdrawSwap } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { useAuth } from '@/stores/authStore'
import type { SwapProposalWithContext } from '@/types/models'

const tone = { pending: 'amber', accepted: 'moss', declined: 'clay', withdrawn: 'neutral' } as const

export function SwapProposalCard({
  proposal,
  onChanged,
}: {
  proposal: SwapProposalWithContext
  onChanged: () => void
}) {
  const userId = useAuth((s) => s.userId)
  const [busy, setBusy] = useState(false)
  const iAmResponder = proposal.responder_id === userId
  const other = iAmResponder ? proposal.proposer : proposal.responder

  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const Leg = ({
    label,
    slot,
  }: {
    label: string
    slot: SwapProposalWithContext['responder_slot']
  }) => (
    <div className="flex-1 min-w-0 rounded-[12px] border-2 border-line bg-paper-deep p-3 space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <SkillPill skill={slot.skill as never} />
      <p className="text-sm font-semibold">
        {dayLabel(slot.starts_at)} · {timeRange(slot.starts_at, slot.ends_at)}
      </p>
    </div>
  )

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <PersonRow
          person={other}
          size="sm"
          subtitle={iAmResponder ? 'proposed a swap' : 'you proposed a swap'}
        />
        <Badge tone={tone[proposal.status as keyof typeof tone]}>{proposal.status}</Badge>
      </div>

      <div className="flex items-stretch gap-2 flex-col sm:flex-row">
        {/* proposer_slot is the proposer's hour; responder_slot is the responder's. */}
        <Leg label={iAmResponder ? 'They teach' : 'You teach'} slot={proposal.proposer_slot} />
        <div className="grid place-items-center px-1">
          <ArrowLeftRight className="size-4 text-ink-faint sm:rotate-0 rotate-90" aria-hidden />
        </div>
        <Leg label={iAmResponder ? 'You teach' : 'They teach'} slot={proposal.responder_slot} />
      </div>

      {proposal.message && (
        <p className="text-sm text-ink-soft italic border-l-4 border-line-strong pl-3">
          “{proposal.message}”
        </p>
      )}

      {proposal.status === 'pending' && (
        <div className="flex gap-2">
          {iAmResponder ? (
            <>
              <Button size="sm" loading={busy} onClick={() => act(() => respondToSwap(proposal.id, true), 'Swap accepted. Two sessions are on your calendar.')}>
                <Check className="size-3.5" aria-hidden /> Accept swap
              </Button>
              <Button size="sm" variant="ghost" loading={busy} onClick={() => act(() => respondToSwap(proposal.id, false), 'Declined.')}>
                <X className="size-3.5" aria-hidden /> Decline
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => act(() => withdrawSwap(proposal.id), 'Withdrawn.')}>
              <Undo2 className="size-3.5" aria-hidden /> Withdraw
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
