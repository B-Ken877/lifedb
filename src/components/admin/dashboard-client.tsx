/**
 * Admin dashboard client.
 *
 * - Renders the stat tiles, employee table, and live activity feed.
 * - Uses useRealtimeAdmin hook for socket.io-driven refreshes.
 * - Falls back to 15s polling if realtime is unavailable.
 * - Never trusts realtime payload data — always refetches from the API.
 */

'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useRealtimeAdmin } from '@/lib/realtime-client'
import { Loader2, Wifi, WifiOff, Users, Coffee, UserX, Clock, DollarSign, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmployeeRow {
  id: string
  name: string
  employeeId: string
  username: string
  state: 'OFFLINE' | 'WORKING' | 'ON_BREAK'
  todayClockInUtc: string | null
  todayClockOutUtc: string | null
  todayBreakHours: number
  todayNetHours: number
  todayEarningsCents: number
  hourlyRate: number
  active: boolean
}

interface ActivityItem {
  id: string
  userName: string
  eventType: string
  timestampUtc: string
  source: string
}

interface DashboardData {
  workingCount: number
  onBreakCount: number
  offlineCount: number
  todayTotalNetHours: number
  todayEstimatedPayrollCents: number
  rows: EmployeeRow[]
  recentActivity: ActivityItem[]
  fetchedAt: string
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtHours(h: number) {
  return `${h.toFixed(1)}h`
}

const STATE_BADGE: Record<string, string> = {
  WORKING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ON_BREAK: 'bg-amber-100 text-amber-700 border-amber-200',
  OFFLINE: 'bg-muted text-muted-foreground border-border',
}

const EVENT_LABEL: Record<string, string> = {
  CLOCK_IN: 'clocked in',
  CLOCK_OUT: 'clocked out',
  BREAK_START: 'started break',
  BREAK_END: 'ended break',
}

export function AdminDashboardClient({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/dashboard', { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // ignore network errors silently; the realtime hook will retry
    } finally {
      setRefreshing(false)
    }
  }, [])

  const { connected } = useRealtimeAdmin({ onMessage: refresh })

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <div className="flex items-center justify-end gap-2 text-xs">
        {connected ? (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <Wifi className="h-3 w-3 mr-1" /> Live
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <WifiOff className="h-3 w-3 mr-1" /> Polling (15s)
          </Badge>
        )}
        {refreshing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          title="Working"
          value={data.workingCount}
          icon={<Users className="h-4 w-4" />}
          tone="emerald"
        />
        <StatTile
          title="On Break"
          value={data.onBreakCount}
          icon={<Coffee className="h-4 w-4" />}
          tone="amber"
        />
        <StatTile
          title="Offline"
          value={data.offlineCount}
          icon={<UserX className="h-4 w-4" />}
          tone="muted"
        />
        <StatTile
          title="Today's Hours"
          value={fmtHours(data.todayTotalNetHours)}
          icon={<Clock className="h-4 w-4" />}
          tone="blue"
        />
        <StatTile
          title="Est. Payroll"
          value={fmtMoney(data.todayEstimatedPayrollCents)}
          icon={<DollarSign className="h-4 w-4" />}
          tone="blue"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Employee table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Employees — current status</CardTitle>
            <CardDescription>
              Click a row to view details and attendance history.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Clock In</th>
                    <th className="px-3 py-2 font-medium text-right">Hours</th>
                    <th className="px-3 py-2 font-medium text-right">Earnings</th>
                    <th className="px-3 py-2 font-medium text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 cursor-pointer">
                      <td className="px-3 py-2">
                        <Link href={`/admin/employees/${r.id}`} className="block">
                          <div className="font-medium text-foreground">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.employeeId}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/admin/employees/${r.id}`}>
                          <Badge variant="outline" className={STATE_BADGE[r.state]}>
                            {r.state.replace('_', ' ')}
                          </Badge>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/admin/employees/${r.id}`} className="block">
                          {fmtTime(r.todayClockInUtc)}
                          {r.todayClockOutUtc && (
                            <span className="text-xs text-muted-foreground">
                              {' '}/ {fmtTime(r.todayClockOutUtc)}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/admin/employees/${r.id}`} className="block">
                          {r.todayNetHours.toFixed(2)}h
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/admin/employees/${r.id}`} className="block">
                          {fmtMoney(r.todayEarningsCents)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/admin/employees/${r.id}`} className="block">
                          ${r.hourlyRate.toFixed(2)}
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                        No employees yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Live Activity
            </CardTitle>
            <CardDescription>Latest attendance events.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {data.recentActivity.map((a) => (
                <div key={a.id} className="p-3 hover:bg-muted/30">
                  <p className="text-sm">
                    <span className="font-medium">{a.userName}</span>{' '}
                    <span className="text-muted-foreground">
                      {EVENT_LABEL[a.eventType] || a.eventType.toLowerCase()}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtTime(a.timestampUtc)}</p>
                </div>
              ))}
              {data.recentActivity.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No recent activity.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatTile({
  title,
  value,
  icon,
  tone,
}: {
  title: string
  value: number | string
  icon: React.ReactNode
  tone: 'emerald' | 'amber' | 'muted' | 'blue'
}) {
  const toneClass = {
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    muted: 'text-muted-foreground bg-muted/50',
    blue: 'text-blue-700 bg-blue-50',
  }[tone]
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{title}</p>
          <span className={cn('h-7 w-7 rounded-md flex items-center justify-center', toneClass)}>
            {icon}
          </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
