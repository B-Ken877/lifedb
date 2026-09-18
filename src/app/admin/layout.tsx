/**
 * Admin layout shell.
 */

import { requireAdmin } from '@/lib/session'
import { AdminNav } from '@/components/admin/nav'

export default async function AdminLayout({ children }: React.PropsWithChildren) {
  const user = await requireAdmin()
  return (
    <div className="min-h-screen flex flex-col">
      <AdminNav userName={user.name} />
      <main className="flex-1 px-4 lg:px-6 py-6 max-w-7xl w-full mx-auto">{children}</main>
      <footer className="border-t mt-auto">
        <div className="px-4 lg:px-6 py-3 text-xs text-muted-foreground">
          LIFE DREAM BIG — Clocking System · Admin Console · Internal use only
        </div>
      </footer>
    </div>
  )
}
