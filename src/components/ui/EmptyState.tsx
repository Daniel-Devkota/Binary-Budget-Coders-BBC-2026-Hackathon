import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'block-card grid place-items-center text-center px-6 py-12 gap-3 border-dashed',
        className,
      )}
    >
      <div className="grid place-items-center size-12 rounded-[12px] bg-paper-deep border-2 border-line-strong">
        <Icon className="size-5 text-ink-faint" aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className="text-base">{title}</h3>
        {body && <p className="text-sm text-ink-soft max-w-sm mx-auto">{body}</p>}
      </div>
      {action}
    </div>
  )
}
