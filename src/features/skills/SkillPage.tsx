import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CalendarX2, Users } from 'lucide-react'
import { useAsync } from '@/lib/useAsync'
import { fetchOpenSlots, fetchSkillBySlug, fetchTeachersOfSkill } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { SlotCard } from '@/components/domain/SlotCard'
import { PersonRow } from '@/components/domain/PersonRow'
import { skillTone } from '@/components/domain/SkillPill'
import { cn } from '@/lib/utils'

export function SkillPage() {
  const { slug } = useParams<{ slug: string }>()
  const skill = useAsync(() => fetchSkillBySlug(slug!), [slug])
  const slots = useAsync(
    async () => (skill.data ? fetchOpenSlots({ skillId: skill.data.id, limit: 60 }) : []),
    [skill.data?.id],
  )
  const teachers = useAsync(
    async () => (skill.data ? fetchTeachersOfSkill(skill.data.id) : []),
    [skill.data?.id],
  )

  if (skill.loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"><CardSkeleton /><CardSkeleton /></div>
      </div>
    )
  }

  if (!skill.data) {
    return (
      <EmptyState
        icon={CalendarX2}
        title="Skill not found"
        body="It may have been renamed."
        action={<Link to="/search"><Button variant="outline">Back to discover</Button></Link>}
      />
    )
  }

  const s = skill.data

  return (
    <div className="space-y-8 max-w-5xl">
      <Link to="/search" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Discover
      </Link>

      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div className="space-y-2">
          <span className={cn('inline-block px-2 py-1 rounded-[9px] border-2 text-[12px] font-semibold', skillTone(s.category?.slug))}>
            {s.category?.name}
          </span>
          <h1 className="text-3xl sm:text-5xl">{s.name}</h1>
          {s.description && <p className="text-lg text-ink-soft max-w-2xl">{s.description}</p>}
        </div>
        <div className="flex gap-2">
          <Badge tone="indigo">{teachers.data?.length ?? 0} teaching</Badge>
          <Badge tone="amber">{slots.data?.length ?? 0} open hours</Badge>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl">Open hours</h2>
        {slots.loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"><CardSkeleton /><CardSkeleton /></div>
        ) : slots.data?.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {slots.data.map((slot) => (
              <SlotCard key={slot.id} slot={slot} onChanged={() => void slots.reload()} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarX2}
            title="No open hours right now"
            body="Follow one of the teachers below, or message them to ask when they are next free."
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl flex items-center gap-2">
          <Users className="size-4 text-indigo-500" aria-hidden /> Who teaches this
        </h2>
        {teachers.loading ? (
          <div className="grid sm:grid-cols-2 gap-4"><CardSkeleton /><CardSkeleton /></div>
        ) : teachers.data?.length ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {teachers.data.map((t) => (
              <Card key={t.id} lift className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <PersonRow person={t.teacher} />
                  {t.proficiency && <Badge tone="moss">{t.proficiency}</Badge>}
                </div>
                {t.blurb && <p className="text-sm text-ink-soft">{t.blurb}</p>}
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-faint">Nobody yet — you could be the first.</p>
        )}
      </section>
    </div>
  )
}
