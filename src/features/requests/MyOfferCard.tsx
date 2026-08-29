import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessagesSquare } from 'lucide-react'
import { openConversation } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { PersonRow } from '@/components/domain/PersonRow'
import { SkillPill } from '@/components/domain/SkillPill'
import { relative } from '@/lib/format'
import { errorMessage } from '@/lib/utils'

export type MyOffer = {
  id: string
  message: string | null
  status: string
  created_at: string
  responded_at: string | null
  request: {
    id: string
    title: string
    status: string
    requester: { id: string; display_name: string; avatar_url: string | null; city: string | null }
    resolved_skill: { name: string; slug: string; category?: { slug: string } | null } | null
  } | null
}

const outcome: Record<string, { tone: 'indigo' | 'moss' | 'neutral'; label: string }> = {
  pending: { tone: 'indigo', label: 'Waiting' },
  accepted: { tone: 'moss', label: 'Accepted' },
  declined: { tone: 'neutral', label: 'Declined' },
}

/** An offer you made, and what became of it — including on asks that have since closed. */
export function MyOfferCard({ offer }: { offer: MyOffer }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const r = offer.request
  const badge = outcome[offer.status] ?? outcome.pending

  const message = async () => {
    if (!r) return
    setBusy(true)
    try {
      navigate(`/messages/${await openConversation(r.requester.id)}`)
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
          <h2 className="text-lg leading-tight">{r?.title ?? 'A request that has since been removed'}</h2>
          <p className="text-xs text-ink-faint">You offered {relative(offer.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          {r?.resolved_skill && <SkillPill skill={r.resolved_skill as never} />}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </div>

      {offer.message && <p className="text-sm text-ink-soft">{offer.message}</p>}

      {r && (
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t-2 border-line">
          <PersonRow person={r.requester} size="sm" subtitle="asked for this" />
          {offer.status === 'accepted' && (
            <Button size="sm" variant="outline" onClick={() => void message()} loading={busy}>
              <MessagesSquare className="size-3.5" aria-hidden /> Open the conversation
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
