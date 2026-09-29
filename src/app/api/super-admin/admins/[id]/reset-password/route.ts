/**
 * POST /api/super-admin/admins/[id]/reset-password
 *
 * Generates a new temporary password, sets mustChangePassword=true.
 * The new temp password is returned ONCE in the response.
 * Old password hash is overwritten; the admin must use the new temp password.
 *
 * Super-admin only. Unlike the admin→agent endpoint, super-admin CAN reset
 * passwords for protected admin accounts (the project owner can recover
 * any locked-out tenant admin).
 */

import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { hashPassword, generateTemporaryPassword } from '@/lib/password'
import { writeAudit } from '@/lib/audit'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  const adminRole = await db.role.findUnique({ where: { name: 'ADMIN' } })

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  // Only ADMIN passwords are resettable through this endpoint.
  if (!adminRole || user.roleId !== adminRole.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
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
    metadata: { at: new Date().toISOString(), scope: 'super-admin' },
  })

  return NextResponse.json({
    ok: true,
    temporaryPassword: temp,
    username: user.username,
  })
}
