import { useState } from 'react'
import { HelpCircle, Plus, Sparkles } from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import { createRequest, fetchRequests, fetchSkills } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Field } from '@/components/ui/Input'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/utils'
import { classifyRequest } from './classify'
import { RequestCard, type RequestRow } from './RequestCard'

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
