/**
 * GET /api/admin/attendance/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns CSV of attendance records for ALL agents in the range:
 * Employee, Employee ID, Date, Clock In, Clock Out, Break, Net Hours, Hourly Rate, Earnings
 */

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { buildCSV, csvResponse, csvTime } from '@/lib/csv'
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
  if (!agentRole) return csvResponse('Employee,Employee ID,Date,Clock In,Clock Out,Break,Net Hours,Hourly Rate,Earnings\n', 'attendance_empty.csv')

  const users = await db.user.findMany({ where: { roleId: agentRole.id }, orderBy: { name: 'asc' } })
  const rows: (string | number)[][] = [
    ['Employee', 'Employee ID', 'Date', 'Clock In', 'Clock Out', 'Break', 'Net Hours', 'Hourly Rate', 'Earnings'],
  ]

  for (const u of users) {
    const events = await db.attendanceEvent.findMany({
      where: { userId: u.id, businessDate: { in: keys } },
      orderBy: { timestampUtc: 'asc' },
    })
    const byDate = new Map<string, typeof events>()
    for (const e of events) {
      const arr = byDate.get(e.businessDate) ?? []
      arr.push(e)
      byDate.set(e.businessDate, arr)
    }
    for (const key of keys) {
      const dayEvents = byDate.get(key) ?? []
      if (dayEvents.length === 0) continue
      const ref = dayEvents.find((e) => e.eventType === 'CLOCK_IN')?.timestampUtc ?? new Date(`${key}T17:00:00Z`)
      const rate = await getHourlyRateAt(u.id, ref)
      const summary = computeDaySummary(dayEvents, key, rate)
      rows.push([
        u.name,
        u.employeeId,
        key,
        csvTime(summary.clockInUtc),
        csvTime(summary.clockOutUtc),
        `${summary.breakHours.toFixed(2)}h`,
        summary.netHours.toFixed(2),
        `$${rate.toFixed(2)}`,
        `$${(summary.earningsCents / 100).toFixed(2)}`,
      ])
    }
  }

  return csvResponse(buildCSV(rows), `attendance_${fromStr}_to_${toStr}.csv`)
}
