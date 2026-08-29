import { cn } from '@/lib/utils'

/**
 * The mark: two hands passing a skill back the other way — teach one, learn one.
 * Drawn on a square viewBox so it stays centred at every size, from a 16px
 * favicon to the 96px hero. `onDark` swaps the indigo half for paper so the
 * mark survives the indigo panels.
 */
export function Logo({
  className,
  onDark = false,
}: {
  className?: string
  onDark?: boolean
}) {
  const lead = onDark ? '#FBF7F0' : '#4F42C0'
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('size-8 shrink-0', className)}
      aria-hidden
      focusable="false"
    >
      <g fill="none" strokeLinecap="round">
        <path d="M13.21 25.16 A20 20 0 0 1 48.38 20.53" stroke={lead} strokeWidth="8" />
        <path d="M50.79 38.84 A20 20 0 0 1 15.62 43.47" stroke="#F2B44E" strokeWidth="8" />
      </g>
      <path d="M54.12 28.72 43.10 26.07 55.38 17.45Z" fill={lead} />
      <path d="M9.88 35.28 20.90 37.93 8.62 46.55Z" fill="#F2B44E" />
    </svg>
  )
}
