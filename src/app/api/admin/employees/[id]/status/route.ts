/**
 * POST /api/admin/employees/[id]/status
 * Body: { active: boolean }
 *
 * Activates or deactivates an employee. Active=false prevents login.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'
import { notifyRealtime } from '@/lib/realtime-server'

const Body = z.object({ active: z.boolean() })

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Protected accounts cannot be activated/deactivated by admins.
  if (user.isProtected) {
    return NextResponse.json(
      { error: 'This account is protected and its status cannot be changed by an administrator.' },
      { status: 403 }
    )
  }

  await db.user.update({ where: { id }, data: { active: parsed.active } })

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: parsed.active ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED',
    metadata: { before: user.active, after: parsed.active },
  })

  try {
    await notifyRealtime({ type: 'employee_updated', userId: id, userName: user.name })
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, active: parsed.active })
}
