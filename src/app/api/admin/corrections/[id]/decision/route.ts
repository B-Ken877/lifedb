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
 * CONCURRENCY: The review is atomic. Two admins concurrently approving the
 * same request can no longer both create an AttendanceEvent — the
 * conditional `updateMany({ where: { id, status: 'PENDING' } })` returns
 * count=0 for the second admin, who gets a 409.
 *
 * Never modifies existing events.
 */

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
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
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof ZodError ? e.issues[0]?.message : 'Invalid request.' },
      { status: 400 }
    )
  }

  // Look up the request once (for user name + targetDate).
  const req_ = await db.correctionRequest.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  })
  if (!req_) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Compute the corrected event details up front so we can create it
  // inside the transaction (validates businessTimeOnDate before locking).
  let correctedEventId: string | null = null
  let correctedEventMetadata: {
    eventType: string
    time: string
    targetDate: string
  } | null = null
  if (parsed.decision === 'APPROVED' && parsed.applyCorrection) {
    try {
      // Pre-validate; the actual create happens inside the transaction.
      businessTimeOnDate(req_.targetDate, parsed.applyCorrection.time)
      correctedEventMetadata = {
        eventType: parsed.applyCorrection.eventType,
        time: parsed.applyCorrection.time,
        targetDate: req_.targetDate,
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid targetDate or applyCorrection.time.' },
        { status: 400 }
      )
    }
  }

  // Atomic transition: PENDING → APPROVED/REJECTED. updateMany is a single
  // SQL statement with an implicit row lock on Postgres, so two concurrent
  // admins can no longer both pass the PENDING check.
  try {
    await db.$transaction(async (tx) => {
      const transition = await tx.correctionRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: parsed.decision,
          reviewedById: admin.id,
          reviewNote: parsed.reviewNote ?? null,
          reviewedAt: new Date(),
        },
      })

      if (transition.count === 0) {
        // Already reviewed by someone else.
        throw new Error('ALREADY_REVIEWED')
      }

      // Only APPROVED + applyCorrection creates an event. It happens inside
      // the same transaction so it commits atomically with the status change.
      if (correctedEventMetadata) {
        const utcInstant = businessTimeOnDate(
          correctedEventMetadata.targetDate,
          correctedEventMetadata.time
        )
        const event = await tx.attendanceEvent.create({
          data: {
            userId: req_.userId,
            eventType: correctedEventMetadata.eventType,
            timestampUtc: utcInstant,
            businessDate: businessDateKey(utcInstant),
            source: 'admin-correction',
            correctedById: admin.id,
            correctionReason: `Approved correction request ${req_.id}`,
          },
        })
        correctedEventId = event.id
      }
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_REVIEWED') {
      return NextResponse.json({ error: 'Request already reviewed.' }, { status: 409 })
    }
    // Unexpected — surface a 500 and let hardening log it.
    console.error('[corrections/decision] transaction failed:', err)
    return NextResponse.json({ error: 'Failed to apply decision.' }, { status: 500 })
  }

  // Audit + realtime are best-effort OUTSIDE the transaction. If they fail,
  // the business state is still correct.
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

  if (correctedEventId && correctedEventMetadata) {
    await writeAudit({
      actorId: admin.id,
      targetId: req_.userId,
      action: 'ATTENDANCE_RECORD_CORRECTED',
      metadata: {
        requestId: id,
        eventId: correctedEventId,
        ...correctedEventMetadata,
      },
    })
  }

  try {
    await notifyRealtime({
      type: 'correction_request',
      userId: req_.userId,
      userName: req_.user.name,
    })
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, status: parsed.decision, correctedEventId })
}
