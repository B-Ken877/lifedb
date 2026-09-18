/**
 * Root route.
 *
 * - Unauthenticated → middleware sends to /connexion.
 * - Authenticated admin → middleware sends to /admin/dashboard.
 * - Authenticated agent → middleware sends to /agent/dashboard.
 * - As a safety net, this server component also redirects if middleware missed.
 */

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function Home() {
  const s = await getSession()
  if (!s?.user) redirect('/connexion')
  if (s.user.mustChangePassword) redirect('/changer-mot-de-passe')
  if (s.user.role === 'ADMIN') redirect('/admin/dashboard')
  redirect('/agent/dashboard')
}
