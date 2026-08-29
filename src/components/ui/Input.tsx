import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const base =
  'w-full border-2 border-line-strong bg-white px-3 py-2 text-sm text-ink rounded-[12px] ' +
  'placeholder:text-ink-faint transition-colors ' +
  'hover:border-indigo-200 focus:border-indigo-400 focus:outline-none ' +
  'focus-visible:outline-3 focus-visible:outline-indigo-400 focus-visible:outline-offset-1 ' +
  'disabled:opacity-60 disabled:bg-paper-deep'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(base, 'h-10', className)} {...props} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(base, 'min-h-24 resize-y', className)} {...props} />
})

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(base, 'h-10 pr-8 cursor-pointer', className)} {...props} />
})

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string | null
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-faint">{hint}</p>}
      {error && <p className="text-xs font-medium text-clay-500">{error}</p>}
    </div>
  )
}
