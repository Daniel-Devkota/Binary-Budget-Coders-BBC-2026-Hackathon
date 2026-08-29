import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'

const SEEN_KEY = 'requests-seen-at'
const SEEN_EVENT = 'requests-seen'

/** Visiting /requests is what marks the accepted offers as read. */
export function markRequestsSeen() {
  localStorage.setItem(SEEN_KEY, new Date().toISOString())
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/**
 * Two things want you on /requests: an offer waiting on your own ask, and one
 * of your offers being accepted since you last looked.
 *
 * Offers do not arrive second by second, so this reads on mount and on every
 * navigation rather than holding a realtime channel open for the whole session.
 */
export function useRequestActivity() {
  const userId = useAuth((s) => s.userId)
  const location = useLocation()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) { setCount(0); return }
    let cancelled = false

    const load = async () => {
      const seen = localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString()
      const [waiting, accepted] = await Promise.all([
        supabase
          .from('request_responses')
          .select('id, request:skill_requests!inner(requester_id)', { count: 'exact', head: true })
          .eq('status', 'pending')
          .eq('request.requester_id', userId),
        supabase
          .from('request_responses')
          .select('id', { count: 'exact', head: true })
          .eq('teacher_id', userId)
          .eq('status', 'accepted')
          .gt('responded_at', seen),
      ])
      if (!cancelled) setCount((waiting.count ?? 0) + (accepted.count ?? 0))
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
