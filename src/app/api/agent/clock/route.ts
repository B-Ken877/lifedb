/**
 * POST /api/agent/clock
 *
 * Body: { action: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END' }
 *
 * Resolves userId from the session (NEVER from the client).
 * Validates the transition server-side.
 * Records the event, writes audit, and notifies the realtime service.
 *
 * Returns the new state + refreshed today summary.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgentApi } from '@/lib/session'
import { recordEvent, type EventType, type AgentState } from '@/lib/attendance/engine'
import { getTodaySummary, getAgentDashboardData } from '@/lib/attendance/queries'
import { writeAudit } from '@/lib/audit'
import { notifyRealtime } from '@/lib/realtime-server'

const Body = z.object({
  action: z.enum(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']),
})

export async function POST(req: Request) {
  const user = await requireAgentApi()
  if (user instanceof Response) return user

  let parsed: z.infer<typeof Body>
  try {
    parsed = Body.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const action = parsed.action as EventType
  const result = await recordEvent(user.id, action, { source: 'web' })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error?.message ?? 'Invalid transition.', code: result.error?.code },
      { status: 409 }
    )
  }

  await writeAudit({
    actorId: user.id,
    targetId: user.id,
    action: action as any,
    metadata: { at: result.event!.timestampUtc.toISOString(), state: result.state },
  })

  // Notify the realtime mini-service so admin dashboard listeners update.
  try {
    await notifyRealtime({
      type: 'attendance_event',
      userId: user.id,
      userName: user.name,
      eventType: action,
      timestampUtc: result.event!.timestampUtc.toISOString(),
    })
  } catch (e) {
    // Realtime is best-effort; never block the clock-in.
    console.error('[clock] realtime notify failed:', e)
  }

  // Return the refreshed dashboard data so the UI updates immediately.
  const data = await getAgentDashboardData(user.id)
  return NextResponse.json({
    ok: true,
    state: result.state as AgentState,
    action,
    today: data.today,
    dashboard: data,
  })
}
