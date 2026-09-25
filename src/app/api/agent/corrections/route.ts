/**
 * /api/agent/corrections
 *
 * GET: list the agent's own correction requests (paginated, descending).
 * POST: submit a new correction request.
 *
 * Body for POST:
 *   { targetDate, requestedChange, requestedTime?, reason, note? }
 *
 * requestedChange is one of:
 *   'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END' | 'OTHER'
 *
 * requestedTime is optional "HH:mm" in business tz (Eastern Time).
 * The server does NOT apply the requested change; it stores the request
 * for admin review.
 */

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { requireAgentApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'
import { notifyRealtime } from '@/lib/realtime-server'
import { businessTimeOnDate } from '@/lib/timezone'
import { parseLimit } from '@/lib/http'

const RequestedChange = z.enum([
  'CLOCK_IN',
  'CLOCK_OUT',
  'BREAK_START',
  'BREAK_END',
  'OTHER',
])

const Body = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  requestedChange: RequestedChange,
  requestedTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:mm)')
    .optional(),
  reason: z.string().min(3, 'Reason is required.'),
  note: z.string().max(1000).optional(),
})

export async function GET(req: Request) {
  const user = await requireAgentApi()
  if (user instanceof Response) return user

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || undefined
  const limit = parseLimit(url.searchParams.get('limit'), { default: 20, max: 100 })

  const requests = await db.correctionRequest.findMany({
    where: { userId: user.id, status: status || undefined },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ requests })
}

export async function POST(req: Request) {
  const user = await requireAgentApi()
  if (user instanceof Response) return user

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof ZodError ? e.issues[0]?.message : 'Invalid request.' },
      { status: 400 }
    )
  }

  // Validate that targetDate is a real calendar date (e.g. reject '2024-13-45').
  // Zod's regex only checks the format, not the calendar validity.
  const targetDateCheck = new Date(`${parsed.targetDate}T12:00:00Z`)
  if (Number.isNaN(targetDateCheck.getTime())) {
    return NextResponse.json({ error: 'Invalid target date.' }, { status: 400 })
  }

  // Convert requestedTime (HH:mm in business tz) to UTC if provided.
  let requestedTimeUtc: string | null = null
  if (parsed.requestedTime) {
    try {
      const d = businessTimeOnDate(parsed.targetDate, parsed.requestedTime)
      requestedTimeUtc = d.toISOString()
    } catch {
      return NextResponse.json({ error: 'Invalid requested time.' }, { status: 400 })
    }
  }

  const created = await db.correctionRequest.create({
    data: {
      userId: user.id,
      targetDate: parsed.targetDate,
      requestedChange: parsed.requestedChange,
      requestedTime: requestedTimeUtc,
      reason: parsed.reason,
      note: parsed.note ?? null,
      status: 'PENDING',
    },
  })

  await writeAudit({
    actorId: user.id,
    targetId: user.id,
    action: 'ATTENDANCE_CORRECTION_SUBMITTED',
    metadata: {
      requestId: created.id,
      targetDate: parsed.targetDate,
      requestedChange: parsed.requestedChange,
      requestedTimeUtc,
      reason: parsed.reason,
    },
  })

  // Notify admin dashboard that a new correction request is pending.
  try {
    await notifyRealtime({
      type: 'correction_request',
      userId: user.id,
      userName: user.name,
    })
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, request: created })
}
