import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, Repeat2, Coins, Users, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { APP_NAME, TOKEN_CAP } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { BlockMark } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'

const BlockHero = lazy(() => import('./BlockHero'))

/** The hero is decorative. If motion is unwelcome, we never load the chunk. */
function useAllowsMotion() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setOk(!mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return ok
}

function HeroFallback() {
  return (
    <div
      className="size-full rounded-[20px] bg-gradient-to-br from-indigo-400 via-indigo-500 to-amber-300 opacity-90"
      aria-hidden
    />
  )
}

const steps = [
  {
    icon: Users,
    title: 'Say what you know and what you want',
    body: 'Two lists, that is the whole profile. Guitar and sourdough on one side, Spanish and bouldering on the other.',
  },
  {
    icon: Sparkles,
    title: 'We find the people who complete you',
    body: 'A perfect swap is someone who teaches what you want and wants what you teach. We surface them the moment they exist.',
  },
  {
    icon: Repeat2,
    title: 'Trade an hour for an hour',
    body: 'Swaps cost nothing. If nobody matches, one token books any session — and teaching is how you earn the next one.',
  },
]

export function LandingPage() {
  const { session, ready } = useAuth()
  const allowsMotion = useAllowsMotion()

  if (ready && session) return <Navigate to="/home" replace />

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b-2 border-line-strong">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <BlockMark />
            <span className="font-display font-extrabold text-lg tracking-tight">{APP_NAME}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/signin">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Join free</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="grid-paper border-b-2 border-line-strong">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-[10px] border-2 border-amber-500 bg-amber-50 text-amber-600 text-xs font-bold uppercase tracking-wide">
              <Sparkles className="size-3.5" aria-hidden /> No money. No subscriptions.
            </span>
            <h1 className="text-4xl sm:text-6xl leading-[1.02]">
              Every person is a block of knowledge.
              <span className="block text-indigo-500">Most of them sit disconnected.</span>
            </h1>
            <p className="text-lg text-ink-soft max-w-xl leading-relaxed">
              {APP_NAME} connects them directly. You teach an hour of what you know, you learn an hour
              of what you want, and nothing but time changes hands.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/signup">
                <Button size="lg">
                  Start with two free tokens <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <Link to="/signin">
                <Button size="lg" variant="outline">I already have an account</Button>
              </Link>
            </div>
            <p className="text-sm text-ink-faint">
              Try the demo: <code className="font-mono text-ink-soft">maya@blocks.demo</code> ·{' '}
              <code className="font-mono text-ink-soft">blocks1234</code>
            </p>
          </div>

          <div className="h-[320px] sm:h-[420px] -mx-2">
            {allowsMotion ? (
              <Suspense fallback={<HeroFallback />}>
                <BlockHero />
              </Suspense>
            ) : (
              <HeroFallback />
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20 space-y-10">
        <div className="max-w-2xl space-y-3">
          <h2 className="text-3xl sm:text-4xl">How it works</h2>
          <p className="text-ink-soft text-lg">
            Three steps, none of which involve a credit card.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <Card key={title} lift className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center size-10 rounded-[12px] bg-indigo-500 text-white">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="font-display font-bold text-2xl text-line-strong tabular-nums">
                  0{i + 1}
                </span>
              </div>
              <h3 className="text-lg leading-snug">{title}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y-2 border-line-strong bg-indigo-700 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl text-white">An economy you cannot hoard</h2>
            <p className="text-indigo-100 text-lg leading-relaxed">
              You start with two tokens and collect one a week, but your balance never goes past{' '}
              {TOKEN_CAP}. Saving up is impossible on purpose. The only way to keep learning is to
              teach somebody else — which is exactly the behaviour the platform exists to create.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: Coins, k: 'Start with 2', v: 'tokens, free' },
              { icon: Repeat2, k: 'Swaps cost 0', v: 'an hour for an hour' },
              { icon: Users, k: `Cap of ${TOKEN_CAP}`, v: 'teaching is the only income' },
              { icon: ShieldCheck, k: 'Details hidden', v: 'until both sides confirm' },
            ].map(({ icon: Icon, k, v }) => (
              <div key={k} className="border-2 border-indigo-400/60 rounded-[14px] p-4 bg-indigo-800/40">
                <Icon className="size-5 text-amber-300 mb-2" aria-hidden />
                <p className="font-display font-bold text-lg leading-tight">{k}</p>
                <p className="text-sm text-indigo-200">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center space-y-5">
        <h2 className="text-3xl sm:text-4xl">Somebody nearby wants what you already know.</h2>
        <p className="text-ink-soft text-lg max-w-xl mx-auto">
          It takes about thirty seconds to find out who.
        </p>
        <Link to="/signup" className="inline-block">
          <Button size="lg">
            Create your free account <ArrowRight className="size-4" aria-hidden />
          </Button>
        </Link>
      </section>

      <footer className="border-t-2 border-line-strong bg-paper-deep/60">
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-faint">
          <span className="font-semibold text-ink-soft">{APP_NAME}</span>
          <span>Built for SYNCS Hack 2026 — blocks that make up the world.</span>
        </div>
      </footer>
    </div>
  )
}
