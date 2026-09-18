/**
 * GET /api/admin/events/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns CSV of raw attendance events for ALL agents:
 * Employee, Employee ID, Event Type, Timestamp, Source, Created At
 */

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/session'
import { db } from '@/lib/db'
import { buildCSV, csvResponse } from '@/lib/csv'
import { formatBusinessDateTime, lastNDays, businessDateKey } from '@/lib/timezone'

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
