/**
 * Client-side SessionProvider wrapper.
 *
 * Required by useSession() in client components.
 */

'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
