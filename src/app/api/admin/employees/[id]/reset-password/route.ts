/**
 * POST /api/admin/employees/[id]/reset-password
 *
 * Generates a new temporary password, sets mustChangePassword=true.
 * The new temp password is returned ONCE in the response.
 * Old password hash is overwritten; agent must use the new temp password.
 */

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { hashPassword, generateTemporaryPassword } from '@/lib/password'
import { writeAudit } from '@/lib/audit'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Protected accounts cannot have their password reset by admins.
  // The owner can change their own password via /agent/profile.
  if (user.isProtected) {
    return NextResponse.json(
      { error: 'This account is protected. The owner must change their own password via their profile page.' },
      { status: 403 }
    )
  }

  const temp = generateTemporaryPassword()
  const hash = await hashPassword(temp)
  await db.user.update({
    where: { id },
    data: { passwordHash: hash, mustChangePassword: true },
  })

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: 'PASSWORD_RESET',
    metadata: { at: new Date().toISOString() },
  })

  return NextResponse.json({
    ok: true,
    temporaryPassword: temp,
    username: user.username,
  })
}
