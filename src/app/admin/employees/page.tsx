/**
 * Admin Employees page.
 *
 * - Lists all SURVEY_AGENT accounts with current status + rate.
 * - "Add Agent" dialog (calls /api/admin/employees POST).
 *   On success: shows the generated temporary password ONCE (with copy button).
 * - Search filter by name/employeeId/username.
 * - Click row to navigate to detail.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Plus, Loader2, Search, Copy, Check, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

interface Employee {
  id: string
  name: string
  employeeId: string
  username: string
  email: string
  active: boolean
  mustChangePassword: boolean
  isProtected: boolean
  hourlyRate: number
  createdAt: string
}

const STATE_BADGE: Record<string, string> = {
  true: 'bg-muted text-muted-foreground border-border',
  false: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const fetchEmployees = useCallback(async () => {
    const res = await fetch('/api/admin/employees', { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setEmployees(j.employees)
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const filtered = (employees ?? []).filter((e) => {
    const q = search.toLowerCase()
    return (
      e.name.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q) ||
      e.username.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage agent accounts.</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <AddAgentForm
              onCreated={() => {
                setShowAdd(false)
                fetchEmployees()
              }}
              refreshEmployeesSilently={fetchEmployees}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Agent accounts</CardTitle>
              <CardDescription>{employees?.length ?? '—'} total</CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, or username…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {employees === null ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {employees.length === 0
                ? 'No agent accounts yet. Click "Add Agent" to create the first one.'
                : 'No employees match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Employee ID</th>
                    <th className="px-3 py-2 font-medium">Username</th>
                    <th className="px-3 py-2 font-medium text-right">Rate</th>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/admin/employees/${e.id}`} className="block">
                          <div className="font-medium text-foreground">{e.name}</div>
                          <div className="text-xs text-muted-foreground">{e.email}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/admin/employees/${e.id}`} className="block">
                          {e.employeeId}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{e.username}</td>
                      <td className="px-3 py-2 text-right">${e.hourlyRate.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={STATE_BADGE[String(!e.active)]}>
                          {e.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {e.mustChangePassword && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            Must change pw
                          </Badge>
                        )}
                        {e.isProtected && (
                          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                            Protected
                          </Badge>
                        )}
                      </td>
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

function AddAgentForm({ onCreated, refreshEmployeesSilently }: { onCreated: () => void; refreshEmployeesSilently: () => void }) {
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [hourlyRate, setHourlyRate] = useState('5.00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ tempPassword: string; username: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          employeeId,
          username,
          email,
          hourlyRate: parseFloat(hourlyRate),
          active: true,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to create agent.')
        return
      }
      setCreated({
        tempPassword: json.temporaryPassword,
        username: json.employee.username,
        name: json.employee.name,
      })
      toast.success('Agent account created.')
      // Refresh the employee list silently WITHOUT closing the dialog,
      // so the user can see and copy the temporary password.
      // onCreated() (which closes the dialog) is deferred until the user
      // dismisses the success view via "Create another" or closes the dialog.
      refreshEmployeesSilently()
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            <UserPlus className="inline h-5 w-5 mr-2" />
            Agent created
          </DialogTitle>
          <DialogDescription>
            Provide these credentials to {created.name}. They must change the password on first login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <div>
              <span className="text-xs text-muted-foreground">Username:</span>{' '}
              <span className="font-mono text-sm">{created.username}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Temporary password:</span>{' '}
              <span className="font-mono text-sm font-semibold">{created.tempPassword}</span>
            </div>
          </div>
          <Alert>
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              This temporary password is shown only once. Copy it now and share it securely.
              The agent will be forced to change it on first login.
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              navigator.clipboard.writeText(
                `Username: ${created.username}\nTemporary password: ${created.tempPassword}`
              )
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copied' : 'Copy credentials'}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => {
            // Reset form and close dialog; the parent's onCreated will refresh the list.
            setCreated(null)
            setName('')
            setEmployeeId('')
            setUsername('')
            setEmail('')
            setHourlyRate('5.00')
            onCreated()
          }}>Done</Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <UserPlus className="inline h-5 w-5 mr-2" />
          Add Agent
        </DialogTitle>
        <DialogDescription>
          A temporary password will be generated automatically. The agent must change it on first login.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="emp">Employee ID</Label>
            <Input id="emp" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user">Username</Label>
            <Input id="user" required value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rate">Hourly rate (USD)</Label>
          <Input
            id="rate"
            type="number"
            step="0.01"
            min="0"
            required
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            disabled={busy}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create agent
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
