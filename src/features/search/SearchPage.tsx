import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, SlidersHorizontal, HelpCircle, MapPin, X } from 'lucide-react'
import { useAsync } from '@/lib/useAsync'
import { fetchCategories, fetchOpenSlots, fetchSkills } from '@/lib/api'
import { Input } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { SlotCard } from '@/components/domain/SlotCard'
import { cn } from '@/lib/utils'

const WHEN = [
  { key: 'any', label: 'Any time', days: null },
  { key: '3', label: 'Next 3 days', days: 3 },
  { key: '7', label: 'This week', days: 7 },
  { key: '14', label: 'Next fortnight', days: 14 },
] as const

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const categoryId = params.get('category') ?? ''
  const skillId = params.get('skill') ?? ''
  const mode = params.get('mode') ?? ''
  const when = params.get('when') ?? 'any'

  const categories = useAsync(fetchCategories, [])
  const skills = useAsync(fetchSkills, [])

  const days = WHEN.find((w) => w.key === when)?.days ?? null
  const to = days ? new Date(Date.now() + days * 86400_000).toISOString() : undefined

  const slots = useAsync(
    () =>
      fetchOpenSlots({
        skillId: skillId || undefined,
        categoryId: categoryId || undefined,
        mode: (mode as 'online' | 'in_person') || undefined,
        to,
        limit: 120,
      }),
    [skillId, categoryId, mode, when],
  )

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k === 'category') next.delete('skill')
    setParams(next, { replace: true })
  }

  const skillsInCategory = useMemo(
    () => (skills.data ?? []).filter((s) => !categoryId || s.category_id === categoryId),
    [skills.data, categoryId],
  )

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'All categories' },
      ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories.data],
  )

  const skillOptions = useMemo(
    () => [
      { value: '', label: 'All skills' },
      ...skillsInCategory.map((s) => ({ value: s.id, label: s.name })),
    ],
    [skillsInCategory],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return slots.data ?? []
    return (slots.data ?? []).filter(
      (s) =>
        s.skill?.name.toLowerCase().includes(q) ||
        s.teacher?.display_name.toLowerCase().includes(q) ||
        s.teacher?.city?.toLowerCase().includes(q),
    )
  }, [slots.data, query])

  const activeFilters = [categoryId, skillId, mode, when !== 'any' ? when : ''].filter(Boolean).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl">Discover</h1>
          <p className="text-ink-soft">Every open hour on the platform. Pay a token, or offer a swap.</p>
        </div>
        <Link to="/map">
          <Button variant="outline">
            <MapPin className="size-4" aria-hidden /> View on map
          </Button>
        </Link>
      </div>

      <div className="block-card p-4 space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-faint" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a skill, a person or a suburb…"
            className="pl-9"
            aria-label="Search sessions"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <SlidersHorizontal className="size-4 text-ink-faint" aria-hidden />
          <SelectMenu
            value={categoryId}
            onChange={(v) => setParam('category', v)}
            options={categoryOptions}
            label="All categories"
            searchPlaceholder="Type to filter categories…"
          />

          <SelectMenu
            value={skillId}
            onChange={(v) => setParam('skill', v)}
            options={skillOptions}
            label="All skills"
            searchPlaceholder="Type to filter skills…"
          />

          <div className="flex gap-1 p-1 bg-paper-deep border-2 border-line-strong rounded-[12px]">
            {[
              { v: '', l: 'Both' },
              { v: 'online', l: 'Online' },
              { v: 'in_person', l: 'In person' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setParam('mode', v)}
                aria-pressed={mode === v}
                className={cn(
                  'px-2.5 h-8 rounded-[9px] text-[13px] font-semibold transition-colors',
                  mode === v ? 'bg-white text-ink shadow-[2px_2px_0_0_var(--color-line-strong)]' : 'text-ink-soft hover:text-ink',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <SelectMenu
            value={when}
            onChange={(v) => setParam('when', v)}
            options={WHEN.map((w) => ({ value: w.key, label: w.label }))}
            label="Any time"
          />

          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              <X className="size-3.5" aria-hidden /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone="neutral">{slots.loading ? '…' : `${results.length} open`}</Badge>
        <span className="text-sm text-ink-faint">sessions</span>
      </div>

      {slots.loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : results.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((s) => (
            <SlotCard key={s.id} slot={s} onChanged={() => void slots.reload()} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={HelpCircle}
          title="Nobody is teaching that yet"
          body="Post it as a request instead. Tutors browse open requests and answer the ones they can help with."
          action={
            <Link to="/requests">
              <Button>Request this skill</Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
