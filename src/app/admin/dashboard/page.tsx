/**
 * Admin dashboard page.
 *
 * Server-rendered initial data + client-side realtime updates.
 * Realtime notifications (via socket.io) trigger a refetch of
 * /api/admin/dashboard. The DB is always the source of truth.
 */

import { requireAdmin } from '@/lib/session'
import { getAdminDashboardStats } from '@/lib/attendance/queries'
import { AdminDashboardClient } from '@/components/admin/dashboard-client'

export default async function AdminDashboardPage() {
  await requireAdmin()
  const stats = await getAdminDashboardStats()

  const initial = {
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
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time view of workforce attendance.</p>
      </div>
      <AdminDashboardClient initial={initial} />
    </div>
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
