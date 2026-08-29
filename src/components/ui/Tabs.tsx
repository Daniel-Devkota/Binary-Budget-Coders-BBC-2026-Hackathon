import * as RT from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = RT.Root
export const TabPanel = RT.Content

export function TabList({ className, ...props }: React.ComponentProps<typeof RT.List>) {
  return (
    <RT.List
      className={cn('inline-flex gap-1 p-1 bg-paper-deep border-2 border-line-strong rounded-[12px]', className)}
      {...props}
    />
  )
}

export function Tab({ className, ...props }: React.ComponentProps<typeof RT.Trigger>) {
  return (
    <RT.Trigger
      className={cn(
        'px-3 py-1.5 rounded-[9px] text-sm font-semibold text-ink-soft transition-colors',
        'hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink',
        'data-[state=active]:shadow-[2px_2px_0_0_var(--color-line-strong)]',
        className,
      )}
      {...props}
    />
  )
}
