/**
 * POST /api/admin/employees/[id]/force-password-change
 *
 * Sets mustChangePassword=true. The agent will be forced to change on next login.
 * Does NOT reset the password — they must still authenticate with their current one.
 */

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  const user = await db.user.findUnique({ where: { id }, include: { role: true } })
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Cannot force-password-change your own admin account — would lock the
  // admin out of the system on their next login.
  if (id === admin.id) {
    return NextResponse.json(
      { error: 'You cannot force a password change on your own account.' },
      { status: 400 }
    )
  }

  // This endpoint is scoped to SURVEY_AGENT only — admins cannot use it
  // against other admins.
  if (user.role.name === 'ADMIN') {
    return NextResponse.json(
      { error: 'This endpoint can only modify agent accounts.' },
      { status: 403 }
    )
  }

  // Protected accounts cannot be force-password-changed by admins.
  if (user.isProtected) {
    return NextResponse.json(
      { error: 'This account is protected and cannot be force-password-changed by an administrator.' },
      { status: 403 }
    )
  }

  await db.user.update({ where: { id }, data: { mustChangePassword: true } })

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: 'FORCE_PASSWORD_CHANGE',
    metadata: { at: new Date().toISOString() },
  })

  return NextResponse.json({ ok: true })
}
