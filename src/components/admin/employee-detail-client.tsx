/**
 * Employee detail client.
 *
 * Tabs: Overview | Attendance | Compensation | Activity
 *
 * Actions: Edit info, Reset password, Set rate, Activate/Deactivate, Force password change.
 *
 * All actions use server endpoints with proper audit logging.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Pencil, KeyRound, DollarSign, Power, ShieldAlert, Copy, Check, Loader2, ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export interface EmployeeDetailData {
  employee: {
    id: string
    name: string
    employeeId: string
    username: string
    email: string
    active: boolean
    mustChangePassword: boolean
    role: string
    createdAt: string
    currentRate: number
    currentState: 'OFFLINE' | 'WORKING' | 'ON_BREAK'
  }
  compensationHistory: Array<{
    id: string
    hourlyRate: number
    effectiveDate: string
    note: string | null
    createdBy: string
    createdAt: string
  }>
  recentAttendance: Array<{
    businessDate: string
    clockInUtc: string | null
    clockOutUtc: string | null
    breakHours: number
    netHours: number
    hourlyRate: number
    earningsCents: number
    status: string
  }>
  pendingCorrectionsCount: number
}

const STATE_BADGE: Record<string, string> = {
  WORKING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ON_BREAK: 'bg-amber-100 text-amber-700 border-amber-200',
  OFFLINE: 'bg-muted text-muted-foreground border-border',
}

function fmtTime(iso: string | null) {
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

function fmtTimeOnly(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fmtDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const STATUS_BADGE: Record<string, string> = {
  COMPLETE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  INCOMPLETE: 'bg-amber-100 text-amber-700 border-amber-200',
  NO_EVENTS: 'bg-muted text-muted-foreground border-border',
}

export function EmployeeDetailClient({
  employeeId,
  initial,
}: {
  employeeId: string
  initial: {
    id: string
    name: string
    employeeId: string
    username: string
    email: string
    active: boolean
    mustChangePassword: boolean
    isProtected: boolean
    createdAt: string
  }
}) {
  const [data, setData] = useState<EmployeeDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="space-y-6">
      <Link
        href="/admin/employees"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3 mr-1" /> Back to employees
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{initial.name}</h1>
          <p className="text-sm text-muted-foreground">
            {initial.employeeId} · {initial.username} · {initial.email}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && (
            <Badge variant="outline" className={STATE_BADGE[data.employee.currentState]}>
              {data.employee.currentState}
            </Badge>
          )}
          <Badge variant="outline" className={initial.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground border-border'}>
            {initial.active ? 'Active' : 'Inactive'}
          </Badge>
          {initial.isProtected && (
            <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
              Protected
            </Badge>
          )}
          {initial.mustChangePassword && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              Must change pw
            </Badge>
          )}
        </div>
      </div>

      {initial.isProtected && (
        <div className="rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <strong className="font-semibold">Protected account.</strong>{' '}
          This account cannot be edited, deactivated, rate-changed, or password-reset by an administrator.
          The owner can change their own password via their profile page.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <EditEmployeeDialog employeeId={employeeId} initial={initial} disabled={initial.isProtected} onDone={refresh} />
        <ResetPasswordDialog employeeId={employeeId} disabled={initial.isProtected} onDone={refresh} />
        <SetRateDialog employeeId={employeeId} currentRate={data?.employee.currentRate ?? 0} disabled={initial.isProtected} onDone={refresh} />
        <ForcePasswordChangeButton employeeId={employeeId} disabled={initial.isProtected} onDone={refresh} />
        <ActivateDeactivateButton
          employeeId={employeeId}
          active={initial.active}
          disabled={initial.isProtected}
          onDone={refresh}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="compensation">Compensation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {loading || !data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Info label="Hourly rate" value={`$${data.employee.currentRate.toFixed(2)}/hr`} />
                <Info label="Created" value={fmtTime(data.employee.createdAt)} />
                <Info label="Pending corrections" value={String(data.pendingCorrectionsCount)} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          {loading || !data ? (
            <Skeleton className="h-64 w-full" />
          ) : data.recentAttendance.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No attendance records in the last 14 days.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Clock In</th>
                      <th className="px-3 py-2 font-medium">Clock Out</th>
                      <th className="px-3 py-2 font-medium text-right">Break</th>
                      <th className="px-3 py-2 font-medium text-right">Net Hours</th>
                      <th className="px-3 py-2 font-medium text-right">Rate</th>
                      <th className="px-3 py-2 font-medium text-right">Earnings</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.recentAttendance.map((d) => (
                      <tr key={d.businessDate}>
                        <td className="px-3 py-2">{fmtDateKey(d.businessDate)}</td>
                        <td className="px-3 py-2">{fmtTimeOnly(d.clockInUtc)}</td>
                        <td className="px-3 py-2">{fmtTimeOnly(d.clockOutUtc)}</td>
                        <td className="px-3 py-2 text-right">{d.breakHours.toFixed(2)}h</td>
                        <td className="px-3 py-2 text-right font-medium">{d.netHours.toFixed(2)}h</td>
                        <td className="px-3 py-2 text-right">${d.hourlyRate.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${(d.earningsCents / 100).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={STATUS_BADGE[d.status]}>
                            {d.status.replace('_', ' ')}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="compensation" className="mt-4">
          {loading || !data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Compensation history</CardTitle>
                <CardDescription>Effective-dated hourly rates. Historical records are immutable.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Effective Date</th>
                      <th className="px-3 py-2 font-medium text-right">Rate</th>
                      <th className="px-3 py-2 font-medium">Note</th>
                      <th className="px-3 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.compensationHistory.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          {new Date(r.effectiveDate).toLocaleDateString('en-US', {
                            timeZone: 'America/New_York',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">${r.hourlyRate.toFixed(2)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.note ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtTime(r.createdAt)}</td>
                      </tr>
                    ))}
                    {data.compensationHistory.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                          No compensation records.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

function EditEmployeeDialog({
  employeeId,
  initial,
  disabled,
  onDone,
}: {
  employeeId: string
  initial: any
  disabled?: boolean
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initial.name)
  const [email, setEmail] = useState(initial.email)
  const [employeeIdVal, setEmployeeIdVal] = useState(initial.employeeId)
  const [username, setUsername] = useState(initial.username)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, employeeId: employeeIdVal, username }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || 'Failed to update.')
        return
      }
      toast.success('Employee updated.')
      setOpen(false)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit employee</DialogTitle>
          <DialogDescription>Update profile information.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Employee ID</Label>
            <Input value={employeeIdVal} onChange={(e) => setEmployeeIdVal(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ employeeId, disabled, onDone }: { employeeId: string; disabled?: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tempPassword: string; username: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/reset-password`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || 'Failed to reset password.')
        return
      }
      setResult({ tempPassword: j.temporaryPassword, username: j.username })
      toast.success('Password reset.')
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <KeyRound className="h-4 w-4 mr-2" /> Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Password reset</DialogTitle>
              <DialogDescription>
                Share these credentials securely. The temporary password is shown only once.
                The agent must change it on next login.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
              <div>
                <span className="text-xs text-muted-foreground">Username:</span>{' '}
                <span className="font-mono text-sm">{result.username}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Temporary password:</span>{' '}
                <span className="font-mono text-sm font-semibold">{result.tempPassword}</span>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Username: ${result.username}\nTemporary password: ${result.tempPassword}`
                )
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? 'Copied' : 'Copy credentials'}
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Generate a new temporary password. The agent must change it on next login.
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <AlertTitle>Confirmation</AlertTitle>
              <AlertDescription>
                This will overwrite the current password. The agent will be required to set a new one on next sign-in.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Reset password
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SetRateDialog({
  employeeId,
  currentRate,
  disabled,
  onDone,
}: {
  employeeId: string
  currentRate: number
  disabled?: boolean
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rate, setRate] = useState(String(currentRate.toFixed(2)))
  const [effectiveDate, setEffectiveDate] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Default effective date to today (Eastern Time).
  useEffect(() => {
    if (!effectiveDate) {
      const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      setEffectiveDate(todayET)
    }
  }, [effectiveDate])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hourlyRate: parseFloat(rate),
          effectiveDate,
          note: note || undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || 'Failed to update rate.')
        return
      }
      toast.success('Hourly rate updated.')
      setOpen(false)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <DollarSign className="h-4 w-4 mr-2" /> Set rate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set hourly rate</DialogTitle>
          <DialogDescription>
            A new compensation record will be created. Historical rates are preserved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>New rate (USD/hour)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Effective date</Label>
            <Input
              type="date"
              required
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply rate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ForcePasswordChangeButton({
  employeeId,
  disabled,
  onDone,
}: {
  employeeId: string
  disabled?: boolean
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/force-password-change`, {
        method: 'POST',
      })
      if (!res.ok) {
        toast.error('Failed.')
        return
      }
      toast.success('Agent will be forced to change password on next login.')
      onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={submit} disabled={disabled || busy}>
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
      Force password change
    </Button>
  )
}

function ActivateDeactivateButton({
  employeeId,
  active,
  disabled,
  onDone,
}: {
  employeeId: string
  active: boolean
  disabled?: boolean
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      })
      if (!res.ok) {
        toast.error('Failed.')
        return
      }
      toast.success(active ? 'Agent deactivated.' : 'Agent reactivated.')
      onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button
      variant={active ? 'destructive' : 'default'}
      size="sm"
      onClick={submit}
      disabled={disabled || busy}
    >
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
      {active ? 'Deactivate' : 'Reactivate'}
    </Button>
  )
}
