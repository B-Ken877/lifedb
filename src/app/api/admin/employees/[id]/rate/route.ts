/**
 * POST /api/admin/employees/[id]/rate
 * Body: { hourlyRate: number, effectiveDate?: string (YYYY-MM-DD), note?: string }
 *
 * Creates a NEW CompensationRecord (effective-dated). Does NOT overwrite history.
 * This preserves historical payroll correctness.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'
import { getCurrentHourlyRate } from '@/lib/attendance/engine'
import { businessDateKey } from '@/lib/timezone'

const Body = z.object({
  hourlyRate: z.number().min(0),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.issues?.[0]?.message || 'Invalid request.' },
      { status: 400 }
    )
  }

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Protected accounts cannot have their hourly rate changed by admins.
  if (user.isProtected) {
    return NextResponse.json(
      { error: 'This account is protected and its hourly rate cannot be changed by an administrator.' },
      { status: 403 }
    )
  }

  const oldRate = await getCurrentHourlyRate(id)
  const effective = parsed.effectiveDate
    ? new Date(`${parsed.effectiveDate}T12:00:00Z`)
    : new Date()

  const rec = await db.compensationRecord.create({
    data: {
      userId: id,
      hourlyRate: parsed.hourlyRate,
      effectiveDate: effective,
      note: parsed.note ?? `Changed by ${admin.name}`,
      createdBy: admin.id,
    },
  })

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: 'RATE_CHANGED',
    metadata: {
      oldRate,
      newRate: parsed.hourlyRate,
      effectiveDate: businessDateKey(effective),
      note: parsed.note ?? null,
    },
  })

  return NextResponse.json({ ok: true, record: { id: rec.id, hourlyRate: rec.hourlyRate } })
}
