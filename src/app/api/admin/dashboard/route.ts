/**
 * GET /api/admin/dashboard
 *
 * Returns real-time admin dashboard stats:
 *  - working/on break/offline counts
 *  - today's total net hours
 *  - today's estimated payroll (cents)
 *  - per-employee status rows
 *  - recent activity feed (latest 30 attendance events)
 *
 * All values come from the database (source of truth).
 */

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/session'
import { getAdminDashboardStats } from '@/lib/attendance/queries'

export async function GET() {
  const user = await requireAdminApi()
  if (user instanceof Response) return user

  const stats = await getAdminDashboardStats()

  return NextResponse.json({
    workingCount: stats.workingCount,
    onBreakCount: stats.onBreakCount,
    offlineCount: stats.offlineCount,
    todayTotalNetHours: stats.todayTotalNetHours,
    todayEstimatedPayrollCents: stats.todayEstimatedPayrollCents,
    rows: stats.rows.map((r) => ({
      ...r,
      todayClockInUtc: r.todayClockInUtc ? r.todayClockInUtc.toISOString() : null,
      todayClockOutUtc: r.todayClockOutUtc ? r.todayClockOutUtc.toISOString() : null,
    })),
    recentActivity: stats.recentActivity.map((a) => ({
      ...a,
      timestampUtc: a.timestampUtc.toISOString(),
    })),
    fetchedAt: new Date().toISOString(),
  })
}
