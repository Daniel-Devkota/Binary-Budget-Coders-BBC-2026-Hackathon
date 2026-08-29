import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GraduationCap, Lightbulb, Plus, Trash2, CalendarPlus, Video, MapPin, Save } from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import {
  addUserSkill, createSlot, deleteSlot, fetchMySlots, fetchSkills, fetchUserSkills,
  removeUserSkill, uploadImage,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select, Field } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import { SkillPill } from '@/components/domain/SkillPill'
import { dayLabel, timeRange } from '@/lib/format'
import { errorMessage } from '@/lib/utils'
import { SESSION_MINUTES } from '@/lib/constants'
import type { SkillWithCategory } from '@/types/models'

const TABS = ['skills', 'slots', 'about'] as const

export function ProfilePage() {
  const { profile, userId, refreshProfile } = useAuth()
  // ?tab= makes every panel linkable, so Home and the header menu can drop you
  // straight onto the right one.
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = TABS.includes(raw as (typeof TABS)[number]) ? raw! : 'skills'
  const skills = useAsync(fetchSkills, [])
  const mySkills = useAsync(() => (userId ? fetchUserSkills(userId) : Promise.resolve([])), [userId])
  const mySlots = useAsync(() => (userId ? fetchMySlots(userId) : Promise.resolve([])), [userId])

  if (!profile) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl">Your profile</h1>
        <p className="text-ink-soft">
          Two lists and a calendar. That is all the platform needs to start matching you.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabList className="flex-wrap">
          <Tab value="skills">Skills</Tab>
          <Tab value="slots">Availability</Tab>
          <Tab value="about">About you</Tab>
        </TabList>

        <TabPanel value="skills" className="pt-5 space-y-5">
          <SkillManager
            kind="teach"
            title="What you can teach"
            blurb="Be generous. The bar is lower than you think — you only need to be a step ahead."
            icon={GraduationCap}
            all={skills.data ?? []}
            mine={mySkills.data ?? []}
            loading={mySkills.loading}
            userId={userId!}
            onChanged={() => void mySkills.reload()}
          />
          <SkillManager
            kind="learn"
            title="What you want to learn"
            blurb="Each one you add multiplies the chance of a perfect two-way swap."
            icon={Lightbulb}
            all={skills.data ?? []}
            mine={mySkills.data ?? []}
            loading={mySkills.loading}
            userId={userId!}
            onChanged={() => void mySkills.reload()}
          />
        </TabPanel>

        <TabPanel value="slots" className="pt-5">
          <SlotManager
            userId={userId!}
            teachSkills={(mySkills.data ?? []).filter((s) => s.kind === 'teach').map((s) => s.skill)}
            slots={mySlots.data ?? []}
            loading={mySlots.loading}
            onChanged={() => void mySlots.reload()}
          />
        </TabPanel>

        <TabPanel value="about" className="pt-5">
          <AboutForm profile={profile} onSaved={refreshProfile} />
        </TabPanel>
      </Tabs>
    </div>
  )
}

// ─── skills ──────────────────────────────────────────────────────────────────
const PROFICIENCY = ['beginner', 'intermediate', 'advanced', 'expert'] as const

function SkillManager({
  kind, title, blurb, icon: Icon, all, mine, loading, userId, onChanged,
}: {
  kind: 'teach' | 'learn'
  title: string
  blurb: string
  icon: typeof GraduationCap
  all: SkillWithCategory[]
  mine: { id: string; kind: string; skill: SkillWithCategory; proficiency: string | null; blurb: string | null }[]
  loading: boolean
  userId: string
  onChanged: () => void
}) {
  const [skillId, setSkillId] = useState('')
  const [proficiency, setProficiency] = useState<string>('intermediate')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const owned = mine.filter((m) => m.kind === kind)
  const ownedIds = new Set(owned.map((m) => m.skill.id))

  const add = async () => {
    if (!skillId) { toast.error('Pick a skill first.'); return }
    setBusy(true)
    try {
      await addUserSkill({
        user_id: userId,
        skill_id: skillId,
        kind,
        proficiency: kind === 'teach' ? proficiency : 'beginner',
        blurb: note.trim() || null,
      })
      setSkillId(''); setNote('')
      toast.success('Added.')
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await removeUserSkill(id)
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Icon className={kind === 'teach' ? 'size-4 text-moss-500' : 'size-4 text-amber-500'} aria-hidden />
          {title}
        </CardTitle>
        <p className="text-sm text-ink-soft">{blurb}</p>
      </CardHeader>
      <CardBody className="space-y-4">
        {loading ? (
          <Skeleton className="h-9 w-full" />
        ) : owned.length ? (
          <ul className="flex flex-wrap gap-2">
            {owned.map((m) => (
              <li key={m.id} className="flex items-center gap-1">
                <SkillPill skill={m.skill} as="span" />
                {kind === 'teach' && m.proficiency && (
                  <Badge tone="neutral" className="hidden sm:inline-flex">{m.proficiency}</Badge>
                )}
                <button
                  onClick={() => void remove(m.id)}
                  aria-label={`Remove ${m.skill.name}`}
                  className="grid place-items-center size-7 rounded-[8px] border-2 border-line-strong text-ink-faint hover:text-clay-500 hover:border-clay-500"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">Nothing here yet.</p>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-end pt-2 border-t-2 border-line">
          <Field label="Add a skill" htmlFor={`add-${kind}`}>
            <Select id={`add-${kind}`} value={skillId} onChange={(e) => setSkillId(e.target.value)}>
              <option value="">Choose…</option>
              {all.filter((s) => !ownedIds.has(s.id)).map((s) => (
                <option key={s.id} value={s.id}>{s.category?.name} · {s.name}</option>
              ))}
            </Select>
          </Field>
          {kind === 'teach' && (
            <Field label="Level" htmlFor={`prof-${kind}`}>
              <Select id={`prof-${kind}`} value={proficiency} onChange={(e) => setProficiency(e.target.value)}>
                {PROFICIENCY.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          )}
          <Button onClick={add} loading={busy}>
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'teach' ? 'A line about how you teach it (optional)' : 'Where you are up to (optional)'}
          maxLength={200}
          aria-label="Note"
        />
      </CardBody>
    </Card>
  )
}

// ─── availability ────────────────────────────────────────────────────────────
function SlotManager({
  userId, teachSkills, slots, loading, onChanged,
}: {
  userId: string
  teachSkills: SkillWithCategory[]
  slots: { id: string | null; skill: SkillWithCategory; starts_at: string | null; ends_at: string | null; mode: string | null; status: string | null }[]
  loading: boolean
  onChanged: () => void
}) {
  const [skillId, setSkillId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('18:00')
  const [mode, setMode] = useState<'online' | 'in_person'>('online')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)

  const publish = async () => {
    if (!skillId || !date || !time) { toast.error('Pick a skill, a date and a time.'); return }
    const starts = new Date(`${date}T${time}`)
    if (starts.getTime() < Date.now()) { toast.error('That time has already passed.'); return }
    const ends = new Date(starts.getTime() + SESSION_MINUTES * 60_000)

    setBusy(true)
    try {
      await createSlot({
        teacher_id: userId,
        skill_id: skillId,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        mode,
        meeting_url: mode === 'online' ? meetingUrl.trim() || null : null,
        location_text: mode === 'in_person' ? place.trim() || null : null,
      })
      toast.success('Slot published. It is now searchable.')
      setDate(''); setMeetingUrl(''); setPlace('')
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const upcoming = slots.filter((s) => s.starts_at && new Date(s.starts_at) >= new Date())

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4 text-indigo-500" aria-hidden /> Publish an hour
          </CardTitle>
          <p className="text-sm text-ink-soft">
            Sessions are {SESSION_MINUTES} minutes. The link or address stays hidden until somebody books.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {teachSkills.length === 0 ? (
            <p className="text-sm text-clay-600 bg-clay-100 border-2 border-clay-500/40 rounded-[12px] p-3">
              Add something to your teach list first — you can only offer hours in skills you teach.
            </p>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Skill" htmlFor="slot-skill">
                  <Select id="slot-skill" value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                    <option value="">Choose…</option>
                    {teachSkills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="Date" htmlFor="slot-date">
                  <Input id="slot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Start time" htmlFor="slot-time">
                  <Input id="slot-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} step={900} />
                </Field>
              </div>

              <div className="flex gap-1 p-1 bg-paper-deep border-2 border-line-strong rounded-[12px] w-fit">
                {([
                  { v: 'online', l: 'Online', I: Video },
                  { v: 'in_person', l: 'In person', I: MapPin },
                ] as const).map(({ v, l, I }) => (
                  <button
                    key={v}
                    onClick={() => setMode(v)}
                    aria-pressed={mode === v}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-[9px] text-[13px] font-semibold ${
                      mode === v ? 'bg-white shadow-[2px_2px_0_0_var(--color-line-strong)]' : 'text-ink-soft'
                    }`}
                  >
                    <I className="size-3.5" aria-hidden /> {l}
                  </button>
                ))}
              </div>

              {mode === 'online' ? (
                <Field label="Meeting link" htmlFor="slot-url" hint="Revealed only once the session is confirmed.">
                  <Input id="slot-url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" />
                </Field>
              ) : (
                <Field label="Where to meet" htmlFor="slot-place" hint="Revealed only once the session is confirmed.">
                  <Input id="slot-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Fisher Library, level 2" />
                </Field>
              )}

              <Button onClick={publish} loading={busy}>
                <Plus className="size-4" aria-hidden /> Publish slot
              </Button>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your published hours</CardTitle></CardHeader>
        <CardBody>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : upcoming.length ? (
            <ul className="divide-y-2 divide-line -my-2">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3 flex-wrap">
                  <SkillPill skill={s.skill} as="span" />
                  <span className="text-sm font-semibold">
                    {dayLabel(s.starts_at!)} · {timeRange(s.starts_at!, s.ends_at!)}
                  </span>
                  <Badge tone={s.mode === 'online' ? 'indigo' : 'amber'}>
                    {s.mode === 'online' ? 'Online' : 'In person'}
                  </Badge>
                  <Badge tone={s.status === 'open' ? 'moss' : 'neutral'}>{s.status}</Badge>
                  {s.status === 'open' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={async () => {
                        try { await deleteSlot(s.id!); onChanged() } catch (e) { toast.error(errorMessage(e)) }
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden /> Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarPlus}
              title="No hours published"
              body="An open hour is what makes you findable — and it is what you trade in a swap."
              className="border-none shadow-none"
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}

// ─── about ───────────────────────────────────────────────────────────────────
function AboutForm({ profile, onSaved }: { profile: import('@/types/models').Profile; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    display_name: profile.display_name,
    headline: profile.headline ?? '',
    bio: profile.bio ?? '',
    city: profile.city ?? '',
    country: profile.country ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update(form).eq('id', profile.id)
      if (error) throw error
      await onSaved()
      toast.success('Saved.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const changeAvatar = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadImage('avatars', profile.id, file)
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
      if (error) throw error
      await onSaved()
      toast.success('New photo.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4 pt-5">
        <div className="flex items-center gap-4">
          <Avatar name={profile.display_name} src={profile.avatar_url} id={profile.id} size="xl" />
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-2 h-10 px-4 border-2 border-line-strong bg-white rounded-[12px] text-sm font-semibold hover:bg-paper-deep">
              {uploading ? 'Uploading…' : 'Change photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void changeAvatar(f) }}
            />
          </label>
        </div>

        <Field label="Display name" htmlFor="dn">
          <Input id="dn" value={form.display_name} onChange={set('display_name')} maxLength={60} />
        </Field>
        <Field label="Headline" htmlFor="hl" hint="One line, shown under your name.">
          <Input id="hl" value={form.headline} onChange={set('headline')} maxLength={90} placeholder="Self-taught, patient, allergic to gatekeeping" />
        </Field>
        <Field label="About" htmlFor="bio">
          <Textarea id="bio" value={form.bio} onChange={set('bio')} maxLength={600} rows={4} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="City" htmlFor="city"><Input id="city" value={form.city} onChange={set('city')} /></Field>
          <Field label="Country" htmlFor="country"><Input id="country" value={form.country} onChange={set('country')} /></Field>
        </div>

        <Button onClick={save} loading={busy}>
          <Save className="size-4" aria-hidden /> Save profile
        </Button>
      </CardBody>
    </Card>
  )
}
