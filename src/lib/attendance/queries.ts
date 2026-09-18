/**
 * Attendance queries — DB access layer built on top of the engine.
 *
 * All public functions take a userId resolved from the session (never trust
 * the client). Hourly rates are resolved server-side via CompensationRecord.
 */

import { db } from '@/lib/db'
import {
  computeDaySummary,
  getHourlyRateAt,
  type AgentState,
  type DaySummary,
  type EventType,
} from '@/lib/attendance/engine'
import { getAgentState } from '@/lib/attendance/engine'
import {
  businessDateKey,
  currentMonthRange,
  currentWeekRange,
  lastNDays,
  toBusinessTime,
  formatBusinessTime,
  formatBusinessDate,
} from '@/lib/timezone'

// =====================================================
// Single-day summary (resolves hourly rate server-side)
// =====================================================

export async function getDaySummary(userId: string, businessDate: string): Promise<DaySummary> {
  const events = await db.attendanceEvent.findMany({
    where: { userId, businessDate },
    orderBy: { timestampUtc: 'asc' },
  })

  // Resolve hourly rate as of the day's CLOCK_IN time (or 12:00 ET that day).
  const refInstant =
    events.find((e) => e.eventType === 'CLOCK_IN')?.timestampUtc ?? new Date(`${businessDate}T17:00:00Z`)
  const rate = await getHourlyRateAt(userId, refInstant)

  return computeDaySummary(events, businessDate, rate)
}

// =====================================================
// Range summaries (week / month / arbitrary range)
// =====================================================

export interface RangeSummary {
  totalNetHours: number
  totalBreakHours: number
  totalEarningsCents: number
  days: DaySummary[]
}

export async function getRangeSummary(
  userId: string,
  dateKeys: string[]
): Promise<RangeSummary> {
  // Fetch all events for the range in one query.
  const events = await db.attendanceEvent.findMany({
    where: { userId, businessDate: { in: dateKeys } },
    orderBy: { timestampUtc: 'asc' },
  })

  // Group by business date.
  const byDate = new Map<string, typeof events>()
  for (const e of events) {
    const arr = byDate.get(e.businessDate) ?? []
    arr.push(e)
    byDate.set(e.businessDate, arr)
  }

  // Resolve hourly rate per date (effective-dated).
  const days: DaySummary[] = []
  for (const dateKey of dateKeys) {
    const dayEvents = byDate.get(dateKey) ?? []
    if (dayEvents.length === 0) {
      // Skip days with no events to keep summaries concise,
      // but only when explicitly requested can caller include zero days.
      // We do include them for continuity in week/month views.
      const rate = await getHourlyRateAt(userId, new Date(`${dateKey}T17:00:00Z`))
      days.push(computeDaySummary([], dateKey, rate))
    } else {
      const refInstant =
        dayEvents.find((e) => e.eventType === 'CLOCK_IN')?.timestampUtc ??
        new Date(`${dateKey}T17:00:00Z`)
      const rate = await getHourlyRateAt(userId, refInstant)
      days.push(computeDaySummary(dayEvents, dateKey, rate))
    }
  }

  const totalNetHours = days.reduce((s, d) => s + d.netHours, 0)
  const totalBreakHours = days.reduce((s, d) => s + d.breakHours, 0)
  const totalEarningsCents = days.reduce((s, d) => s + d.earningsCents, 0)

  return {
    totalNetHours: Math.round(totalNetHours * 10_000) / 10_000,
    totalBreakHours: Math.round(totalBreakHours * 10_000) / 10_000,
    totalEarningsCents,
    days,
  }
}

// =====================================================
// Today / This week / This month shortcuts
// =====================================================

export async function getTodaySummary(userId: string): Promise<DaySummary> {
  return getDaySummary(userId, businessDateKey(new Date()))
}

export async function getWeekSummary(userId: string): Promise<RangeSummary> {
  const { keys } = currentWeekRange()
  return getRangeSummary(userId, keys)
}

export async function getMonthSummary(userId: string): Promise<RangeSummary> {
  const { keys } = currentMonthRange()
  return getRangeSummary(userId, keys)
}

// =====================================================
// Hours-by-day (for the dashboard bar chart)
// =====================================================

export interface HoursByDayPoint {
  dateKey: string
  label: string // e.g. "Mon"
  netHours: number
  earningsCents: number
}

export async function getHoursByDay(userId: string, days: number): Promise<HoursByDayPoint[]> {
  const keys = lastNDays(days).reverse() // oldest first
  const summary = await getRangeSummary(userId, keys)
  return summary.days.map((d) => {
    // Use the date portion of the business date as a Date in business tz.
    const [y, m, dom] = d.businessDate.split('-').map(Number)
    const local = new Date(y, m - 1, dom)
    const label = local.toLocaleDateString('en-US', { weekday: 'short' })
    return {
      dateKey: d.businessDate,
      label,
      netHours: d.netHours,
      earningsCents: d.earningsCents,
    }
  })
}

// =====================================================
// Current state + live "today" combined payload (for agent dashboard)
// =====================================================

export interface AgentDashboardData {
  state: AgentState
  lastEventAtUtc: Date | null
  today: DaySummary
  currentHourlyRate: number
  week: { totalNetHours: number; totalEarningsCents: number }
  month: { totalNetHours: number; totalEarningsCents: number }
  hoursByDay7: HoursByDayPoint[]
}

export async function getAgentDashboardData(userId: string): Promise<AgentDashboardData> {
  const { state, lastEvent } = await getAgentState(userId)
  const today = await getTodaySummary(userId)
  const week = await getWeekSummary(userId)
  const month = await getMonthSummary(userId)
  const hoursByDay7 = await getHoursByDay(userId, 7)
  const currentHourlyRate = await getHourlyRateAt(userId, new Date())

  return {
    state,
    lastEventAtUtc: lastEvent?.timestampUtc ?? null,
    today,
    currentHourlyRate,
    week: { totalNetHours: week.totalNetHours, totalEarningsCents: week.totalEarningsCents },
    month: { totalNetHours: month.totalNetHours, totalEarningsCents: month.totalEarningsCents },
    hoursByDay7,
  }
}

// =====================================================
// Attendance history (paginated by date)
// =====================================================

export interface AttendanceHistoryPage {
  days: DaySummary[]
  cursor: string | null // next businessDate to fetch (older)
  hasMore: boolean
}

export async function getAttendanceHistory(
  userId: string,
  opts: { limit?: number; beforeDate?: string } = {}
): Promise<AttendanceHistoryPage> {
  const limit = Math.min(opts.limit ?? 14, 90)
  const before = opts.beforeDate

  // Find distinct business dates with events, paginated descending.
  const where: any = { userId }
  if (before) where.businessDate = { lt: before }

  const events = await db.attendanceEvent.findMany({
    where,
    orderBy: { businessDate: 'desc' },
    distinct: ['businessDate'],
    take: limit + 1,
    select: { businessDate: true },
  })

  const hasMore = events.length > limit
  const pageDates = events.slice(0, limit).map((e) => e.businessDate)

  const summary = await getRangeSummary(userId, pageDates)
  // Sort descending by date.
  const days = summary.days.sort((a, b) => (a.businessDate < b.businessDate ? 1 : -1))

  return {
    days,
    cursor: hasMore ? pageDates[pageDates.length - 1] : null,
    hasMore,
  }
}

// =====================================================
// Admin: company-wide queries
// =====================================================

export interface AdminEmployeeStatusRow {
  id: string
  name: string
  employeeId: string
  username: string
  state: AgentState
  todayClockInUtc: Date | null
  todayClockOutUtc: Date | null
  todayBreakHours: number
  todayNetHours: number
  todayEarningsCents: number
  hourlyRate: number
  active: boolean
}

export async function getAdminEmployeeStatusRows(): Promise<AdminEmployeeStatusRow[]> {
  // Get all agents (not admins).
  const agentRole = await db.role.findUnique({ where: { name: 'SURVEY_AGENT' } })
  if (!agentRole) return []
  const users = await db.user.findMany({
    where: { roleId: agentRole.id },
    orderBy: { name: 'asc' },
  })

  const today = businessDateKey(new Date())
  const rows: AdminEmployeeStatusRow[] = []

  for (const u of users) {
    const todayEvents = await db.attendanceEvent.findMany({
      where: { userId: u.id, businessDate: today },
      orderBy: { timestampUtc: 'asc' },
    })
    const rate = await getHourlyRateAt(u.id, new Date())
    const summary = computeDaySummary(todayEvents, today, rate)
    const { state } = await getAgentState(u.id)
    rows.push({
      id: u.id,
      name: u.name,
      employeeId: u.employeeId,
      username: u.username,
      state,
      todayClockInUtc: summary.clockInUtc,
      todayClockOutUtc: summary.clockOutUtc,
      todayBreakHours: summary.breakHours,
      todayNetHours: summary.netHours,
      todayEarningsCents: summary.earningsCents,
      hourlyRate: rate,
      active: u.active,
    })
  }

  return rows
}

export interface AdminDashboardStats {
  workingCount: number
  onBreakCount: number
  offlineCount: number
  todayTotalNetHours: number
  todayEstimatedPayrollCents: number
  rows: AdminEmployeeStatusRow[]
  recentActivity: Array<{
    id: string
    userName: string
    eventType: EventType
    timestampUtc: Date
    source: string
  }>
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const rows = await getAdminEmployeeStatusRows()
  const workingCount = rows.filter((r) => r.state === 'WORKING').length
  const onBreakCount = rows.filter((r) => r.state === 'ON_BREAK').length
  const offlineCount = rows.filter((r) => r.state === 'OFFLINE').length

  const todayTotalNetHours = Math.round(rows.reduce((s, r) => s + r.todayNetHours, 0) * 10_000) / 10_000
  const todayEstimatedPayrollCents = rows.reduce((s, r) => s + r.todayEarningsCents, 0)

  // Recent activity: latest 30 attendance events across all agents.
  const recentEvents = await db.attendanceEvent.findMany({
    take: 30,
    orderBy: { timestampUtc: 'desc' },
    include: { user: { select: { name: true } } },
  })
  const recentActivity = recentEvents.map((e) => ({
    id: e.id,
    userName: e.user?.name ?? 'Unknown',
    eventType: e.eventType as EventType,
    timestampUtc: e.timestampUtc,
    source: e.source,
  }))

  return {
    workingCount,
    onBreakCount,
    offlineCount,
    todayTotalNetHours,
    todayEstimatedPayrollCents,
    rows,
    recentActivity,
  }
}
