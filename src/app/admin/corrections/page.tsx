/**
 * Admin corrections page.
 *
 * - List all correction requests across agents.
 * - Filter by status (PENDING / APPROVED / REJECTED).
 * - For each PENDING: Approve (with optional correction application) / Reject.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Check, X, Loader2, Filter } from 'lucide-react'
import { toast } from 'sonner'

interface CorrectionRequest {
  id: string
  targetDate: string
  requestedChange: string
  requestedTime: string | null
  reason: string
  note: string | null
  status: string
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  user: { id: string; name: string; employeeId: string; username: string }
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtTimeShort(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminCorrectionsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[] | null>(null)
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING')

  const fetchRequests = useCallback(async () => {
    setRequests(null)
    const url = filter === 'ALL' ? '/api/admin/corrections' : `/api/admin/corrections?status=${filter}`
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setRequests(j.requests)
    }
  }, [filter])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Correction Requests</h1>
        <p className="text-sm text-muted-foreground">Review attendance correction requests from agents.</p>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      <div className="grid gap-3">
        {requests === null ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No {filter !== 'ALL' ? filter.toLowerCase() : ''} correction requests.
            </CardContent>
          </Card>
        ) : (
          requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status}</Badge>
                      <span className="text-sm font-medium">{r.user.name}</span>
                      <span className="text-xs text-muted-foreground">· {r.user.employeeId}</span>
                      <span className="text-xs text-muted-foreground">· {r.targetDate}</span>
                      <span className="text-xs text-muted-foreground">· {r.requestedChange.replace('_', ' ')}</span>
                      {r.requestedTime && (
                        <span className="text-xs text-muted-foreground">· {fmtTimeShort(r.requestedTime)}</span>
                      )}
                    </div>
                    <p className="text-sm">{r.reason}</p>
                    {r.note && <p className="text-xs text-muted-foreground">Note: {r.note}</p>}
                    {r.reviewNote && (
                      <p className="text-xs italic text-muted-foreground">Admin: {r.reviewNote}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">Submitted {fmtTime(r.createdAt)}</p>
                  </div>

                  {r.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <DecisionDialog
                        request={r}
                        decision="APPROVED"
                        onDone={fetchRequests}
                      />
                      <DecisionDialog
                        request={r}
                        decision="REJECTED"
                        onDone={fetchRequests}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function DecisionDialog({
  request,
  decision,
  onDone,
}: {
  request: CorrectionRequest
  decision: 'APPROVED' | 'REJECTED'
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [applyCorrection, setApplyCorrection] = useState(decision === 'APPROVED')
  const [eventType, setEventType] = useState(request.requestedChange === 'OTHER' ? 'CLOCK_IN' : request.requestedChange)
  const [time, setTime] = useState(request.requestedTime ? request.requestedTime.slice(0, 5) : '')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const body: any = { decision, reviewNote: reviewNote || undefined }
      if (decision === 'APPROVED' && applyCorrection && time) {
        body.applyCorrection = { eventType, time }
      }
      const res = await fetch(`/api/admin/corrections/${request.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || 'Failed to submit decision.')
        return
      }
      toast.success(`Request ${decision.toLowerCase()}.`)
      setOpen(false)
      setReviewNote('')
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={decision === 'APPROVED' ? 'default' : 'destructive'}
        >
          {decision === 'APPROVED' ? <Check className="h-4 w-4 mr-1" /> : <X className="h-4 w-4 mr-1" />}
          {decision === 'APPROVED' ? 'Approve' : 'Reject'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{decision === 'APPROVED' ? 'Approve request' : 'Reject request'}</DialogTitle>
          <DialogDescription>
            From {request.user.name} for {request.targetDate}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Review note (optional)</Label>
            <Textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="e.g., Approved based on verbal confirmation."
            />
          </div>
          {decision === 'APPROVED' && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={applyCorrection}
                  onChange={(e) => setApplyCorrection(e.target.checked)}
                />
                Apply an attendance correction event
              </label>
              {applyCorrection && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Event type</Label>
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLOCK_IN">Clock In</SelectItem>
                        <SelectItem value="CLOCK_OUT">Clock Out</SelectItem>
                        <SelectItem value="BREAK_START">Break Start</SelectItem>
                        <SelectItem value="BREAK_END">Break End</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Time (Eastern)</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} variant={decision === 'APPROVED' ? 'default' : 'destructive'}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm {decision.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
