import { Link } from 'react-router-dom'
import { cn, hashPick } from '@/lib/utils'
import type { SkillWithCategory } from '@/types/models'

const tones = [
  'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
  'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100',
  'bg-moss-100 text-moss-600 border-moss-500/30 hover:bg-moss-100/70',
  'bg-clay-100 text-clay-600 border-clay-500/30 hover:bg-clay-100/70',
  'bg-paper-deep text-ink-soft border-line-strong hover:bg-line',
] as const

export function skillTone(categorySlug?: string | null) {
  return hashPick(categorySlug ?? 'x', tones)
}

export function SkillPill({
  skill,
  className,
  as = 'link',
}: {
  skill: Pick<SkillWithCategory, 'name' | 'slug'> & { category?: { slug: string } | null }
  className?: string
  as?: 'link' | 'span'
}) {
  const cls = cn(
    'inline-flex items-center gap-1 px-2 py-1 rounded-[9px] border-2 text-[12px] font-semibold transition-colors',
    skillTone(skill.category?.slug),
    className,
  )
  if (as === 'span') return <span className={cls}>{skill.name}</span>
  return (
    <Link to={`/skill/${skill.slug}`} className={cls}>
      {skill.name}
    </Link>
  )
}
