import { cn, initials, hashPick } from '@/lib/utils'

const backdrops = [
  'bg-indigo-200 text-indigo-800',
  'bg-amber-200 text-amber-600',
  'bg-moss-100 text-moss-600',
  'bg-clay-100 text-clay-600',
  'bg-indigo-100 text-indigo-700',
] as const

const sizes = { sm: 'size-8 text-[11px]', md: 'size-10 text-xs', lg: 'size-14 text-base', xl: 'size-24 text-2xl' }

export function Avatar({
  name,
  src,
  id,
  size = 'md',
  className,
}: {
  name?: string | null
  src?: string | null
  id?: string
  size?: keyof typeof sizes
  className?: string
}) {
  const tone = hashPick(id ?? name ?? 'x', backdrops)
  return (
    <div
      className={cn(
        'shrink-0 grid place-items-center rounded-[10px] border-2 border-line-strong font-bold overflow-hidden',
        sizes[size],
        !src && tone,
        className,
      )}
      aria-hidden
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </div>
  )
}
