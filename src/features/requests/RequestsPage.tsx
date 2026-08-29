import { useState } from 'react'
import { HelpCircle, Plus, Send, Sparkles } from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import { createRequest, fetchRequests, fetchSkills, respondToRequest } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Field } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/Toast'
import { PersonRow } from '@/components/domain/PersonRow'
import { SkillPill } from '@/components/domain/SkillPill'
import { relative } from '@/lib/format'
import { errorMessage } from '@/lib/utils'
import { classifyRequest } from './classify'

export function RequestsPage() {
  const { userId } = useAuth()
  const requests = useAsync(fetchRequests, [])
  const skills = useAsync(fetchSkills, [])
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl">Skill requests</h1>
          <p className="text-ink-soft">
            Nobody teaching what you need? Ask. Tutors read this page looking for people to help.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> Post a request
        </Button>
      </div>

      {requests.loading ? (
        <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>
      ) : requests.data?.length ? (
        <div className="space-y-3">
          {requests.data.map((r) => (
            <RequestCard
              key={r.id}
              request={r as unknown as RequestRow}
              userId={userId!}
              onChanged={() => void requests.reload()}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={HelpCircle}
          title="No open requests"
          body="Be the first — describing what you want to learn is how you find the person who can teach it."
          action={<Button onClick={() => setOpen(true)}>Post a request</Button>}
        />
      )}

      {open && (
        <NewRequestDialog
          open={open}
          onOpenChange={setOpen}
          userId={userId!}
          skills={skills.data ?? []}
          onDone={() => void requests.reload()}
        />
      )}
    </div>
  )
}

type RequestRow = {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  requester: { id: string; display_name: string; avatar_url: string | null; city: string | null }
  resolved_skill: { name: string; slug: string; category?: { slug: string } | null } | null
  responses: { id: string; teacher_id: string; message: string | null; teacher: { id: string; display_name: string; avatar_url: string | null; city: string | null } }[]
}

function RequestCard({ request: r, userId, onChanged }: { request: RequestRow; userId: string; onChanged: () => void }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [openForm, setOpenForm] = useState(false)
  const mine = r.requester.id === userId
  const alreadyAnswered = r.responses?.some((x) => x.teacher_id === userId)

  const respond = async () => {
    setBusy(true)
    try {
      await respondToRequest(r.id, userId, message.trim())
      toast.success('Sent. They can message you from here.')
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
          {r.responses?.length > 0 && (
            <Badge tone="moss">{r.responses.length} offer{r.responses.length === 1 ? '' : 's'}</Badge>
          )}
          {!mine && !alreadyAnswered && (
            <Button size="sm" variant="outline" onClick={() => setOpenForm((v) => !v)}>
              <Send className="size-3.5" aria-hidden /> I can teach this
            </Button>
          )}
          {alreadyAnswered && <Badge tone="indigo">You offered</Badge>}
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

      {mine && r.responses?.length > 0 && (
        <ul className="space-y-2 pt-2 border-t-2 border-line">
          {r.responses.map((resp) => (
            <li key={resp.id} className="space-y-1">
              <PersonRow person={resp.teacher} size="sm" />
              {resp.message && <p className="text-sm text-ink-soft pl-11">{resp.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function NewRequestDialog({
  open, onOpenChange, userId, skills, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  userId: string
  skills: import('@/types/models').SkillWithCategory[]
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Awaited<ReturnType<typeof classifyRequest>> | null>(null)

  const submit = async () => {
    if (!title.trim()) { toast.error('Give it a title.'); return }
    setBusy(true)
    try {
      const v = await classifyRequest(title, description, skills)
      setVerdict(v)
      await createRequest({
        requester_id: userId,
        title: title.trim(),
        description: description.trim(),
        resolved_skill_id: v.matchedSkillId,
        status: v.matchedSkillId ? 'open' : 'pending_review',
        ai_verdict: v as never,
      })
      toast.success(
        v.matchedSkillId
          ? `Matched to ${v.matchedSkillName}. Your request is live.`
          : 'Posted. We will add it to the catalog after a quick review.',
      )
      onOpenChange(false)
      onDone()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Ask for a skill"
        description="Describe what you want to learn. We match it to the catalog so the right tutors see it."
      >
        <div className="space-y-4">
          <Field label="What do you want to learn?" htmlFor="rt">
            <Input
              id="rt"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Anyone teach Auslan around Newtown?"
              maxLength={120}
            />
          </Field>
          <Field label="A bit more" htmlFor="rd" hint="Where you are up to, and what you could offer in return.">
            <Textarea
              id="rd"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              rows={4}
            />
          </Field>
          {verdict && (
            <p className="flex items-start gap-2 text-sm bg-indigo-50 border-2 border-indigo-200 rounded-[12px] p-3">
              <Sparkles className="size-4 mt-0.5 shrink-0 text-indigo-500" aria-hidden />
              {verdict.reasoning}
            </p>
          )}
          <Button className="w-full" size="lg" onClick={submit} loading={busy}>
            Post request
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
