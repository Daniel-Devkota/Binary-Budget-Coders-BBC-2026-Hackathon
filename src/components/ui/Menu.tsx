import * as DM from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const Menu = DM.Root
export const MenuTrigger = DM.Trigger

export function MenuContent({ className, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={8}
        align="end"
        className={cn(
          'z-50 min-w-52 p-1.5 bg-white border-2 border-line-strong rounded-[14px]',
          'shadow-[4px_4px_0_0_var(--color-line-strong)]',
          className,
        )}
        {...props}
      />
    </DM.Portal>
  )
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        'flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-sm font-semibold text-ink-soft',
        'outline-none cursor-pointer data-[highlighted]:bg-paper-deep data-[highlighted]:text-ink',
        className,
      )}
      {...props}
    />
  )
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn('px-2.5 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-ink-faint', className)} {...props} />
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn('my-1.5 h-0.5 bg-line -mx-1.5', className)} {...props} />
}
