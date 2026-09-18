/**
 * Admin reports page.
 *
 * - Export CSV buttons for: payroll, attendance records, raw events.
 * - Each opens a date-range form.
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, FileSpreadsheet, FileText, FileBarChart } from 'lucide-react'

function defaultRange() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const from = new Date()
  from.setDate(from.getDate() - 29)
  const fromStr = from.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return { from: fromStr, to: today }
}

interface ReportDef {
  key: string
  title: string
  description: string
  icon: React.ReactNode
  endpoint: string
  columns: string
}

const REPORTS: ReportDef[] = [
  {
    key: 'payroll',
    title: 'Payroll Summary',
    description: 'One row per employee per worked day with net hours, rate, and earnings.',
    icon: <FileBarChart className="h-5 w-5" />,
    endpoint: '/api/admin/payroll/export',
    columns: 'Employee ID, Employee Name, Date, Net Hours, Hourly Rate, Estimated Earnings',
  },
  {
    key: 'attendance',
    title: 'Attendance Records',
    description: 'Per-employee daily attendance with clock in/out, breaks, and earnings.',
    icon: <FileSpreadsheet className="h-5 w-5" />,
    endpoint: '/api/admin/attendance/export',
    columns: 'Employee, Employee ID, Date, Clock In, Clock Out, Break, Net Hours, Rate, Earnings',
  },
  {
    key: 'events',
    title: 'Raw Attendance Events',
    description: 'Every attendance event (immutable ledger) with source and timestamp.',
    icon: <FileText className="h-5 w-5" />,
    endpoint: '/api/admin/events/export',
    columns: 'Employee, Employee ID, Event Type, Timestamp, Source, Created At',
  },
]

export default function AdminReportsPage() {
  const [range] = useState(defaultRange)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Export data as CSV. Times use Eastern Time.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default range</CardTitle>
          <CardDescription>Exports default to the last 30 days. Adjust per report below if needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">From {range.from} to {range.to}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <ReportCard key={r.key} report={r} defaultRange={range} />
        ))}
      </div>
    </div>
  )
}

function ReportCard({ report, defaultRange }: { report: ReportDef; defaultRange: { from: string; to: string } }) {
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
            {report.icon}
          </div>
          <div>
            <CardTitle className="text-base">{report.title}</CardTitle>
            <CardDescription className="text-xs">{report.columns}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{report.description}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <Button
          className="w-full"
          variant="default"
          onClick={() => {
            window.location.href = `${report.endpoint}?from=${from}&to=${to}`
          }}
        >
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </CardContent>
    </Card>
  )
}
