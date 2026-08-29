import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'
import { APP_NAME } from '@/lib/constants'
import { errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { Logo } from '@/components/brand/Logo'
import { toast } from '@/components/ui/Toast'

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const { session, ready } = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (ready && session) return <Navigate to={params.get('next') ?? '/home'} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name.trim() || email.split('@')[0],
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          },
        })
        if (error) throw error
        // Email confirmation is off on the project, so signUp hands back a session and
        // the redirect below fires straight away. Belt and braces if it ever gets turned
        // back on: sign in explicitly rather than stranding them on this screen.
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          })
          if (signInError) throw signInError
        }
        toast.success(`Welcome to ${APP_NAME}. Two tokens are on us.`)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const isSignup = mode === 'signup'

  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-indigo-700 text-white p-10 grid-paper">
        <Link to="/" className="flex items-center gap-2 w-fit">
          <Logo onDark />
          <span className="font-display font-extrabold text-lg">{APP_NAME}</span>
        </Link>
        <div className="space-y-5 max-w-md">
          <h1 className="text-4xl leading-[1.1] text-white">
            Everyone already knows something worth teaching.
          </h1>
          <p className="text-indigo-100 text-lg leading-relaxed">
            Almost nobody gets to trade it. {APP_NAME} pairs you with someone who wants what you
            know — you teach what you know, you learn what you want, and no money changes hands.
          </p>
          <ul className="space-y-2 text-indigo-100 text-sm">
            <li>· Two tokens the moment you join</li>
            <li>· Swap a lesson for a lesson and spend nothing</li>
            <li>· Teaching is the only way to earn more</li>
          </ul>
        </div>
        <p className="text-indigo-200 text-xs">Built for SYNCS Hack 2026.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Link to="/" className="lg:hidden flex items-center gap-2 w-fit">
            <Logo />
            <span className="font-display font-extrabold text-lg">{APP_NAME}</span>
          </Link>

          <div className="space-y-1">
            <h2 className="text-2xl">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p className="text-sm text-ink-soft">
              {isSignup
                ? 'Takes about thirty seconds. No card, ever.'
                : 'Pick up where you left off.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {isSignup && (
              <Field label="Your name" htmlFor="name">
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maya Chen"
                  autoComplete="name"
                  required
                />
              </Field>
            )}
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={isSignup ? 'At least 6 characters.' : undefined}
              error={error}
            >
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />
            </Field>

            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {isSignup ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <p className="text-sm text-ink-soft text-center">
            {isSignup ? 'Already have an account? ' : "Haven't joined yet? "}
            <Link
              to={isSignup ? '/signin' : '/signup'}
              className="font-semibold text-indigo-500 underline underline-offset-2"
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
