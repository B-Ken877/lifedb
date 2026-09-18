/**
 * GET /api/agent/attendance/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Returns a CSV of the agent's own attendance records for the range.
 *
 * Columns: Date,Clock In,Clock Out,Break Time,Net Hours,Hourly Rate,Earnings
 * Times use America/New_York (Eastern Time).
 */

import { NextResponse } from 'next/server'
import { requireAgentApi } from '@/lib/session'
import { db } from '@/lib/db'
import { buildCSV, csvResponse, csvTime } from '@/lib/csv'
import { computeDaySummary } from '@/lib/attendance/engine'
import { getHourlyRateAt } from '@/lib/attendance/engine'
import { businessDateKey, lastNDays } from '@/lib/timezone'

export async function GET(req: Request) {
  const user = await requireAgentApi()
  if (user instanceof Response) return user

  const url = new URL(req.url)
  let fromStr = url.searchParams.get('from')
  let toStr = url.searchParams.get('to')

  // Default: last 30 days.
  if (!fromStr || !toStr) {
    const keys = lastNDays(30).reverse()
    fromStr = keys[0]
    toStr = keys[keys.length - 1]
  }

  // Build inclusive list of business date keys between from and to.
  const fromDate = new Date(`${fromStr}T12:00:00Z`)
  const toDate = new Date(`${toStr}T12:00:00Z`)
  const keys: string[] = []
  const cursor = new Date(fromDate)
  while (cursor <= toDate) {
    keys.push(businessDateKey(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  // Fetch events.
  const events = await db.attendanceEvent.findMany({
    where: { userId: user.id, businessDate: { in: keys } },
    orderBy: { timestampUtc: 'asc' },
  })
  const byDate = new Map<string, typeof events>()
  for (const e of events) {
    const arr = byDate.get(e.businessDate) ?? []
    arr.push(e)
    byDate.set(e.businessDate, arr)
  }

  const rows: (string | number)[][] = [
    ['Date', 'Clock In', 'Clock Out', 'Break Time', 'Net Hours', 'Hourly Rate', 'Earnings'],
  ]
  for (const key of keys) {
    const dayEvents = byDate.get(key) ?? []
    if (dayEvents.length === 0) continue
    const ref = dayEvents.find((e) => e.eventType === 'CLOCK_IN')?.timestampUtc ?? new Date(`${key}T17:00:00Z`)
    const rate = await getHourlyRateAt(user.id, ref)
    const summary = computeDaySummary(dayEvents, key, rate)
    rows.push([
      key,
      csvTime(summary.clockInUtc),
      csvTime(summary.clockOutUtc),
      `${summary.breakHours.toFixed(2)}h`,
      summary.netHours.toFixed(2),
      `$${rate.toFixed(2)}`,
      `$${(summary.earningsCents / 100).toFixed(2)}`,
    ])
  }

  const csv = buildCSV(rows)
  return csvResponse(csv, `attendance_${user.employeeId}_${fromStr}_to_${toStr}.csv`)
}
