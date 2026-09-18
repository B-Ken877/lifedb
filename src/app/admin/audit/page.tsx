/**
 * Admin audit log page.
 *
 * - Lists audit entries (paginated).
 * - Filter by action type.
 * - Shows actor, target, action, metadata, timestamp.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface AuditEntry {
  id: string
  action: string
  actorId: string | null
  actorName: string | null
  targetId: string | null
  targetName: string | null
  metadata: string
  createdAt: string
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
}

function formatMetadata(s: string): string {
  try {
    const j = JSON.parse(s)
    return JSON.stringify(j, null, 2)
  } catch {
    return s
  }
}

const ACTION_COLORS: Record<string, string> = {
  EMPLOYEE_CREATED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EMPLOYEE_UPDATED: 'bg-blue-100 text-blue-700 border-blue-200',
  EMPLOYEE_DEACTIVATED: 'bg-red-100 text-red-700 border-red-200',
  EMPLOYEE_REACTIVATED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PASSWORD_RESET: 'bg-amber-100 text-amber-700 border-amber-200',
  FORCE_PASSWORD_CHANGE: 'bg-amber-100 text-amber-700 border-amber-200',
  PASSWORD_CHANGED: 'bg-muted text-muted-foreground border-border',
  RATE_CHANGED: 'bg-blue-100 text-blue-700 border-blue-200',
  ATTENDANCE_CORRECTION_SUBMITTED: 'bg-amber-100 text-amber-700 border-amber-200',
  ATTENDANCE_CORRECTION_APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ATTENDANCE_CORRECTION_REJECTED: 'bg-red-100 text-red-700 border-red-200',
  ATTENDANCE_RECORD_CORRECTED: 'bg-blue-100 text-blue-700 border-blue-200',
  SETTINGS_CHANGED: 'bg-muted text-muted-foreground border-border',
  CLOCK_IN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOCK_OUT: 'bg-red-50 text-red-700 border-red-200',
  BREAK_START: 'bg-amber-50 text-amber-700 border-amber-200',
  BREAK_END: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const ACTIONS = [
  'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'EMPLOYEE_DEACTIVATED', 'EMPLOYEE_REACTIVATED',
  'PASSWORD_RESET', 'FORCE_PASSWORD_CHANGE', 'PASSWORD_CHANGED', 'RATE_CHANGED',
  'ATTENDANCE_CORRECTION_SUBMITTED', 'ATTENDANCE_CORRECTION_APPROVED', 'ATTENDANCE_CORRECTION_REJECTED',
  'ATTENDANCE_RECORD_CORRECTED', 'SETTINGS_CHANGED',
  'CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END',
]

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [action, setAction] = useState<string>('ALL')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const LIMIT = 50

  const fetch_ = useCallback(async () => {
    setEntries(null)
    const url = action === 'ALL'
      ? `/api/admin/audit?limit=${LIMIT}&offset=${offset}`
      : `/api/admin/audit?limit=${LIMIT}&offset=${offset}&action=${action}`
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setEntries(j.entries)
      setTotal(j.total)
    }
  }, [action, offset])

  useEffect(() => {
    setOffset(0)
  }, [action])

  useEffect(() => {
    fetch_()
  }, [fetch_])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Immutable record of all significant actions.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Entries</CardTitle>
              <CardDescription>{total} total</CardDescription>
            </div>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filter by action…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries === null ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No audit entries.</div>
          ) : (
            <div className="divide-y max-h-[700px] overflow-y-auto">
              {entries.map((e) => (
                <div key={e.id} className="p-4 hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={ACTION_COLORS[e.action] || ''}>
                          {e.action.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-sm">
                          {e.actorName ? (
                            <>
                              by <span className="font-medium">{e.actorName}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">by system</span>
                          )}
                        </span>
                        {e.targetName && (
                          <span className="text-sm text-muted-foreground">
                            → <span className="text-foreground">{e.targetName}</span>
                          </span>
                        )}
                      </div>
                      {e.metadata && e.metadata !== '{}' && (
                        <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto">
                          {formatMetadata(e.metadata)}
                        </pre>
                      )}
                      <p className="text-[10px] text-muted-foreground">{fmtTime(e.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {entries && entries.length > 0 && (
            <div className="p-3 border-t flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
