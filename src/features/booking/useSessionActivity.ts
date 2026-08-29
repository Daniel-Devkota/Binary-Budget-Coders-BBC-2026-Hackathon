import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'

const SEEN_KEY = 'sessions-seen-at'
const SEEN_EVENT = 'sessions-seen'

/** Visiting /bookings is what marks the waiting sessions as read. */
export function markSessionsSeen() {
  localStorage.setItem(SEEN_KEY, new Date().toISOString())
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/**
 * Two things want the learner on /bookings: a session the teacher has marked
 * held, and one that has already happened and is waiting on a confirm code.
 * Both used to be discovered only by remembering to look.
 *
 * Only the learner is counted. The teacher's side of both states is a wait,
 * not a task — and after Phase 1 it resolves itself in 48 hours either way.
 *
 * Both halves are compared against the seen marker rather than counted
 * outright, so the badge clears on a visit and comes back when something new
 * actually happens.
 */
export function useSessionActivity() {
  const userId = useAuth((s) => s.userId)
  const location = useLocation()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) { setCount(0); return }
    let cancelled = false

    const load = async () => {
      const seen = localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString()
      const now = new Date().toISOString()
      const [held, unconfirmed] = await Promise.all([
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('learner_id', userId)
          .eq('status', 'held')
          .gt('held_at', seen),
        // !inner so the slot filter actually restricts the bookings, and only
        // starts_at is selected — a bare * on availability_slots is a
        // permission error.
        supabase
          .from('bookings')
          .select('id, slot:availability_slots!inner(starts_at)', { count: 'exact', head: true })
          .eq('learner_id', userId)
          .eq('status', 'confirmed')
          .lt('slot.starts_at', now)
          .gt('slot.starts_at', seen),
      ])
      if (!cancelled) setCount((held.count ?? 0) + (unconfirmed.count ?? 0))
    }

    void load()
    window.addEventListener(SEEN_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(SEEN_EVENT, load)
    }
  }, [userId, location.pathname])

  return count
}
