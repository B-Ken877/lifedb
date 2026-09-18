/**
 * POST /api/admin/corrections/[id]/decision
 *
 * Body: { decision: 'APPROVED' | 'REJECTED', reviewNote?: string, applyCorrection?: { eventType, time } }
 *
 * If APPROVED + applyCorrection provided:
 *   - Records an AttendanceEvent with source='admin-correction' and correctionReason.
 *   - Marks the request as APPROVED with the review note.
 *
 * If APPROVED without applyCorrection:
 *   - Just marks the request as approved (admin acknowledges but no event needed).
 *
 * If REJECTED:
 *   - Marks the request as rejected with the note.
 *
 * Never modifies existing events.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'
import { notifyRealtime } from '@/lib/realtime-server'
import { businessTimeOnDate, businessDateKey } from '@/lib/timezone'

const Body = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(1000).optional(),
  applyCorrection: z
    .object({
      eventType: z.enum(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']),
      time: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
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

  const req_ = await db.correctionRequest.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  })
  if (!req_) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (req_.status !== 'PENDING') {
    return NextResponse.json({ error: 'Request already reviewed.' }, { status: 409 })
  }

  // If approved with applyCorrection: record an attendance event.
  let correctedEventId: string | null = null
  if (parsed.decision === 'APPROVED' && parsed.applyCorrection) {
    const utcInstant = businessTimeOnDate(req_.targetDate, parsed.applyCorrection.time)
    const event = await db.attendanceEvent.create({
      data: {
        userId: req_.userId,
        eventType: parsed.applyCorrection.eventType,
        timestampUtc: utcInstant,
        businessDate: businessDateKey(utcInstant),
        source: 'admin-correction',
        correctedById: admin.id,
        correctionReason: `Approved correction request ${req_.id}`,
      },
    })
    correctedEventId = event.id

    await writeAudit({
      actorId: admin.id,
      targetId: req_.userId,
      action: 'ATTENDANCE_RECORD_CORRECTED',
      metadata: {
        requestId: id,
        eventId: event.id,
        eventType: parsed.applyCorrection.eventType,
        time: parsed.applyCorrection.time,
        targetDate: req_.targetDate,
      },
    })
  }

  const updated = await db.correctionRequest.update({
    where: { id },
    data: {
      status: parsed.decision,
      reviewedById: admin.id,
      reviewNote: parsed.reviewNote ?? null,
      reviewedAt: new Date(),
    },
  })

  await writeAudit({
    actorId: admin.id,
    targetId: req_.userId,
    action:
      parsed.decision === 'APPROVED'
        ? 'ATTENDANCE_CORRECTION_APPROVED'
        : 'ATTENDANCE_CORRECTION_REJECTED',
    metadata: {
      requestId: id,
      reviewNote: parsed.reviewNote ?? null,
      correctedEventId,
    },
  })

  try {
    await notifyRealtime({
      type: 'correction_request',
      userId: req_.userId,
      userName: req_.user.name,
    })
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, status: updated.status, correctedEventId })
}
