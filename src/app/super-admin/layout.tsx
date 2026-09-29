/**
 * Super-admin layout shell.
 *
 * Branded "Clock-Now / Super Admin Console". Guards every page beneath
 * with `requireSuperAdmin()`.
 */

import { requireSuperAdmin } from '@/lib/session'
import { SuperAdminNav } from '@/components/super-admin/nav'

export default async function SuperAdminLayout({ children }: React.PropsWithChildren) {
  const user = await requireSuperAdmin()
  return (
    <div className="min-h-screen flex flex-col">
      <SuperAdminNav userName={user.name} />
      <main className="flex-1 px-4 lg:px-6 py-6 max-w-7xl w-full mx-auto">{children}</main>
      <footer className="border-t mt-auto">
        <div className="px-4 lg:px-6 py-3 text-xs text-muted-foreground">
          Clock-Now · Super Admin Console · Platform-wide administration · Internal use only
        </div>
      </footer>
    </div>
  )
}
