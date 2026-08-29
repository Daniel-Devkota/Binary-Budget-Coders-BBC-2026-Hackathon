import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  GraduationCap, Lightbulb, MapPin, MessageSquare, UserPlus, UserCheck, CalendarX2,
} from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import {
  fetchFollowCounts, fetchFollowing, fetchOpenSlots, fetchProfile, fetchUserPosts,
  fetchUserSkills, openConversation, setFollow,
} from '@/lib/api'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton, CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from '@/components/ui/Toast'
import { SkillPill } from '@/components/domain/SkillPill'
import { SlotCard } from '@/components/domain/SlotCard'
import { errorMessage } from '@/lib/utils'
import { relative } from '@/lib/format'

export function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const person = useAsync(() => fetchProfile(id!), [id])
  const skills = useAsync(() => fetchUserSkills(id!), [id])
  const slots = useAsync(() => fetchOpenSlots({ teacherId: id!, limit: 24 }), [id])
  const posts = useAsync(() => fetchUserPosts(id!), [id])
  const counts = useAsync(() => fetchFollowCounts(id!), [id])
  useAsync(async () => {
    if (!userId) return null
    const ids = await fetchFollowing(userId)
    setFollowing(ids.includes(id!))
    return null
  }, [userId, id])

  if (person.loading) return <Skeleton className="h-64 w-full max-w-4xl" />
  if (!person.data) {
    return <EmptyState icon={CalendarX2} title="No such person" body="This profile may have been removed." />
  }

  const p = person.data
  const isMe = p.id === userId
  const teaches = (skills.data ?? []).filter((s) => s.kind === 'teach')
  const wants = (skills.data ?? []).filter((s) => s.kind === 'learn')

  const toggleFollow = async () => {
    if (!userId) return
    setBusy(true)
    try {
      await setFollow(userId, p.id, !following)
      setFollowing((f) => !f)
      void counts.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const message = async () => {
    try {
      const convId = await openConversation(p.id)
      navigate(`/messages/${convId}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          <Avatar name={p.display_name} src={p.avatar_url} id={p.id} size="xl" />
          <div className="flex-1 min-w-0 space-y-3">
            <div className="space-y-1">
              <h1 className="text-3xl leading-tight">{p.display_name}</h1>
              {p.headline && <p className="text-ink-soft">{p.headline}</p>}
              <p className="text-sm text-ink-faint flex flex-wrap items-center gap-x-3 gap-y-1">
                {p.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {p.city}{p.country ? `, ${p.country}` : ''}
                  </span>
                )}
                <span>{counts.data?.followers ?? 0} followers</span>
                <span>Joined {relative(p.created_at)}</span>
              </p>
            </div>

            {p.bio && <p className="text-ink-soft leading-relaxed max-w-2xl">{p.bio}</p>}

            {!isMe && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={message}>
                  <MessageSquare className="size-4" aria-hidden /> Message
                </Button>
                <Button variant="outline" onClick={toggleFollow} loading={busy}>
                  {following ? (
                    <><UserCheck className="size-4" aria-hidden /> Following</>
                  ) : (
                    <><UserPlus className="size-4" aria-hidden /> Follow</>
                  )}
                </Button>
              </div>
            )}
            {isMe && (
              <Link to="/profile"><Button variant="outline">Edit your profile</Button></Link>
            )}
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-moss-500" aria-hidden /> Teaches
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {skills.loading ? <Skeleton className="h-8 w-full" /> : teaches.length ? (
              teaches.map((t) => (
                <div key={t.id} className="flex items-start gap-2 flex-wrap">
                  <SkillPill skill={t.skill} />
                  {t.proficiency && <Badge tone="neutral">{t.proficiency}</Badge>}
                  {t.blurb && <p className="w-full text-sm text-ink-soft">{t.blurb}</p>}
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-faint">Nothing listed yet.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" aria-hidden /> Wants to learn
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {skills.loading ? <Skeleton className="h-8 w-full" /> : wants.length ? (
              <div className="flex flex-wrap gap-2">
                {wants.map((t) => <SkillPill key={t.id} skill={t.skill} />)}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">Nothing listed yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl">Open hours</h2>
        {slots.loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"><CardSkeleton /><CardSkeleton /></div>
        ) : slots.data?.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {slots.data.map((s) => (
              <SlotCard key={s.id} slot={s} hideTeacher onChanged={() => void slots.reload()} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarX2}
            title="No open hours"
            body={isMe ? 'Publish one from your profile page.' : `Message ${p.display_name.split(' ')[0]} to ask when they are next free.`}
          />
        )}
      </section>

      {(posts.data?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl">Session album</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(posts.data ?? []).map((post) => <AlbumTile key={post.id} post={post} />)}
          </div>
        </section>
      )}
    </div>
  )
}

type AlbumPost = { photo_url: string | null; caption: string | null; created_at: string }

function AlbumTile({ post: p }: { post: AlbumPost }) {
  return (
    <Card lift className="overflow-hidden">
      {p.photo_url && (
        <img src={p.photo_url} alt="" className="w-full h-40 object-cover border-b-2 border-line-strong" loading="lazy" />
      )}
      <div className="p-4 space-y-1">
        <p className="text-sm text-ink-soft">{p.caption}</p>
        <p className="text-xs text-ink-faint">{relative(p.created_at)}</p>
      </div>
    </Card>
  )
}
