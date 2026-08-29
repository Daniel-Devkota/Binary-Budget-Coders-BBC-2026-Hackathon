import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const DialogRoot = RD.Root
export const DialogTrigger = RD.Trigger
export const DialogClose = RD.Close

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <RD.Portal>
      <RD.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <RD.Content
        className={cn(
          'fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto',
          'bg-white border-2 border-line-strong rounded-[16px] shadow-[6px_6px_0_0_var(--color-line-strong)]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="space-y-1">
            <RD.Title className="text-lg font-display font-bold leading-tight">{title}</RD.Title>
            {description ? (
              <RD.Description className="text-sm text-ink-soft">{description}</RD.Description>
            ) : (
              <RD.Description className="sr-only">{title}</RD.Description>
            )}
          </div>
          <RD.Close
            className="shrink-0 grid place-items-center size-8 rounded-[10px] border-2 border-line-strong hover:bg-paper-deep"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </RD.Close>
        </div>
        <div className="px-5 pb-5 pt-4">{children}</div>
      </RD.Content>
    </RD.Portal>
  )
}
