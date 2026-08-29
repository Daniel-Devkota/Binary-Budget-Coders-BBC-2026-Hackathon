import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { answerOffer } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'
import { PersonRow } from '@/components/domain/PersonRow'
import { relative } from '@/lib/format'
import { errorMessage } from '@/lib/utils'

export type OfferResponse = {
  id: string
  teacher_id: string
  message: string | null
  status: string
  created_at: string
  responded_at: string | null
  teacher: { id: string; display_name: string; avatar_url: string | null; city: string | null }
}

/**
 * One offer to teach, on your own ask, with the two things you can do about it.
 * Accepting hands back a conversation id, so the next thing you see is the
 * thread with that person rather than a toast.
 */
export function OfferRow({ offer, onChanged }: { offer: OfferResponse; onChanged: () => void }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  const answer = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline')
    try {
      const conversationId = await answerOffer(offer.id, accept)
      onChanged()
      if (accept && conversationId) {
        toast.success(`You and ${offer.teacher.display_name} can sort out a time here.`)
        navigate(`/messages/${conversationId}`)
      } else {
        toast.success('Declined. They can see the outcome under their offers.')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PersonRow
          person={offer.teacher}
          size="sm"
          subtitle={`offered ${relative(offer.created_at)}`}
        />
        {offer.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void answer(true)} loading={busy === 'accept'} disabled={busy !== null}>
              <Check className="size-3.5" aria-hidden /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void answer(false)}
              loading={busy === 'decline'}
              disabled={busy !== null}
            >
              <X className="size-3.5" aria-hidden /> Decline
            </Button>
          </div>
        ) : (
          <Badge tone={offer.status === 'accepted' ? 'moss' : 'neutral'}>
            {offer.status === 'accepted' ? 'Accepted' : 'Declined'}
          </Badge>
        )}
      </div>
      {offer.message && <p className="text-sm text-ink-soft pl-11">{offer.message}</p>}
    </li>
  )
}
