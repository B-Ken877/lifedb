/**
 * Admin attendance page.
 *
 * - Company-wide attendance view.
 * - Per-employee summary for a chosen date.
 * - CSV export of attendance records.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Download, Loader2 } from 'lucide-react'

interface Row {
  id: string
  name: string
  employeeId: string
  state: 'OFFLINE' | 'WORKING' | 'ON_BREAK'
  todayClockInUtc: string | null
  todayClockOutUtc: string | null
  todayBreakHours: number
  todayNetHours: number
  todayEarningsCents: number
  hourlyRate: number
  active: boolean
}

interface Stats {
  workingCount: number
  onBreakCount: number
  offlineCount: number
  todayTotalNetHours: number
  todayEstimatedPayrollCents: number
  rows: Row[]
  recentActivity: any[]
  fetchedAt: string
}

const STATE_BADGE: Record<string, string> = {
  WORKING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ON_BREAK: 'bg-amber-100 text-amber-700 border-amber-200',
  OFFLINE: 'bg-muted text-muted-foreground border-border',
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminAttendancePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const from = new Date()
    from.setDate(from.getDate() - 29)
    return { from: from.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), to: today }
  })

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/dashboard', { cache: 'no-store' })
      if (res.ok) setStats(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">Company-wide attendance for today.</p>
        </div>
        <Button variant="outline" onClick={() => {
          window.location.href = `/api/admin/attendance/export?from=${range.from}&to=${range.to}`
        }}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            {range.from} → {range.to}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today — all agents</CardTitle>
          <CardDescription>
            {stats ? `${stats.workingCount} working · ${stats.onBreakCount} on break · ${stats.offlineCount} offline · ${stats.todayTotalNetHours.toFixed(1)}h total · $${(stats.todayEstimatedPayrollCents / 100).toFixed(2)}` : '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading || !stats ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : stats.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No employees.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Employee ID</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Clock In</th>
                    <th className="px-3 py-2 font-medium">Clock Out</th>
                    <th className="px-3 py-2 font-medium text-right">Break</th>
                    <th className="px-3 py-2 font-medium text-right">Net</th>
                    <th className="px-3 py-2 font-medium text-right">Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">{r.employeeId}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={STATE_BADGE[r.state]}>
                          {r.state.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{fmtTime(r.todayClockInUtc)}</td>
                      <td className="px-3 py-2">{fmtTime(r.todayClockOutUtc)}</td>
                      <td className="px-3 py-2 text-right">{r.todayBreakHours.toFixed(2)}h</td>
                      <td className="px-3 py-2 text-right font-medium">{r.todayNetHours.toFixed(2)}h</td>
                      <td className="px-3 py-2 text-right">${(r.todayEarningsCents / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
