/**
 * Agent dashboard (server-side data fetch + client-side dashboard component).
 *
 * Fetches everything the agent needs on first paint:
 *  - current state (OFFLINE / WORKING / ON_BREAK)
 *  - today summary
 *  - week summary
 *  - month summary
 *  - hours-by-day (7 days) for the bar chart
 *
 * Passes data to <AgentDashboardClient> which handles the clock actions
 * and the live chart.
 */

import { requireAgent } from '@/lib/session'
import { getAgentDashboardData } from '@/lib/attendance/queries'
import { formatCentsAsUSD } from '@/lib/attendance/engine'
import { AgentDashboardClient } from '@/components/agent/dashboard-client'
import { formatBusinessDate } from '@/lib/timezone'

export default async function AgentDashboardPage() {
  const user = await requireAgent()
  const data = await getAgentDashboardData(user.id)

  const initial = {
    state: data.state,
    lastEventAtUtc: data.lastEventAtUtc ? data.lastEventAtUtc.toISOString() : null,
    today: {
      ...data.today,
      clockInUtc: data.today.clockInUtc ? data.today.clockInUtc.toISOString() : null,
      clockOutUtc: data.today.clockOutUtc ? data.today.clockOutUtc.toISOString() : null,
    },
    currentHourlyRate: data.currentHourlyRate,
    weekTotalNetHours: data.week.totalNetHours,
    weekTotalEarningsCents: data.week.totalEarningsCents,
    monthTotalNetHours: data.month.totalNetHours,
    monthTotalEarningsCents: data.month.totalEarningsCents,
    hoursByDay7: data.hoursByDay7,
    todayDate: formatBusinessDate(new Date(), 'EEEE, MMM d, yyyy'),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{initial.todayDate}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          Hourly rate:{' '}
          <span className="font-semibold text-foreground">
            ${initial.currentHourlyRate.toFixed(2)}/hr
          </span>
        </div>
      </div>

      <AgentDashboardClient initial={initial} />
    </div>
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
