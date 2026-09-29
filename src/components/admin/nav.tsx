/**
 * Admin navigation + layout shell.
 *
 * Mobile-first design:
 *  - Sticky top bar with brand + sign-out icon (no text on mobile)
 *  - Horizontally-scrollable sub-nav on tablet+ (md) — visible at md,
 *    not hidden until lg like before
 *  - Drawer for mobile-only (< md) with 48px touch targets
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  FileEdit,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Clock,
} from 'lucide-react'

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' },
  { href: '/admin/employees', label: 'Employees', icon: Users, short: 'Staff' },
  { href: '/admin/attendance', label: 'Attendance', icon: CalendarClock, short: 'Hours' },
  { href: '/admin/corrections', label: 'Corrections', icon: FileEdit, short: 'Fixes' },
  { href: '/admin/payroll', label: 'Payroll', icon: DollarSign, short: 'Pay' },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, short: 'Reports' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, short: 'Settings' },
]

export function AdminNav({ userName }: { userName: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 bg-background border-b safe-area-top">
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile drawer (< md) */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-10 w-10">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-72 p-4">
              <SheetTitle className="mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5" /> Clock-Now
              </SheetTitle>
              <nav className="flex flex-col gap-1">
                {NAV.map((item) => {
                  const Icon = item.icon
                  const active = pathname === item.href || pathname?.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors min-h-[44px]',
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
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="leading-none">
              <p className="text-sm font-semibold">Clock-Now</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider hidden xs:block">
                Admin Console
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-sm text-muted-foreground max-w-[120px] truncate">
            {userName}
          </span>
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

      {/* Tablet+ horizontal sub-nav (md and up) */}
      <div className="hidden md:block border-t bg-muted/30">
        <div className="flex gap-1 px-4 lg:px-6 py-1.5 overflow-x-auto scrollbar-thin">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
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
  )
}
