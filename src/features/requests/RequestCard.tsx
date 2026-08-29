import { useState } from 'react'
import { Send } from 'lucide-react'
import { respondToRequest } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'
import { PersonRow } from '@/components/domain/PersonRow'
import { SkillPill } from '@/components/domain/SkillPill'
import { relative } from '@/lib/format'
import { errorMessage } from '@/lib/utils'
import { OfferRow, type OfferResponse } from './OfferRow'

export type RequestRow = {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  requester: { id: string; display_name: string; avatar_url: string | null; city: string | null }
  resolved_skill: { name: string; slug: string; category?: { slug: string } | null } | null
  responses: OfferResponse[]
}

/** One skill request: the inline "I can teach this" form when it is someone else's, the offers with actions when it is yours. */
export function RequestCard({ request: r, userId, onChanged }: { request: RequestRow; userId: string; onChanged: () => void }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [openForm, setOpenForm] = useState(false)
  const mine = r.requester.id === userId
  const myOffer = r.responses?.find((x) => x.teacher_id === userId)
  const pendingOffers = r.responses?.filter((x) => x.status === 'pending') ?? []
  const settled = r.status === 'fulfilled' || r.status === 'rejected'

  const respond = async () => {
    setBusy(true)
    try {
      await respondToRequest(r.id, userId, message.trim())
      toast.success('Sent. They can accept it from their asks.')
      setOpenForm(false)
      setMessage('')
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
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg leading-tight">{r.title}</h2>
          {r.description && <p className="text-sm text-ink-soft">{r.description}</p>}
        </div>
        {r.resolved_skill ? (
          <SkillPill skill={r.resolved_skill as never} />
        ) : (
          <Badge tone="amber">New skill</Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PersonRow person={r.requester} size="sm" subtitle={`asked ${relative(r.created_at)}`} />
        <div className="flex items-center gap-2">
          {r.status === 'fulfilled' && <Badge tone="moss">Sorted</Badge>}
          {r.status === 'rejected' && <Badge tone="neutral">Closed</Badge>}
          {mine && pendingOffers.length > 0 && (
            <Badge tone="amber">
              {pendingOffers.length} to answer
            </Badge>
          )}
          {!mine && r.responses?.length > 0 && (
            <Badge tone="moss">{r.responses.length} offer{r.responses.length === 1 ? '' : 's'}</Badge>
          )}
          {!mine && !myOffer && !settled && (
            <Button size="sm" variant="outline" onClick={() => setOpenForm((v) => !v)}>
              <Send className="size-3.5" aria-hidden /> I can teach this
            </Button>
          )}
          {!mine && myOffer && (
            <Badge tone={myOffer.status === 'accepted' ? 'moss' : myOffer.status === 'declined' ? 'neutral' : 'indigo'}>
              {myOffer.status === 'accepted'
                ? 'They accepted'
                : myOffer.status === 'declined'
                  ? 'Not this time'
                  : 'You offered'}
            </Badge>
          )}
        </div>
      </div>

      {openForm && (
        <div className="space-y-2 pt-2 border-t-2 border-line">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="I teach this — here is how I would approach it with you…"
            maxLength={400}
            aria-label="Your offer"
          />
          <Button size="sm" onClick={respond} loading={busy}>Send offer</Button>
        </div>
      )}

      {mine && (
        r.responses?.length > 0 ? (
          <ul className="space-y-3 pt-3 border-t-2 border-line">
            {r.responses.map((offer) => (
              <OfferRow key={offer.id} offer={offer} onChanged={onChanged} />
            ))}
          </ul>
        ) : (
          <p className="pt-3 border-t-2 border-line text-sm text-ink-faint">
            No offers yet. Tutors read this page looking for people to help.
          </p>
        )
      )}
    </Card>
  )
}
