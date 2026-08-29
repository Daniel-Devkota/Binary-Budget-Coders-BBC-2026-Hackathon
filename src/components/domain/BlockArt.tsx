import { hashPick } from '@/lib/utils'

const PALETTES = [
  ['#4F42C0', '#8F86E1', '#F2B44E', '#FBF7F0'],
  ['#2F2779', '#6C60D4', '#F8D089', '#F2EBDF'],
  ['#2E7D4F', '#4F42C0', '#F2B44E', '#FBF7F0'],
  ['#C0452B', '#E89B22', '#4F42C0', '#F2EBDF'],
] as const

/**
 * Stand-in artwork for a post with no photo. Deterministic from the post id, so
 * a given post always looks the same — and it is obviously a pattern, never a
 * fake photograph of people who do not exist.
 */
export function BlockArt({ seed, className }: { seed: string; className?: string }) {
  const palette = hashPick(seed, PALETTES)
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0
  const next = () => (h = (h * 1664525 + 1013904223) >>> 0) / 4294967296

  const COLS = 16
  const ROWS = 2
  const cells = Array.from({ length: COLS * ROWS }, () => ({
    color: palette[Math.floor(next() * palette.length)],
    round: next() > 0.6,
  }))

  return (
    <div className={className} aria-hidden>
      <svg
        viewBox={`0 0 ${COLS} ${ROWS}`}
        className="w-full h-full block"
        preserveAspectRatio="xMidYMid slice"
      >
        <rect width={COLS} height={ROWS} fill={palette[3]} />
        {cells.map((c, i) => (
          <rect
            key={i}
            x={(i % COLS) + 0.09}
            y={Math.floor(i / COLS) + 0.09}
            width={0.82}
            height={0.82}
            rx={c.round ? 0.4 : 0.16}
            fill={c.color}
          />
        ))}
      </svg>
    </div>
  )
}
