/**
 * Agent correction requests page.
 *
 * - List existing requests (PENDING / APPROVED / REJECTED).
 * - Form to submit a new request.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Plus, Send } from 'lucide-react'
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
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatTimeShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AgentCorrectionsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchRequests = useCallback(async () => {
    const res = await fetch('/api/agent/corrections?limit=50')
    if (res.ok) {
      const json = await res.json()
      setRequests(json.requests)
    }
  }, [])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Correction Requests</h1>
          <p className="text-sm text-muted-foreground">
            Report attendance mistakes (forgot to clock in/out, incorrect break, etc.).
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? (
            <>
              <Plus className="h-4 w-4 mr-2 rotate-45" /> Close
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" /> New Request
            </>
          )}
        </Button>
      </div>

      {showForm && <NewRequestForm
        onSubmitted={() => {
          setShowForm(false)
          fetchRequests()
        }}
        submitting={submitting}
        setSubmitting={setSubmitting}
      />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your requests</CardTitle>
          <CardDescription>Reviewed by an administrator.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {requests === null ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No correction requests yet.
            </div>
          ) : (
            <div className="divide-y">
              {requests.map((r) => (
                <div key={r.id} className="p-4 hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={STATUS_BADGE[r.status] || ''}>
                          {r.status}
                        </Badge>
                        <span className="text-sm font-medium">{r.targetDate}</span>
                        <span className="text-xs text-muted-foreground">
                          · {r.requestedChange.replace('_', ' ')}
                        </span>
                        {r.requestedTime && (
                          <span className="text-xs text-muted-foreground">
                            · {formatTimeShort(r.requestedTime)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-2 text-foreground">{r.reason}</p>
                      {r.note && (
                        <p className="text-xs mt-1 text-muted-foreground">Note: {r.note}</p>
                      )}
                      {r.reviewNote && (
                        <p className="text-xs mt-2 italic text-muted-foreground">
                          Admin: {r.reviewNote}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Submitted {formatDateTime(r.createdAt)}
                        {r.reviewedAt && ` · Reviewed ${formatDateTime(r.reviewedAt)}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NewRequestForm({
  onSubmitted,
  submitting,
  setSubmitting,
}: {
  onSubmitted: () => void
  submitting: boolean
  setSubmitting: (b: boolean) => void
}) {
  const [targetDate, setTargetDate] = useState('')
  const [requestedChange, setRequestedChange] = useState('CLOCK_IN')
  const [requestedTime, setRequestedTime] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  // Default date = today (Eastern Time).
  useEffect(() => {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    setTargetDate(todayET)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/agent/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDate,
          requestedChange,
          requestedTime: requestedTime || undefined,
          reason,
          note: note || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to submit request.')
        return
      }
      toast.success('Correction request submitted.')
      setReason('')
      setNote('')
      setRequestedTime('')
      onSubmitted()
    } catch {
      toast.error('Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New correction request</CardTitle>
        <CardDescription>Describe what should have happened and why.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change">Requested change</Label>
              <Select value={requestedChange} onValueChange={setRequestedChange}>
                <SelectTrigger id="change">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLOCK_IN">Clock In</SelectItem>
                  <SelectItem value="CLOCK_OUT">Clock Out</SelectItem>
                  <SelectItem value="BREAK_START">Break Start</SelectItem>
                  <SelectItem value="BREAK_END">Break End</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time (Eastern Time)</Label>
              <Input
                id="time"
                type="time"
                value={requestedTime}
                onChange={(e) => setRequestedTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., I forgot to clock in when I arrived at 8:05 AM."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Additional note (optional)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit request
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
