/**
 * POST /api/auth/change-password
 *
 * Body: { currentPassword, newPassword }
 *
 * Validates the current password against the stored hash, enforces strength
 * rules on the new password, hashes with bcrypt (cost 12), updates the user,
 * and clears mustChangePassword.
 *
 * Returns 200 on success, 400 on validation error, 401 on bad current password.
 */

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { hashPassword, validatePasswordStrength } from '@/lib/password'
import { writeAudit } from '@/lib/audit'

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const strengthError = validatePasswordStrength(parsed.newPassword)
  if (strengthError) {
    return NextResponse.json({ error: strengthError }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true, mustChangePassword: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const okCurrent = await bcrypt.compare(parsed.currentPassword, user.passwordHash)
  if (!okCurrent) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })
  }

  if (parsed.currentPassword === parsed.newPassword) {
    return NextResponse.json(
      { error: 'The new password must be different from the current one.' },
      { status: 400 }
    )
  }

  const newHash = await hashPassword(parsed.newPassword)
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  })

  await writeAudit({
    actorId: user.id,
    targetId: user.id,
    action: 'PASSWORD_CHANGED',
    metadata: { at: new Date().toISOString() },
  })

  return NextResponse.json({ ok: true })
}
