import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Kind = 'success' | 'error' | 'info'
type Toast = { id: number; kind: Kind; text: string }

type Store = {
  toasts: Toast[]
  push: (kind: Kind, text: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<Store>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (text: string) => useToasts.getState().push('success', text),
  error: (text: string) => useToasts.getState().push('error', text),
  info: (text: string) => useToasts.getState().push('info', text),
}

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info }
const tones: Record<Kind, string> = {
  success: 'border-moss-500 bg-moss-100 text-moss-600',
  error: 'border-clay-500 bg-clay-100 text-clay-600',
  info: 'border-indigo-300 bg-indigo-50 text-indigo-700',
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div
      className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = icons[t.kind]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 w-full sm:w-80 px-3 py-2.5',
              'border-2 rounded-[12px] shadow-[3px_3px_0_0_rgba(26,22,38,0.2)] text-sm font-medium',
              tones[t.kind],
            )}
          >
            <Icon className="size-4 mt-0.5 shrink-0" aria-hidden />
            <span className="flex-1">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
