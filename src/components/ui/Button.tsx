import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary:
    'bg-indigo-500 text-white border-indigo-700 hover:bg-indigo-600 active:bg-indigo-700',
  accent:
    'bg-amber-300 text-ink border-amber-500 hover:bg-amber-200 active:bg-amber-400',
  outline:
    'bg-white text-ink border-line-strong hover:bg-paper-deep',
  ghost:
    'bg-transparent text-ink-soft border-transparent shadow-none hover:bg-paper-deep hover:text-ink',
  danger:
    'bg-clay-500 text-white border-clay-600 hover:bg-clay-600',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[12px]',
  lg: 'h-12 px-6 text-base gap-2 rounded-[14px]',
  icon: 'h-10 w-10 rounded-[12px]',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center border-2 font-semibold whitespace-nowrap',
        'transition-all duration-100 select-none',
        'shadow-[2px_2px_0_0_rgba(26,22,38,0.18)] hover:shadow-[3px_3px_0_0_rgba(26,22,38,0.22)]',
        'active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})
