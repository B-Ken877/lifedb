/**
 * Agent navigation + layout shell.
 *
 * Mobile-first design:
 *  - Sticky top bar with brand + sign-out icon (no text on mobile)
 *  - Bottom tab bar on mobile (44px touch targets, thumb-friendly)
 *  - Desktop sub-nav bar (lg+)
 *
 * The bottom tab bar is the primary mobile navigation — no drawer needed.
 * The hamburger/drawer is removed entirely in favor of the bottom bar,
 * which is always visible and reachable with one thumb.
 */

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  CalendarClock,
  FileEdit,
  User as UserIcon,
  LogOut,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/agent/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/agent/attendance', label: 'Hours', icon: CalendarClock },
  { href: '/agent/corrections', label: 'Fixes', icon: FileEdit },
  { href: '/agent/profile', label: 'Profile', icon: UserIcon },
]

export function AgentNav({ userName }: { userName: string }) {
  const pathname = usePathname()

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background border-b safe-area-top">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="leading-none">
              <p className="text-sm font-semibold">Clock-Now</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider hidden xs:block">
                Clocking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground max-w-[120px] truncate">
              {userName}
            </span>
            {/* Icon-only on mobile, icon+text on desktop */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ callbackUrl: '/connexion' })}
              className="h-10 px-3 sm:px-4"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>

        {/* Desktop sub-nav (lg+) */}
        <div className="hidden lg:flex border-t bg-muted/30">
          <div className="flex gap-1 px-4 lg:px-6 py-1.5">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href || pathname?.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background border-t safe-area-bottom">
        <div className="grid grid-cols-4 h-16">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-h-[44px]',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'fill-primary/10')} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
