import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SelectOption = { value: string; label: string }

/**
 * A select that opens a fixed-height panel instead of the native OS dropdown.
 * The list area keeps the same height while you type, so filtering never
 * makes the panel jump or resize under the cursor.
 */
export function SelectMenu({
  value,
  onChange,
  options,
  label,
  searchable,
  searchPlaceholder = 'Type to filter…',
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  label: string
  searchable?: boolean
  searchPlaceholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [alignRight, setAlignRight] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const withSearch = searchable ?? options.length > 8
  const selected = options.find((o) => o.value === value)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(Math.max(0, options.findIndex((o) => o.value === value)))
      if (withSearch) requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open, options, value, withSearch])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    setAlignRight(rect.left + 288 > window.innerWidth - 8)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (!shown.length) return
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1
        return (next + shown.length) % shown.length
      })
      return
    }
    if (e.key === 'Enter' || (e.key === ' ' && !withSearch)) {
      e.preventDefault()
      if (!open) setOpen(true)
      else if (shown[active]) commit(shown[active].value)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 h-10 pl-3 pr-2.5 text-sm font-medium text-ink',
          'border-2 border-line-strong bg-white rounded-[12px] cursor-pointer transition-colors',
          'hover:border-indigo-200 focus:outline-none',
          'focus-visible:outline-3 focus-visible:outline-indigo-400 focus-visible:outline-offset-1',
          open && 'border-indigo-400',
        )}
      >
        <span className="truncate max-w-44">{selected?.label ?? label}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={cn(
            'absolute z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] flex flex-col',
            'bg-white border-2 border-line-strong rounded-[14px]',
            'shadow-[4px_4px_0_0_var(--color-line-strong)] overflow-hidden',
            alignRight ? 'right-0' : 'left-0',
          )}
        >
          {withSearch && (
            <div className="relative shrink-0 p-2 border-b-2 border-line">
              <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 size-4 text-ink-faint" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                placeholder={searchPlaceholder}
                aria-label={`Filter ${label.toLowerCase()}`}
                className={cn(
                  'w-full h-9 pl-8 pr-2 text-sm rounded-[10px] bg-paper-deep border-2 border-transparent',
                  'placeholder:text-ink-faint text-ink focus:outline-none focus:border-indigo-400',
                )}
              />
            </div>
          )}

          {/* Fixed height: the panel keeps its size while the list filters down. */}
          <div ref={listRef} className="h-60 overflow-y-auto overscroll-contain p-1.5">
            {shown.length ? (
              shown.map((o, i) => {
                const isSelected = o.value === value
                return (
                  <button
                    key={o.value || '__all'}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(o.value)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 h-9 rounded-[10px] text-left text-sm font-semibold',
                      'text-ink-soft cursor-pointer',
                      i === active && 'bg-paper-deep text-ink',
                      isSelected && 'text-ink',
                    )}
                  >
                    <span className="truncate flex-1">{o.label}</span>
                    {isSelected && <Check className="size-4 shrink-0 text-indigo-500" aria-hidden />}
                  </button>
                )
              })
            ) : (
              <p className="px-2.5 py-6 text-sm text-ink-faint text-center">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
