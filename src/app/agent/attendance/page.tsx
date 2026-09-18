/**
 * Agent attendance history page.
 *
 * - Default: last 30 days, paginated 14 days at a time.
 * - CSV export button (queries /api/agent/attendance/export).
 * - Each row: Date, Clock In, Clock Out, Break, Net Hours, Rate, Earnings, Status.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Download, Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

interface DaySummary {
  businessDate: string
  clockInUtc: string | null
  clockOutUtc: string | null
  breakHours: number
  netHours: number
  hourlyRate: number
  earningsCents: number
  status: string
}

interface Page {
  days: DaySummary[]
  cursor: string | null
  hasMore: boolean
}

const STATUS_BADGE: Record<string, string> = {
  COMPLETE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  INCOMPLETE: 'bg-amber-100 text-amber-700 border-amber-200',
  NO_EVENTS: 'bg-muted text-muted-foreground border-border',
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AgentAttendancePage() {
  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)

  const fetchPage = useCallback(async (before?: string) => {
    const url = `/api/agent/attendance?limit=14${before ? `&before=${before}` : ''}`
    const res = await fetch(url)
    if (!res.ok) {
      toast.error('Failed to load attendance.')
      return null
    }
    return (await res.json()) as Page
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const p = await fetchPage()
      setPage(p)
      setLoading(false)
    })()
  }, [fetchPage])

  const loadMore = async () => {
    if (!page?.hasMore || !page.cursor) return
    setLoadingMore(true)
    const p = await fetchPage(page.cursor)
    if (p) {
      setPage({
        days: [...page.days, ...p.days],
        cursor: p.cursor,
        hasMore: p.hasMore,
      })
    }
    setLoadingMore(false)
  }

  const exportCsv = () => {
    window.location.href = '/api/agent/attendance/export'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance History</h1>
          <p className="text-sm text-muted-foreground">Your daily attendance records.</p>
        </div>
        <Button onClick={exportCsv} variant="outline">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Records</CardTitle>
          <CardDescription>Times shown in Eastern Time (America/New_York).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !page || page.days.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No attendance records yet. Once you start clocking in, your history will appear here.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Clock In</th>
                      <th className="px-4 py-2 font-medium">Clock Out</th>
                      <th className="px-4 py-2 font-medium text-right">Break</th>
                      <th className="px-4 py-2 font-medium text-right">Net Hours</th>
                      <th className="px-4 py-2 font-medium text-right">Rate</th>
                      <th className="px-4 py-2 font-medium text-right">Earnings</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {page.days.map((d) => (
                      <tr key={d.businessDate} className="hover:bg-muted/30">
                        <td className="px-4 py-3">{formatDateKey(d.businessDate)}</td>
                        <td className="px-4 py-3">{formatTime(d.clockInUtc)}</td>
                        <td className="px-4 py-3">{formatTime(d.clockOutUtc)}</td>
                        <td className="px-4 py-3 text-right">{d.breakHours.toFixed(2)}h</td>
                        <td className="px-4 py-3 text-right font-medium">{d.netHours.toFixed(2)}h</td>
                        <td className="px-4 py-3 text-right">${d.hourlyRate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">${(d.earningsCents / 100).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={STATUS_BADGE[d.status] || ''}
                          >
                            {d.status.replace('_', ' ')}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {page.hasMore && (
                <div className="p-4 border-t text-center">
                  <Button onClick={loadMore} variant="outline" disabled={loadingMore}>
                    {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Load older
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Link
        href="/agent/corrections"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3 mr-1" /> Need to fix a record? Submit a correction request.
      </Link>
    </div>
  )
}
