import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/models'

type AuthState = {
  session: Session | null
  profile: Profile | null
  /** false until the first getSession settles — guards a login-screen flash on reload. */
  ready: boolean
  userId: string | null

  init: () => () => void
  refreshProfile: () => Promise<void>
  setProfile: (p: Profile) => void
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  ready: false,
  userId: null,

  init: () => {
    const load = async (session: Session | null) => {
      set({ session, userId: session?.user.id ?? null })
      if (!session) {
        set({ profile: null, ready: true })
        return
      }
      await get().refreshProfile()
      set({ ready: true })
      // Weekly grant is lazy: no cron to break at 3am.
      void supabase.rpc('claim_weekly_grant').then(({ data, error }) => {
        if (!error && typeof data === 'number' && data !== get().profile?.token_balance) {
          void get().refreshProfile()
        }
      })
    }

    void supabase.auth.getSession().then(({ data }) => void load(data.session))

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        set({ session })
        return
      }
      void load(session)
    })

    return () => sub.subscription.unsubscribe()
  },

  refreshProfile: async () => {
    const id = get().session?.user.id
    if (!id) return
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (data) set({ profile: data })
  },

  setProfile: (p) => set({ profile: p }),

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null, userId: null })
  },
}))
