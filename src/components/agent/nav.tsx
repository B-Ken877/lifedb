/**
 * Agent navigation + layout shell.
 *
 * - Sticky top bar with the LIFE DREAM BIG wordmark and the agent's name.
 * - Side navigation on desktop; drawer on mobile.
 * - Active state highlights current route.
 * - Sign-out button in the header.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import {
  LayoutDashboard,
  CalendarClock,
  FileEdit,
  User as UserIcon,
  LogOut,
  Menu,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/agent/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agent/attendance', label: 'Attendance', icon: CalendarClock },
  { href: '/agent/corrections', label: 'Correction Requests', icon: FileEdit },
  { href: '/agent/profile', label: 'Profile', icon: UserIcon },
]

export function AgentNav({ userName }: { userName: string }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const links = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || pathname?.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <header className="sticky top-0 z-30 bg-background border-b">
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5" /> LIFE DREAM BIG
              </SheetTitle>
              {links}
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="leading-none">
              <p className="text-sm font-semibold">LIFE DREAM BIG</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Clocking</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-muted-foreground">{userName}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/connexion' })}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>

      {/* Desktop sub-nav */}
      <div className="hidden lg:flex border-t bg-muted/30">
        <div className="flex gap-1 px-4 lg:px-6 py-1.5">{NAV.map((item) => {
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
        })}</div>
      </div>
    </header>
  )
}
