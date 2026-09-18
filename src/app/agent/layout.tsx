/**
 * Agent layout shell.
 *
 * - Reads the agent user from the session (server-side).
 * - Renders the navigation bar + the page content.
 */

import { requireAgent } from '@/lib/session'
import { AgentNav } from '@/components/agent/nav'

export default async function AgentLayout({ children }: React.PropsWithChildren) {
  const user = await requireAgent()
  return (
    <div className="min-h-screen flex flex-col">
      <AgentNav userName={user.name} />
      <main className="flex-1 px-4 lg:px-6 py-6 max-w-7xl w-full mx-auto">{children}</main>
      <footer className="border-t mt-auto">
        <div className="px-4 lg:px-6 py-3 text-xs text-muted-foreground">
          LIFE DREAM BIG — Clocking System · Internal use only
        </div>
      </footer>
    </div>
  )
}
