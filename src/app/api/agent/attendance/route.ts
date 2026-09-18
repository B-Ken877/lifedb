/**
 * GET /api/agent/attendance?hours=N
 *   Returns the agent's hours-by-day chart data for the last N days (7/14/30).
 *
 * GET /api/agent/attendance?before=YYYY-MM-DD&limit=K
 *   Returns the agent's attendance history (paginated, descending).
 *
 * Both require the calling user to be an authenticated SURVEY_AGENT.
 * The userId is taken from the session, never from the client.
 */

import { NextResponse } from 'next/server'
import { requireAgentApi } from '@/lib/session'
import { getHoursByDay, getAttendanceHistory } from '@/lib/attendance/queries'

export async function GET(req: Request) {
  const user = await requireAgentApi()
  if (user instanceof Response) return user

  const url = new URL(req.url)
  const hours = url.searchParams.get('hours')
  const before = url.searchParams.get('before')
  const limit = url.searchParams.get('limit')

  if (hours) {
    const n = parseInt(hours, 10)
    if (![7, 14, 30].includes(n)) {
      return NextResponse.json({ error: 'Invalid hours range.' }, { status: 400 })
    }
    const data = await getHoursByDay(user.id, n)
    return NextResponse.json({ hoursByDay: data })
  }

  const page = await getAttendanceHistory(user.id, {
    limit: limit ? parseInt(limit, 10) : undefined,
    beforeDate: before || undefined,
  })
  return NextResponse.json(page)
}
