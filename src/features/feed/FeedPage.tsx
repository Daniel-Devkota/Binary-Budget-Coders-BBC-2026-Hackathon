import { Sparkles, Check, X, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/stores/authStore'
import { useAsync } from '@/lib/useAsync'
import { fetchDiscoverFeed, fetchFeed, fetchPendingConsent, setPostConsent } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { PersonRow } from '@/components/domain/PersonRow'
import { SkillPill } from '@/components/domain/SkillPill'
import { BlockArt } from '@/components/domain/BlockArt'
import { relative } from '@/lib/format'
import { errorMessage } from '@/lib/utils'

type PostRow = {
  id: string
  caption: string | null
  photo_url: string | null
  created_at: string
  status: string
  author: { id: string; display_name: string; avatar_url: string | null; city: string | null }
  partner: { id: string; display_name: string; avatar_url: string | null; city: string | null }
  skill: { name: string; slug: string; category?: { slug: string } | null } | null
}

export function FeedPage() {
  const userId = useAuth((s) => s.userId)!

  const feed = useAsync(() => fetchFeed(userId), [userId])
  const everyone = useAsync(() => fetchDiscoverFeed(), [])
  const pending = useAsync(() => fetchPendingConsent(userId), [userId])

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl">Feed</h1>
        <p className="text-ink-soft">
          Sessions people chose to share. Both sides have to agree before anything appears here.
        </p>
      </div>

      {(pending.data?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" aria-hidden /> Waiting on your approval
          </h2>
          {(pending.data ?? []).map((p) => (
            <ConsentRow
              key={p.id}
              post={p as unknown as PostRow}
              onDone={() => { void pending.reload(); void feed.reload(); void everyone.reload() }}
            />
          ))}
        </section>
      )}

      <Tabs defaultValue="following">
        <TabList>
          <Tab value="following">People you follow</Tab>
          <Tab value="everyone">Everyone</Tab>
        </TabList>

        <TabPanel value="following" className="pt-5 space-y-4">
          {feed.loading ? (
            <><CardSkeleton /><CardSkeleton /></>
          ) : feed.data?.length ? (
            feed.data.map((p) => <PostCard key={p.id} post={p as unknown as PostRow} />)
          ) : (
            <EmptyState
              icon={Users}
              title="Your feed is quiet"
              body="Follow a few people whose skills interest you and their sessions will show up here."
              action={<Link to="/search"><Button variant="outline">Find people</Button></Link>}
            />
          )}
        </TabPanel>

        <TabPanel value="everyone" className="pt-5 space-y-4">
          {everyone.loading ? (
            <><CardSkeleton /><CardSkeleton /></>
          ) : everyone.data?.length ? (
            everyone.data.map((p) => <PostCard key={p.id} post={p as unknown as PostRow} />)
          ) : (
            <EmptyState icon={Sparkles} title="Nothing shared yet" body="Complete a session and you can be the first." />
          )}
        </TabPanel>
      </Tabs>
    </div>
  )
}

function PostCard({ post: p }: { post: PostRow }) {
  return (
    <Card lift className="overflow-hidden">
      {p.photo_url ? (
        <img src={p.photo_url} alt="" className="w-full max-h-80 object-cover border-b-2 border-line-strong" loading="lazy" />
      ) : (
        <BlockArt seed={p.id} className="h-28 border-b-2 border-line-strong" />
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <PersonRow person={p.author} size="sm" subtitle={relative(p.created_at)} />
          {p.skill && <SkillPill skill={p.skill} />}
        </div>
        <p className="text-[15px] leading-relaxed">{p.caption}</p>
        <p className="text-xs text-ink-faint">
          with{' '}
          <Link to={`/u/${p.partner.id}`} className="font-semibold text-ink-soft hover:underline underline-offset-2">
            {p.partner.display_name}
          </Link>
        </p>
      </div>
    </Card>
  )
}

function ConsentRow({ post: p, onDone }: { post: PostRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false)

  const decide = async (publish: boolean) => {
    setBusy(true)
    try {
      await setPostConsent(p.id, publish)
      toast.success(publish ? 'Published.' : 'Declined — it will not be shown.')
      onDone()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 space-y-3 border-amber-500 bg-amber-50">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PersonRow person={p.author} size="sm" subtitle="wants to share your session" />
        <Badge tone="amber">Needs your OK</Badge>
      </div>
      {p.photo_url && (
        <img src={p.photo_url} alt="" className="w-full max-h-56 object-cover rounded-[12px] border-2 border-line-strong" />
      )}
      <p className="text-sm">{p.caption}</p>
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={() => decide(true)}>
          <Check className="size-3.5" aria-hidden /> Publish it
        </Button>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => decide(false)}>
          <X className="size-3.5" aria-hidden /> No thanks
        </Button>
      </div>
    </Card>
  )
}
