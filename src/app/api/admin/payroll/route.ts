/**
 * GET /api/admin/payroll?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns a per-employee payroll summary for the given range.
 *
 * Output:
 *  - rows: per-employee (name, employeeId, netHours, breakHours, days, rate, earningsCents)
 *  - totalNetHours, totalBreakHours, totalEarningsCents
 *
 * Times in Eastern Time (America/New_York).
 * Money is in integer cents (no float error).
 */

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { computeDaySummary, getHourlyRateAt } from '@/lib/attendance/engine'
import { businessDateKey, lastNDays } from '@/lib/timezone'

export async function GET(req: Request) {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const url = new URL(req.url)
  let fromStr = url.searchParams.get('from')
  let toStr = url.searchParams.get('to')
  if (!fromStr || !toStr) {
    const keys = lastNDays(30).reverse()
    fromStr = keys[0]
    toStr = keys[keys.length - 1]
  }

  const fromDate = new Date(`${fromStr}T12:00:00Z`)
  const toDate = new Date(`${toStr}T12:00:00Z`)
  const keys: string[] = []
  const cursor = new Date(fromDate)
  while (cursor <= toDate) {
    keys.push(businessDateKey(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const agentRole = await db.role.findUnique({ where: { name: 'SURVEY_AGENT' } })
  if (!agentRole) return NextResponse.json({ rows: [], totalNetHours: 0, totalBreakHours: 0, totalEarningsCents: 0 })

  const users = await db.user.findMany({
    where: { roleId: agentRole.id },
    orderBy: { name: 'asc' },
  })

  const rows = []
  let totalNetHours = 0
  let totalBreakHours = 0
  let totalEarningsCents = 0

  for (const u of users) {
    const events = await db.attendanceEvent.findMany({
      where: { userId: u.id, businessDate: { in: keys } },
      orderBy: { timestampUtc: 'asc' },
    })
    if (events.length === 0) continue

    const byDate = new Map<string, typeof events>()
    for (const e of events) {
      const arr = byDate.get(e.businessDate) ?? []
      arr.push(e)
      byDate.set(e.businessDate, arr)
    }

    let empNetHours = 0
    let empBreakHours = 0
    let empEarningsCents = 0
    let daysCount = 0
    let latestRate = 0

    for (const key of keys) {
      const dayEvents = byDate.get(key) ?? []
      if (dayEvents.length === 0) continue
      const ref = dayEvents.find((e) => e.eventType === 'CLOCK_IN')?.timestampUtc ?? new Date(`${key}T17:00:00Z`)
      const rate = await getHourlyRateAt(u.id, ref)
      latestRate = rate
      const summary = computeDaySummary(dayEvents, key, rate)
      if (summary.netHours > 0) {
        daysCount++
        empNetHours += summary.netHours
        empBreakHours += summary.breakHours
        empEarningsCents += summary.earningsCents
      }
    }

    if (empNetHours === 0) continue

    rows.push({
      employeeId: u.employeeId,
      name: u.name,
      username: u.username,
      netHours: Math.round(empNetHours * 10_000) / 10_000,
      breakHours: Math.round(empBreakHours * 10_000) / 10_000,
      earningsCents: empEarningsCents,
      rate: latestRate,
      days: daysCount,
    })

    totalNetHours += empNetHours
    totalBreakHours += empBreakHours
    totalEarningsCents += empEarningsCents
  }

  return NextResponse.json({
    rows,
    totalNetHours: Math.round(totalNetHours * 10_000) / 10_000,
    totalBreakHours: Math.round(totalBreakHours * 10_000) / 10_000,
    totalEarningsCents,
  })
}
