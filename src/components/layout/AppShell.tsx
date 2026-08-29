import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Search, CalendarDays, MessagesSquare, User, LogOut, Menu as MenuIcon, X,
  Home, Sparkles, HelpCircle, MapPin, ChevronDown, GraduationCap, CalendarPlus,
} from 'lucide-react'
import { useAuth } from '@/stores/authStore'
import { APP_NAME } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { TokenChip } from '@/components/ui/TokenChip'
import { Button } from '@/components/ui/Button'
import { useUnreadCount } from '@/features/messaging/useUnread'
import { useRequestActivity } from '@/features/requests/useRequestActivity'
import { Logo } from '@/components/brand/Logo'
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu'

const nav = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/search', label: 'Discover', icon: Search },
  { to: '/map', label: 'Map', icon: MapPin },
  { to: '/bookings', label: 'Sessions', icon: CalendarDays },
  { to: '/messages', label: 'Messages', icon: MessagesSquare },
  { to: '/requests', label: 'Requests', icon: HelpCircle },
  { to: '/feed', label: 'Feed', icon: Sparkles },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const unread = useUnreadCount()
  const requestActivity = useRequestActivity()

  // Navigating anywhere closes the mobile drawer.
  useEffect(() => { setOpen(false) }, [location.pathname])

  return (
    <div className="min-h-dvh flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:px-3 focus:py-2 focus:bg-white focus:border-2 focus:border-indigo-500 focus:rounded-[10px]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b-2 border-line-strong bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-3">
          <Link to="/home" className="flex items-center gap-2 shrink-0">
            <Logo />
            <span className="font-display font-extrabold text-lg tracking-tight">{APP_NAME}</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label="Main">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-indigo-500 text-white'
                      : 'text-ink-soft hover:bg-paper-deep hover:text-ink',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {to === '/messages' && unread > 0 && (
                  <span className="ml-0.5 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-clay-500 text-white text-[10px] font-bold">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                {to === '/requests' && requestActivity > 0 && (
                  <span className="ml-0.5 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-clay-500 text-white text-[10px] font-bold">
                    {requestActivity > 9 ? '9+' : requestActivity}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {profile && <TokenChip balance={profile.token_balance} />}
            <Menu>
              <MenuTrigger
                aria-label="Your account"
                className="hidden sm:flex items-center gap-2 pl-1 pr-2 h-10 rounded-[12px] border-2 border-line-strong bg-white hover:bg-paper-deep data-[state=open]:bg-paper-deep"
              >
                <Avatar name={profile?.display_name} src={profile?.avatar_url} id={profile?.id} size="sm" />
                <span className="text-sm font-semibold max-w-28 truncate">{profile?.display_name}</span>
                <ChevronDown className="size-4 text-ink-faint" aria-hidden />
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Your profile</MenuLabel>
                <MenuItem onSelect={() => navigate('/profile?tab=skills')}>
                  <GraduationCap className="size-4" aria-hidden /> Skills you teach &amp; learn
                </MenuItem>
                <MenuItem onSelect={() => navigate('/profile?tab=slots')}>
                  <CalendarPlus className="size-4" aria-hidden /> Your availability
                </MenuItem>
                <MenuItem onSelect={() => navigate('/profile?tab=about')}>
                  <User className="size-4" aria-hidden /> About you
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  className="text-clay-500"
                  onSelect={async () => { await signOut(); navigate('/') }}
                >
                  <LogOut className="size-4" aria-hidden /> Sign out
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-4" aria-hidden /> : <MenuIcon className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>

        {open && (
          <nav className="lg:hidden border-t-2 border-line px-4 py-3 grid gap-1 bg-paper" aria-label="Mobile">
            {[
              ...nav,
              { to: '/profile?tab=skills', label: 'Your skills', icon: GraduationCap },
              { to: '/profile?tab=slots', label: 'Your availability', icon: CalendarPlus },
              { to: '/profile?tab=about', label: 'Your profile', icon: User },
            ].map(
              ({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3 h-11 rounded-[10px] text-sm font-semibold',
                      // Query strings do not take part in route matching, so the three
                      // /profile entries would all light up at once — compare the search too.
                      isActive && (!to.includes('?') || to.endsWith(location.search))
                        ? 'bg-indigo-500 text-white'
                        : 'text-ink-soft hover:bg-paper-deep',
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </NavLink>
              ),
            )}
            <button
              onClick={async () => { await signOut(); navigate('/') }}
              className="flex items-center gap-2 px-3 h-11 rounded-[10px] text-sm font-semibold text-clay-500 hover:bg-paper-deep"
            >
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t-2 border-line-strong bg-paper-deep/60">
        <div className="mx-auto max-w-7xl px-4 py-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-faint">
          <span className="font-semibold text-ink-soft">{APP_NAME}</span>
          <span>Built for SYNCS Hack 2026.</span>
        </div>
      </footer>
    </div>
  )
}
