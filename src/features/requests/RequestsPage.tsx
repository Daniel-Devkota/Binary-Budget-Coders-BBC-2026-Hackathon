import { useEffect, useMemo, useState } from 'react'
import { HandHeart, HelpCircle, Inbox, Plus, Sparkles } from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import {
  createRequest, fetchCategories, fetchMyResponses, fetchRequests, fetchSkills,
} from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Field } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { DialogRoot, DialogContent } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/utils'
import { classifyRequest, proposeSkill, type Verdict } from './classify'
import { RequestCard, type RequestRow } from './RequestCard'
import { MyOfferCard, type MyOffer } from './MyOfferCard'
import { markRequestsSeen } from './useRequestActivity'

export function RequestsPage() {
  const { userId } = useAuth()
  const browse = useAsync(
    () => (userId ? fetchRequests({ excludeRequesterId: userId }) : Promise.resolve([])),
    [userId],
  )
  const mine = useAsync(
    () => (userId ? fetchRequests({ ownerId: userId }) : Promise.resolve([])),
    [userId],
  )
  const offers = useAsync(
    () => (userId ? fetchMyResponses(userId) : Promise.resolve([])),
    [userId],
  )
  const skills = useAsync(fetchSkills, [])
  const categories = useAsync(fetchCategories, [])
  const [open, setOpen] = useState(false)

  const reload = () => { void browse.reload(); void mine.reload(); void offers.reload() }

  const myRequests = (mine.data ?? []) as unknown as RequestRow[]
  const myOffers = (offers.data ?? []) as unknown as MyOffer[]
  const toAnswer = myRequests.reduce(
    (n, r) => n + (r.responses?.filter((x) => x.status === 'pending').length ?? 0),
    0,
  )
  const waiting = myOffers.filter((o) => o.status === 'pending')
  const settled = myOffers.filter((o) => o.status !== 'pending')

  // Landing here is what clears the accepted-offer half of the nav badge.
  useEffect(() => { markRequestsSeen() }, [])

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

      <Tabs defaultValue="open">
        <TabList className="flex-wrap">
          <Tab value="open">Open</Tab>
          <Tab value="asks">
            My asks {toAnswer > 0 && <Badge tone="amber" className="ml-1.5">{toAnswer}</Badge>}
          </Tab>
          <Tab value="offers">
            My offers {myOffers.length > 0 && <Badge tone="indigo" className="ml-1.5">{myOffers.length}</Badge>}
          </Tab>
        </TabList>

        <TabPanel value="open" className="pt-5 space-y-3">
          {browse.loading ? (
            <><CardSkeleton /><CardSkeleton /></>
          ) : browse.data?.length ? (
            (browse.data as unknown as RequestRow[]).map((r) => (
              <RequestCard key={r.id} request={r} userId={userId!} onChanged={reload} />
            ))
          ) : (
            <EmptyState
              icon={HelpCircle}
              title="No open requests"
              body="Be the first — describing what you want to learn is how you find the person who can teach it."
              action={<Button onClick={() => setOpen(true)}>Post a request</Button>}
            />
          )}
        </TabPanel>

        <TabPanel value="asks" className="pt-5 space-y-3">
          {mine.loading ? (
            <><CardSkeleton /><CardSkeleton /></>
          ) : myRequests.length ? (
            myRequests.map((r) => (
              <RequestCard key={r.id} request={r} userId={userId!} onChanged={reload} />
            ))
          ) : (
            <EmptyState
              icon={Inbox}
              title="You have not asked for anything yet"
              body="Say what you want to learn and the people who teach it will come to you."
              action={<Button onClick={() => setOpen(true)}>Post a request</Button>}
            />
          )}
        </TabPanel>

        <TabPanel value="offers" className="pt-5 space-y-3">
          {offers.loading ? (
            <><CardSkeleton /><CardSkeleton /></>
          ) : myOffers.length ? (
            <>
              {waiting.map((o) => <MyOfferCard key={o.id} offer={o} />)}
              {settled.length > 0 && (
                <>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint pt-3">Settled</h2>
                  {settled.map((o) => <MyOfferCard key={o.id} offer={o} />)}
                </>
              )}
            </>
          ) : (
            <EmptyState
              icon={HandHeart}
              title="You have not offered to teach anything"
              body="Anything on the Open tab you could help with, say so — it is the fastest way to find your first learner."
            />
          )}
        </TabPanel>
      </Tabs>

      {open && (
        <NewRequestDialog
          open={open}
          onOpenChange={setOpen}
          userId={userId!}
          skills={skills.data ?? []}
          categories={categories.data ?? []}
          onDone={reload}
        />
      )}
    </div>
  )
}

type Step = 'compose' | 'verdict' | 'newSkill'

/**
 * Propose, then confirm. Nothing is written until the second step, so the
 * verdict is something you answer rather than something you read after the fact.
 */
function NewRequestDialog({
  open, onOpenChange, userId, skills, categories, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  userId: string
  skills: import('@/types/models').SkillWithCategory[]
  categories: import('@/types/models').SkillCategory[]
  onDone: () => void
}) {
  const [step, setStep] = useState<Step>('compose')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skillId, setSkillId] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [newName, setNewName] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Skills whose name shares a word with the title float to the top, so the
  // picker is already useful before anyone types into its filter box.
  const skillOptions = useMemo(() => {
    const words = new Set(title.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 2))
    const ranked = [...skills].sort((a, b) => {
      const hit = (s: string) => (s.toLowerCase().split(/[^a-z0-9+#]+/).some((w) => words.has(w)) ? 0 : 1)
      return hit(a.name) - hit(b.name) || a.name.localeCompare(b.name)
    })
    return [
      { value: '', label: 'Not sure — let the AI work it out' },
      ...ranked.map((s) => ({ value: s.id, label: s.name })),
    ]
  }, [skills, title])

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  )

  const post = async (resolvedSkillId: string | null, aiVerdict: Verdict | null, status: string) => {
    await createRequest({
      requester_id: userId,
      title: title.trim(),
      description: description.trim(),
      resolved_skill_id: resolvedSkillId,
      status,
      ai_verdict: aiVerdict as never,
    })
    onOpenChange(false)
    onDone()
  }

  // Step 1. A picked skill skips the model entirely — someone who knows what
  // they want should not have to be told what they want.
  const submitCompose = async () => {
    if (!title.trim()) { toast.error('Give it a title.'); return }
    setBusy(true)
    try {
      if (skillId) {
        await post(skillId, null, 'open')
        toast.success('Posted. The people who teach it can see it now.')
        return
      }
      const v = await classifyRequest(title, description, skills)
      setVerdict(v)
      if (v.matchedSkillId) {
        setStep('verdict')
      } else {
        setNewName(title.trim().slice(0, 80))
        setCategoryId((c) => c || categories[0]?.id || '')
        setStep('newSkill')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmMatch = async () => {
    setBusy(true)
    try {
      await post(verdict!.matchedSkillId, verdict, 'open')
      toast.success(`Posted under ${verdict!.matchedSkillName}.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const submitNewSkill = async () => {
    if (!newName.trim()) { toast.error('Give the skill a name.'); return }
    if (!categoryId) { toast.error('Pick a category.'); return }
    setBusy(true)
    try {
      const created = await proposeSkill({
        name: newName.trim(),
        categoryId,
        title: title.trim(),
        description: description.trim(),
        skills,
      })
      await post(created.skillId, verdict, 'open')
      toast.success(
        created.matched
          ? 'Turns out that one already exists — your request is posted under it.'
          : created.status === 'approved'
            ? `${newName.trim()} is in the catalog now, and your request is live.`
            : 'Posted. The skill joins the catalog once someone has checked it.',
      )
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = {
    compose: {
      title: 'Ask for a skill',
      description: 'Describe what you want to learn. We match it to the catalog so the right tutors see it.',
    },
    verdict: {
      title: 'Does this look right?',
      description: 'Nothing is posted until you say so.',
    },
    newSkill: {
      title: 'Name the skill',
      description: 'Nothing in the catalog fits, so this one is yours to name.',
    },
  }[step]

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={copy.title} description={copy.description}>
        {step === 'compose' && (
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
            <Field label="Is it one of these?" hint="Leave it be and the AI will have a go at matching it.">
              <SelectMenu
                value={skillId}
                onChange={setSkillId}
                options={skillOptions}
                label="Not sure — let the AI work it out"
                searchable
                searchPlaceholder="Search the catalog…"
                className="w-full"
              />
            </Field>
            <Button className="w-full" size="lg" onClick={submitCompose} loading={busy}>
              {skillId ? 'Post request' : 'Match it and post'}
            </Button>
          </div>
        )}

        {step === 'verdict' && verdict && (
          <div className="space-y-4">
            <div className="space-y-2 bg-indigo-50 border-2 border-indigo-200 rounded-[12px] p-3">
              <p className="flex items-start gap-2 text-sm font-semibold">
                <Sparkles className="size-4 mt-0.5 shrink-0 text-indigo-500" aria-hidden />
                This looks like {verdict.matchedSkillName}
              </p>
              <p className="text-sm text-ink-soft pl-6">{verdict.reasoning}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={confirmMatch} loading={busy}>
                Post to {verdict.matchedSkillName}
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setNewName(title.trim().slice(0, 80))
                  setCategoryId((c) => c || categories[0]?.id || '')
                  setStep('newSkill')
                }}
              >
                It is something different
              </Button>
            </div>
          </div>
        )}

        {step === 'newSkill' && (
          <div className="space-y-4">
            {verdict && !verdict.matchedSkillId && (
              <p className="flex items-start gap-2 text-sm bg-indigo-50 border-2 border-indigo-200 rounded-[12px] p-3">
                <Sparkles className="size-4 mt-0.5 shrink-0 text-indigo-500" aria-hidden />
                {verdict.reasoning}
              </p>
            )}
            <Field label="Name the skill" htmlFor="rn" hint="Short and plain — how someone would search for it.">
              <Input
                id="rn"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Auslan"
                maxLength={80}
              />
            </Field>
            <Field label="Category">
              <SelectMenu
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions}
                label="Pick a category"
                className="w-full"
              />
            </Field>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={submitNewSkill} loading={busy}>
                Post as a new skill
              </Button>
              <Button className="flex-1" variant="outline" disabled={busy} onClick={() => setStep('compose')}>
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  )
}
