/**
 * /api/admin/employees/[id]
 *
 * GET    - fetch employee details (including compensation history + recent attendance).
 * PATCH  - update basic info (name, email, employeeId, username).
 *          Never updates password here (use reset-password endpoint).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'
import { notifyRealtime } from '@/lib/realtime-server'
import { getCurrentHourlyRate, getHourlyRateAt } from '@/lib/attendance/engine'
import { computeDaySummary } from '@/lib/attendance/engine'
import { getAgentState } from '@/lib/attendance/engine'
import { lastNDays } from '@/lib/timezone'

const PatchBody = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  employeeId: z.string().min(2).optional(),
  username: z.string().min(3).max(40).optional(),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  const u = await db.user.findUnique({
    where: { id },
    include: { role: true },
  })
  if (!u) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Don't expose password hash. Don't expose admins through this endpoint.
  if (u.role.name === 'ADMIN') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const compensationRecords = await db.compensationRecord.findMany({
    where: { userId: id },
    orderBy: { effectiveDate: 'desc' },
  })
  const currentRate = await getCurrentHourlyRate(id)
  const { state } = await getAgentState(id)

  // Recent attendance (last 14 days).
  const keys = lastNDays(14)
  const events = await db.attendanceEvent.findMany({
    where: { userId: id, businessDate: { in: keys } },
    orderBy: { timestampUtc: 'asc' },
  })
  const byDate = new Map<string, typeof events>()
  for (const e of events) {
    const arr = byDate.get(e.businessDate) ?? []
    arr.push(e)
    byDate.set(e.businessDate, arr)
  }
  const recentAttendance = await Promise.all(
    keys.map(async (key) => {
      const dayEvents = byDate.get(key) ?? []
      const ref = dayEvents.find((e) => e.eventType === 'CLOCK_IN')?.timestampUtc ?? new Date(`${key}T17:00:00Z`)
      const rate = await getHourlyRateAt(id, ref)
      return computeDaySummary(dayEvents, key, rate)
    })
  )
  const sortedRecent = recentAttendance.sort((a, b) => (a.businessDate < b.businessDate ? 1 : -1))

  // Pending correction requests count.
  const pendingCorrections = await db.correctionRequest.count({
    where: { userId: id, status: 'PENDING' },
  })

  return NextResponse.json({
    employee: {
      id: u.id,
      name: u.name,
      employeeId: u.employeeId,
      username: u.username,
      email: u.email,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      isProtected: u.isProtected,
      role: u.role.name,
      createdAt: u.createdAt.toISOString(),
      currentRate,
      currentState: state,
    },
    compensationHistory: compensationRecords.map((r) => ({
      id: r.id,
      hourlyRate: r.hourlyRate,
      effectiveDate: r.effectiveDate.toISOString(),
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    })),
    recentAttendance: sortedRecent.map((d) => ({
      ...d,
      clockInUtc: d.clockInUtc ? d.clockInUtc.toISOString() : null,
      clockOutUtc: d.clockOutUtc ? d.clockOutUtc.toISOString() : null,
    })),
    pendingCorrectionsCount: pendingCorrections,
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if (admin instanceof Response) return admin
  const { id } = await ctx.params

  let parsed: z.infer<typeof PatchBody>
  try {
    parsed = PatchBody.parse(await req.json())
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.issues?.[0]?.message || 'Invalid request.' },
      { status: 400 }
    )
  }

  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Protected accounts cannot be edited by admins.
  if (existing.isProtected) {
    return NextResponse.json(
      { error: 'This account is protected and cannot be edited by an administrator.' },
      { status: 403 }
    )
  }

  // Uniqueness check.
  if (parsed.email || parsed.username || parsed.employeeId) {
    const clash = await db.user.findFirst({
      where: {
        id: { not: id },
        OR: [
          parsed.email ? { email: parsed.email.toLowerCase() } : {},
          parsed.username ? { username: parsed.username.toLowerCase() } : {},
          parsed.employeeId ? { employeeId: parsed.employeeId } : {},
        ].filter((x) => Object.keys(x).length > 0) as any,
      },
    })
    if (clash) {
      const what =
        clash.email === parsed.email?.toLowerCase()
          ? 'email'
          : clash.username === parsed.username?.toLowerCase()
            ? 'username'
            : 'employee ID'
      return NextResponse.json({ error: `${what} already in use.` }, { status: 409 })
    }
  }

  const data: any = {}
  if (parsed.name) data.name = parsed.name
  if (parsed.email) data.email = parsed.email.toLowerCase()
  if (parsed.username) data.username = parsed.username.toLowerCase()
  if (parsed.employeeId) data.employeeId = parsed.employeeId

  const updated = await db.user.update({ where: { id }, data })

  await writeAudit({
    actorId: admin.id,
    targetId: id,
    action: 'EMPLOYEE_UPDATED',
    metadata: { before: existing, after: data },
  })

  try {
    await notifyRealtime({ type: 'employee_updated', userId: id, userName: updated.name })
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, employee: { id: updated.id, name: updated.name } })
}
