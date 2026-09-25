/**
 * GET /api/admin/events/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns CSV of raw attendance events for ALL agents:
 * Employee, Employee ID, Event Type, Timestamp, Source, Created At
 *
 * Hardening: from/to must be valid YYYY-MM-DD; range capped at 366 days
 * to prevent self-DoS via enormous ranges.
 */

import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { buildCSV, csvResponse } from '@/lib/csv'
import { formatBusinessDateTime } from '@/lib/timezone'
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

  const events = await db.attendanceEvent.findMany({
    where: { businessDate: { in: keys } },
    orderBy: { timestampUtc: 'desc' },
    include: { user: { select: { name: true, employeeId: true } } },
  })

  const rows: (string | number)[][] = [
    ['Employee', 'Employee ID', 'Event Type', 'Timestamp', 'Source', 'Created At'],
  ]
  for (const e of events) {
    rows.push([
      e.user?.name ?? '—',
      e.user?.employeeId ?? '—',
      e.eventType,
      formatBusinessDateTime(e.timestampUtc),
      e.source,
      formatBusinessDateTime(e.createdAt),
    ])
  }

  return csvResponse(buildCSV(rows), `events_${fromStr}_to_${toStr}.csv`)
}
