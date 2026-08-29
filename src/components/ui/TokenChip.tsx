import { cn } from '@/lib/utils'

/** The token is a literal block — one stud per token, up to the cap. */
export function TokenChip({
  balance,
  className,
  showLabel = true,
}: {
  balance: number
  className?: string
  showLabel?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 px-2.5 h-8 rounded-[10px]',
        'border-2 border-amber-500 bg-amber-50 text-amber-600',
        className,
      )}
      title={`${balance} token${balance === 1 ? '' : 's'}`}
    >
      <span className="inline-grid grid-cols-3 gap-[2px]" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'size-[5px] rounded-[1px]',
              i < balance ? 'bg-amber-400' : 'bg-amber-200/70',
            )}
          />
        ))}
      </span>
      <span className="font-bold text-sm tabular-nums">{balance}</span>
      {showLabel && <span className="sr-only">tokens</span>}
    </span>
  )
}
