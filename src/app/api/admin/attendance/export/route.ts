/**
 * GET /api/admin/attendance/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns CSV of attendance records for ALL agents in the range:
 * Employee, Employee ID, Date, Clock In, Clock Out, Break, Net Hours, Hourly Rate, Earnings
 *
 * Hardening: from/to must be valid YYYY-MM-DD; range capped at 366 days
 * to prevent self-DoS via enormous ranges.
 */

import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { buildCSV, csvResponse, csvTime } from '@/lib/csv'
import { computeDaySummary, getHourlyRateAt } from '@/lib/attendance/engine'
import { boundedDateRange } from '@/lib/http'

export async function GET(req: Request) {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const url = new URL(req.url)
  const range = boundedDateRange(
    url.searchParams.get('from'),
    url.searchParams.get('to'),
    { maxSpanDays: 366, defaultDays: 30 }
  )
  if ('error' in range) {
    return csvResponse(`error,${range.error}\n`, 'error.csv', 400)
  }
  const { keys } = range
  const fromStr = url.searchParams.get('from') ?? keys[0]
  const toStr = url.searchParams.get('to') ?? keys[keys.length - 1]

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
      // Parity with payroll/export: skip days with no net hours worked.
      if (summary.netHours === 0) continue
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
