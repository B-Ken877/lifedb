/**
 * Admin payroll page.
 *
 * - Date range picker (default last 30 days).
 * - Table of per-employee payroll summary (employee ID, name, total hours, total earnings).
 * - CSV export button.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Download, Loader2 } from 'lucide-react'

interface Row {
  employeeId: string
  name: string
  username: string
  netHours: number
  breakHours: number
  earningsCents: number
  rate: number
  days: number
}

interface PayrollSummary {
  rows: Row[]
  totalNetHours: number
  totalEarningsCents: number
  totalBreakHours: number
}

function defaultRange() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const from = new Date()
  from.setDate(from.getDate() - 29)
  const fromStr = from.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return { from: fromStr, to: today }
}

export default function AdminPayrollPage() {
  const [range, setRange] = useState(defaultRange)
  const [data, setData] = useState<PayrollSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payroll?from=${range.from}&to=${range.to}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { fetch_() }, [fetch_])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <p className="text-sm text-muted-foreground">Estimated payroll summary by employee.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Date range</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
          <Button onClick={fetch_}>Apply</Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/api/admin/payroll/export?from=${range.from}&to=${range.to}`
            }}
          >
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-employee summary</CardTitle>
          <CardDescription>
            {data ? `Total: ${data.totalNetHours.toFixed(2)}h · $${(data.totalEarningsCents / 100).toFixed(2)}` : '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No attendance in the selected range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Employee ID</th>
                    <th className="px-3 py-2 font-medium text-right">Days</th>
                    <th className="px-3 py-2 font-medium text-right">Break</th>
                    <th className="px-3 py-2 font-medium text-right">Net Hours</th>
                    <th className="px-3 py-2 font-medium text-right">Rate</th>
                    <th className="px-3 py-2 font-medium text-right">Est. Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((r) => (
                    <tr key={r.employeeId} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">{r.employeeId}</td>
                      <td className="px-3 py-2 text-right">{r.days}</td>
                      <td className="px-3 py-2 text-right">{r.breakHours.toFixed(2)}h</td>
                      <td className="px-3 py-2 text-right font-medium">{r.netHours.toFixed(2)}h</td>
                      <td className="px-3 py-2 text-right">${r.rate.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium">${(r.earningsCents / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot className="bg-muted/30 font-semibold">
                    <tr>
                      <td colSpan={3} className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right">{data.totalBreakHours.toFixed(2)}h</td>
                      <td className="px-3 py-2 text-right">{data.totalNetHours.toFixed(2)}h</td>
                      <td></td>
                      <td className="px-3 py-2 text-right">${(data.totalEarningsCents / 100).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
