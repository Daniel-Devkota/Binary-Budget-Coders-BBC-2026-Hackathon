import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'indigo' | 'amber' | 'moss' | 'clay'

const tones: Record<Tone, string> = {
  neutral: 'bg-paper-deep text-ink-soft border-line-strong',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  amber: 'bg-amber-50 text-amber-600 border-amber-200',
  moss: 'bg-moss-100 text-moss-600 border-moss-500/40',
  clay: 'bg-clay-100 text-clay-600 border-clay-500/40',
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[8px] border px-2 py-0.5',
        'text-[11px] font-semibold uppercase tracking-wide',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
