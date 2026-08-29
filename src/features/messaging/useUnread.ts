import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'

/**
 * Unread = messages in my conversations that I did not send and have not read.
 * Kept live off the same realtime channel the thread view uses.
 */
export function useUnreadCount() {
  const userId = useAuth((s) => s.userId)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) { setCount(0); return }
    let cancelled = false

    const load = async () => {
      const { count: c } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('sender_id', userId)
      if (!cancelled) setCount(c ?? 0)
    }

    void load()

    const channel = supabase
      .channel('unread-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => void load())
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [userId])

  return count
}
