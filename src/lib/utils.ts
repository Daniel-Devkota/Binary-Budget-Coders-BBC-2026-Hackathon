import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Postgres errors are terse and often unhelpful; surface the useful half. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong.'
  if (typeof e === 'string') return e
  const anyE = e as { message?: string; error_description?: string; details?: string }
  return anyE.message ?? anyE.error_description ?? anyE.details ?? 'Something went wrong.'
}

export function initials(name?: string | null) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Deterministic palette pick so a person's colour never changes between renders. */
export function hashPick<T>(seed: string, list: readonly T[]): T {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return list[h % list.length]
}
